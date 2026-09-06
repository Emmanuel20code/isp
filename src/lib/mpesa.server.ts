/** Safaricom Daraja (M-Pesa) helpers — server only.
 *
 * All STK pushes on the platform are initiated with the PLATFORM (super admin)
 * Daraja credentials. Tenants only supply their own till/paybill numbers, which
 * are recorded on the transaction for settlement — never used to call Daraja.
 */

export const HOSTS = {
  production: "https://api.safaricom.co.ke",
  sandbox: "https://sandbox.safaricom.co.ke",
} as const;

export type MpesaCredentials = {
  environment: "production" | "sandbox";
  consumerKey: string;
  consumerSecret: string;
  passkey: string;
  shortcode: string;
  shortcodeKind?: "paybill" | "till";
  transactionType: "CustomerPayBillOnline" | "CustomerBuyGoodsOnline";
  tillNumber?: string;
};

/** Platform credentials: database config first, environment secrets as fallback. */
export async function loadPlatformCredentials(client?: unknown): Promise<MpesaCredentials> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = (client as typeof supabaseAdmin) || supabaseAdmin;
  const { data: row } = await db
    .from("platform_mpesa_config")
    .select("environment, consumer_key, consumer_secret, passkey, shortcode, shortcode_kind")
    .maybeSingle();

  let tillNumber = (process.env["MPESA_TILL_NUMBER"] || "").trim();
  try {
    const { data: platform } = await db
      .from("platform_settings")
      .select("saas_till_number")
      .maybeSingle();
    if (platform?.saas_till_number) {
      tillNumber = platform.saas_till_number.trim();
    }
  } catch {
    // optional fallback
  }

  const shortcodeKind = (row?.shortcode_kind || "paybill") as "paybill" | "till";
  const defaultTxnType =
    shortcodeKind === "till" || tillNumber
      ? ("CustomerBuyGoodsOnline" as const)
      : ("CustomerPayBillOnline" as const);

  const creds: MpesaCredentials = {
    environment: (row?.environment as "production" | "sandbox") || "production",
    consumerKey: (row?.consumer_key || process.env["MPESA_CONSUMER_KEY"] || "").trim(),
    consumerSecret: (row?.consumer_secret || process.env["MPESA_CONSUMER_SECRET"] || "").trim(),
    passkey: (row?.passkey || process.env["MPESA_PASSKEY"] || "").trim(),
    shortcode: (row?.shortcode || process.env["MPESA_SHORTCODE"] || "").trim(),
    shortcodeKind,
    transactionType: defaultTxnType,
    tillNumber: tillNumber || undefined,
  };

  const missing = (
    ["consumerKey", "consumerSecret", "passkey", "shortcode"] as (keyof MpesaCredentials)[]
  ).filter((k) => !creds[k]);
  if (missing.length > 0) {
    throw new Error(
      `M-Pesa API is not configured yet. Missing field(s): ${missing.join(", ")}. Please save Daraja details in Super Admin -> Platform M-Pesa.`,
    );
  }
  return creds;
}

function isDarajaSafeBase(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    if (!h || h === "localhost" || h === "127.0.0.1" || h.endsWith(".local")) return false;
    if (!h.includes(".")) return false;
    // Daraja rejects unresolvable fake template hostnames
    if (h.includes("lovable.app") && (h.includes("project--") || h.startsWith("project")))
      return false;
    return true;
  } catch {
    return false;
  }
}

/** Where Safaricom posts payment results. Automatically derived from stored config or current app URL. */
export async function resolveCallbackUrl(
  requestOrigin?: string,
  client?: unknown,
): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = (client as typeof supabaseAdmin) || supabaseAdmin;

  // 1. Try platform settings first (manual override)
  try {
    const { data: platform } = await db
      .from("platform_settings")
      .select("mpesa_callback_url")
      .maybeSingle();
    if (platform?.mpesa_callback_url && isDarajaSafeBase(platform.mpesa_callback_url)) {
      return platform.mpesa_callback_url;
    }
  } catch {
    // optional
  }

  // 2. Try the passed request origin (standard)
  if (requestOrigin && isDarajaSafeBase(requestOrigin)) {
    return `${requestOrigin.replace(/\/+$/, "")}/api/public/mpesa/callback`;
  }

  // 3. Fallback to Supabase Edge Function only if nothing else works (least preferred as it may be on a different project)
  const supabaseUrl =
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "https://bzjvzfrlfplhmmobzhmw.supabase.co";
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/mpesa-callback`;
}

/** Format date as 14-digit YYYYMMDDHHmmss string in East Africa Time (UTC+3) */
export function mpesaTimestamp(now: Date = new Date()): string {
  const eatDate = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${eatDate.getUTCFullYear()}` +
    `${p(eatDate.getUTCMonth() + 1)}` +
    `${p(eatDate.getUTCDate())}` +
    `${p(eatDate.getUTCHours())}` +
    `${p(eatDate.getUTCMinutes())}` +
    `${p(eatDate.getUTCSeconds())}`
  );
}

