import { btoa } from "buffer";
import { mpesaTimestamp } from "@/lib/mpesa.server";
import { loadPlatformCredentials, accessToken, HOSTS } from "@/lib/mpesa.server";

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
    partyB?: string;
    tillNumber?: string;
    transactionType?: "CustomerPayBillOnline" | "CustomerBuyGoodsOnline";
  },
  client?: unknown,
): Promise<StkResult> {
  // Use master platform Daraja credentials for authentication
  const creds = await loadPlatformCredentials(client);
  const token = await accessToken(creds);

  const timestamp = mpesaTimestamp();

  // If tenant provides a till number or transactionType, use it; otherwise fallback to master default
  const transactionType =
    params.transactionType ||
    (params.tillNumber
      ? "CustomerBuyGoodsOnline"
      : creds.transactionType || "CustomerPayBillOnline");

  // PartyB: Tenant's Till Number or Paybill Number, or fallback to Master Till/Shortcode
  const partyB = params.tillNumber || params.partyB || creds.tillNumber || creds.shortcode;

  // BusinessShortCode: Master Daraja Shortcode
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

  const res = await fetch(stkUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const resText = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(resText);
  } catch {
    throw new Error(`Daraja API error (${res.status}): ${resText.slice(0, 120)}`);
  }

  if (!res.ok || (json["ResponseCode"] !== "0" && json["ResponseCode"] !== "00")) {
    const responseDesc = (json["ResponseDescription"] as string) ?? "STK Push request failed";
    throw new Error(`Payment failed: ${responseDesc}`);
  }

  return {
    checkoutRequestId: json["CheckoutRequestID"]! as string,
    merchantRequestId: (json["MerchantRequestID"] as string) ?? "",
    customerMessage: (json["CustomerMessage"] as string) ?? "STK push sent to your phone.",
    responseCode: String(json["ResponseCode"]),
    responseDescription: (json["ResponseDescription"] as string) ?? "",
  };
}