export async function accessToken(creds: MpesaCredentials): Promise<string> {
  const authUrl = `${HOSTS[creds.environment]}/oauth/v1/generate?grant_type=client_credentials`;
  const basic = btoa(`${creds.consumerKey}:${creds.consumerSecret}`);

  console.log(`[mpesa] Fetching OAuth token from: ${authUrl} (env=${creds.environment})`);

  const res = await fetch(authUrl, {
    method: "GET",
    headers: {
      Authorization: `Basic ${basic}`,
      "Cache-Control": "no-cache",
    },
  });

  const rawText = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(rawText);
  } catch {
    console.error(`[mpesa] Non-JSON response from OAuth (${res.status}):`, rawText);
    throw new Error(
      `M-Pesa OAuth returned invalid response (HTTP ${res.status}): ${rawText.slice(0, 120)}`,
    );
  }

  if (!res.ok || !json["access_token"]) {
    const errorDetail =
      (json["errorMessage"] as string) ||
      (json["error_description"] as string) ||
      (json["error"] as string) ||
      rawText;
    console.error(`[mpesa] OAuth authentication failed (${res.status}):`, errorDetail);
    throw new Error(`M-Pesa OAuth failed (HTTP ${res.status}): ${errorDetail}`);
  }

  console.log(
    `[mpesa] OAuth access token generated successfully (expires in ${json["expires_in"] ?? "3599"}s)`,
  );
  return json["access_token"];
}

export type StkResult = {
  checkoutRequestId: string;
  merchantRequestId: string;
  customerMessage: string;
  responseCode: string;
  responseDescription: string;
};

export async function stkPush(
  params: {
    phone: string;
    amount: number;
    accountReference: string;
    description: string;
    callbackUrl: string;
    transactionType?: "CustomerPayBillOnline" | "CustomerBuyGoodsOnline";
    partyB?: string;
    tillNumber?: string;
  },
  client?: unknown,
): Promise<StkResult> {
  const creds = await loadPlatformCredentials(client);
  const token = await accessToken(creds);

  const timestamp = mpesaTimestamp();

  const transactionType =
    params.transactionType ||
    (params.tillNumber
      ? "CustomerBuyGoodsOnline"
      : creds.transactionType || "CustomerPayBillOnline");
  const partyB = params.tillNumber || params.partyB || creds.tillNumber || creds.shortcode;
  const businessShortCode = creds.shortcode;

  const password = btoa(`${businessShortCode}${creds.passkey}${timestamp}`);

  const amount = Math.max(1, Math.round(params.amount));
  const stkUrl = `${HOSTS[creds.environment]}/mpesa/stkpush/v1/processrequest`;

  // Ensure phone is 254XXXXXXXXX
  let sanitizedPhone = params.phone.replace(/\s+/g, "");
  if (sanitizedPhone.startsWith("0")) {
    sanitizedPhone = "254" + sanitizedPhone.substring(1);
  } else if (sanitizedPhone.startsWith("+")) {
    sanitizedPhone = sanitizedPhone.substring(1);
  } else if (sanitizedPhone.length === 9) {
    sanitizedPhone = "254" + sanitizedPhone;
  }

  const payload = {
    BusinessShortCode: businessShortCode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: transactionType,
    Amount: amount,
    PartyA: sanitizedPhone,
    PartyB: partyB,
    PhoneNumber: sanitizedPhone,
    CallBackURL: params.callbackUrl,
    AccountReference: (params.accountReference || "EMMATECH").slice(0, 12),
    TransactionDesc: (params.description || "Wi-Fi Payment").slice(0, 13),
  };
  console.log(`[mpesa] STK Push payload:`, JSON.stringify(payload, null, 2));

  console.log(`[mpesa] Initiating STK Push to ${stkUrl}`);
  console.log(`[mpesa] STK Push Request Payload (secrets omitted):`, {
    BusinessShortCode: payload.BusinessShortCode,
    TransactionType: payload.TransactionType,
    Amount: payload.Amount,
    PartyA: payload.PartyA,
    PartyB: payload.PartyB,
    PhoneNumber: payload.PhoneNumber,
    CallBackURL: payload.CallBackURL,
    AccountReference: payload.AccountReference,
    TransactionDesc: payload.TransactionDesc,
    Timestamp: payload.Timestamp,
    // Password and Bearer token omitted for security
  });

  let res;
  try {
    res = await fetch(stkUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error(`[mpesa] Network error during STK Push:`, err);
    throw new Error(
      `Failed to connect to Safaricom Daraja API. This is usually due to network issues or an invalid URL in your configuration.`,
    );
  }

  const resText = await res.text();
  console.log(`[mpesa] Daraja STK Push HTTP Status: ${res.status}`);
  console.log(`[mpesa] Daraja STK Push Response Body:`, resText);

  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(resText);
  } catch {
    console.error(`[mpesa] STK Push non-JSON response (${res.status}):`, resText);
    throw new Error(`Daraja API error (${res.status}): ${resText.slice(0, 120)}`);
  }

  const responseCode = String(json["ResponseCode"] ?? json["errorCode"] ?? res.status);
  const responseDesc =
    (json["ResponseDescription"] as string) ??
    (json["errorMessage"] as string) ??
    (json["CustomerMessage"] as string) ??
    "STK Push request failed";

  if (
    !res.ok ||
    (json["ResponseCode"] !== undefined &&
      json["ResponseCode"] !== "0" &&
      json["ResponseCode"] !== "00") ||
    !json["CheckoutRequestID"]
  ) {
    console.error(`[mpesa] STK Push rejected by Daraja [Code ${responseCode}]:`, responseDesc);
    throw new Error(`Payment failed: ${responseDesc} (Code ${responseCode})`);
  }

  console.log(
    `[mpesa] STK Push accepted by Daraja! CheckoutRequestID: ${json["CheckoutRequestID"]}`,
  );

  return {
    checkoutRequestId: json["CheckoutRequestID"]!,
    merchantRequestId: json["MerchantRequestID"] ?? "",
    customerMessage: json["CustomerMessage"] ?? responseDesc ?? "STK push sent to your phone.",
    responseCode,
    responseDescription: responseDesc,
  };
}

/** Quick credential check used by the platform owner's settings screen. */
export async function verifyPlatformCredentials(
  client?: unknown,
): Promise<{ ok: boolean; message: string; details?: Record<string, unknown> }> {
  try {
    const creds = await loadPlatformCredentials(client);
    const token = await accessToken(creds);
    const timestamp = mpesaTimestamp();
    return {
      ok: true,
      message: `Successfully connected to Safaricom Daraja (${creds.environment}). Shortcode: ${creds.shortcode} (${creds.transactionType}). OAuth Token acquired.`,
      details: {
        environment: creds.environment,
        shortcode: creds.shortcode,
        transactionType: creds.transactionType,
        timestamp,
        tokenPrefix: `${token.slice(0, 5)}...`,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to connect to Daraja";
    return { ok: false, message: msg };
  }
}

export async function stkPushQuery(
  checkoutRequestId: string,
  client?: unknown,
): Promise<{ resultCode: string; resultDesc: string; raw: Record<string, unknown> }> {
  try {
    const creds = await loadPlatformCredentials(client);
    const token = await accessToken(creds);
    const timestamp = mpesaTimestamp();
    const password = btoa(`${creds.shortcode}${creds.passkey}${timestamp}`);

    const url = `${HOSTS[creds.environment]}/mpesa/stkpushquery/v1/query`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: creds.shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      }),
    });

    let data: Record<string, unknown> = {};
    try {
      data = await res.json();
    } catch {
      return { resultCode: "pending", resultDesc: "Invalid JSON from Safaricom query", raw: {} };
    }

    if (!res.ok) {
      return {
        resultCode: "pending",
        resultDesc:
          (data.errorMessage as string) ||
          (data.ResultDesc as string) ||
          "Transaction is being processed",
        raw: data,
      };
    }

    const rawCode = String(data.ResultCode ?? "pending");
    const rawDesc = String(data.ResultDesc ?? "");
    const descLower = rawDesc.toLowerCase();

    // Safaricom status codes representing in-flight / processing states
    const isStillProcessing =
      rawCode === "pending" ||
      rawCode === "1001" ||
      rawCode === "1019" ||
      rawCode === "1025" ||
      descLower.includes("processing") ||
      descLower.includes("being processed") ||
      descLower.includes("in process") ||
      descLower.includes("unable to lock") ||
      descLower.includes("pending");

    if (isStillProcessing) {
      return {
        resultCode: "pending",
        resultDesc: rawDesc || "Transaction is being processed",
        raw: data,
      };
    }

    return {
      resultCode: rawCode,
      resultDesc: rawDesc,
      raw: data,
    };
  } catch (err) {
    console.debug(
      `[mpesa] Network connection timeout or error during stkPushQuery:`,
      err instanceof Error ? err.message : err,
    );
    return {
      resultCode: "pending",
      resultDesc: "Network timeout connecting to Safaricom",
      raw: {},
    };
  }
}
