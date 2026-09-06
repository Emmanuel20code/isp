// Supabase Edge Function: mpesa-callback
// Dedicated M-Pesa Callback (Webhook) listener for Captive Portal package purchases and customer internet access.
// Parses Daraja STK Push and C2B responses, marks transaction as 'success' (completed), updates customer and voucher to 'active',
// and triggers router access provisioning commands.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

interface CallbackItem {
  Name: string;
  Value?: string | number | null;
}

interface StkCallback {
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResultCode?: number;
  ResultDesc?: string;
  CallbackMetadata?: {
    Item?: CallbackItem[];
  };
}

interface MpesaPayload {
  Body?: {
    stkCallback?: StkCallback;
    stkPushCallback?: StkCallback;
  };
  TransactionType?: string;
  TransID?: string;
  TransTime?: string;
  TransAmount?: string | number;
  BusinessShortCode?: string;
  BillRefNumber?: string;
  MSISDN?: string;
  FirstName?: string;
}

interface TransactionRecord {
  id: string;
  tenant_id: string;
  customer_id?: string | null;
  package_id?: string | null;
  voucher_id?: string | null;
  kind?: string | null;
  status: string;
  phone: string;
  amount_kes: number;
  raw?: Record<string, unknown> | null;
  mpesa_receipt?: string | null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function generateVoucherCode(length = 6): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Safaricom expects a fast 200 OK acknowledgment with ResultCode 0
  const darajaOkResponse = () =>
    new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[mpesa-callback] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return darajaOkResponse();
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const body: MpesaPayload = await req.json().catch(() => ({}));
    console.log("[mpesa-callback] Received webhook payload:", JSON.stringify(body));

    // 1. STK Push Callback Handler
    const stkCallback = body?.Body?.stkCallback || body?.Body?.stkPushCallback;

    if (stkCallback) {
      const checkoutRequestId = stkCallback.CheckoutRequestID;
      const resultCode = stkCallback.ResultCode;
      const resultDesc = stkCallback.ResultDesc || "No description provided";
      const isSuccess = resultCode === 0;

      if (!checkoutRequestId) {
        console.warn("[mpesa-callback] Missing CheckoutRequestID in STK callback");
        return darajaOkResponse();
      }

      // Extract CallbackMetadata fields (Amount, MpesaReceiptNumber, PhoneNumber, TransactionDate)
      const items = stkCallback.CallbackMetadata?.Item || [];
      const meta: Record<string, string | number> = {};
      for (const item of items) {
        if (item?.Name) {
          meta[item.Name] = item.Value ?? "";
          meta[item.Name.toLowerCase()] = item.Value ?? "";
        }
      }

      const mpesaReceipt =
        (meta["MpesaReceiptNumber"] as string) || (meta["mpesareceiptnumber"] as string) || null;

      console.log(
        `[mpesa-callback] Processing STK response for ${checkoutRequestId}: Success=${isSuccess}, Code=${resultCode}, Receipt=${mpesaReceipt}`,
      );

      // Locate matching captive portal transaction record
      const { data: txn, error: txnError } = await supabase
        .from("transactions")
        .select(
          "id, tenant_id, customer_id, package_id, voucher_id, kind, status, phone, amount_kes, raw, mpesa_receipt",
        )
        .eq("checkout_request_id", checkoutRequestId)
        .maybeSingle();

      if (txnError) {
        console.error("[mpesa-callback] Error fetching transaction:", txnError);
      }

      if (!txn) {
        console.warn(
          `[mpesa-callback] No transaction found for checkoutRequestId: ${checkoutRequestId}.`,
        );
        return darajaOkResponse();
      }

      const wasAlreadySuccess = txn.status === "success";

      const newStatus = isSuccess ? "success" : "failed";
      const receiptNumber = mpesaReceipt ?? txn.mpesa_receipt;

      // Update the transaction record immediately in the database
      const rawObj = typeof txn.raw === "object" && txn.raw ? txn.raw : {};
      const updatedRaw = {
        ...rawObj,
        callback_received_at: new Date().toISOString(),
        stk_callback: stkCallback,
        meta,
      };

      const { error: updateError } = await supabase
        .from("transactions")
        .update({
          status: newStatus,
          mpesa_receipt: receiptNumber,
          failure_reason: isSuccess ? null : resultDesc,
          raw: updatedRaw,
        })
        .eq("id", txn.id);

      if (updateError) {
        console.error("[mpesa-callback] Error updating transaction status:", updateError);
      } else {
        console.log(`[mpesa-callback] Transaction ${txn.id} status updated to: ${newStatus}`);
      }

      // If Payment was Successful, trigger captive portal access grant & activate customer package immediately
      if (isSuccess && txn.tenant_id && !wasAlreadySuccess) {
        if (txn.kind === "customer_payment" || txn.package_id) {
          console.log(
            `[mpesa-callback] Activating captive portal internet access for package ID ${txn.package_id}, txn ${txn.id}`,
          );
          await grantCaptivePortalAccess(supabase, txn as TransactionRecord, receiptNumber);
        } else if (txn.kind === "saas_subscription") {
          await grantSaaSSubscription(supabase, txn.tenant_id, txn.id, receiptNumber);
        }
      }

      return darajaOkResponse();
    }

    // 2. Direct C2B Paybill / Buy Goods Notification
    if (body.TransID || body.BillRefNumber) {
      console.log(
        `[mpesa-callback] Processing C2B payload: TransID=${body.TransID}, Ref=${body.BillRefNumber}`,
      );
      await handleC2BNotification(supabase, body);
      return darajaOkResponse();
    }

    return darajaOkResponse();
  } catch (err) {
    console.error("[mpesa-callback] Unhandled error in webhook listener:", err);
    return darajaOkResponse();
  }
});

/**
 * Router Management Module
 * Handles command enqueuing for MikroTik routers.
 */
class RouterManager {
  constructor(private supabase: SupabaseClient) {}

  async enqueueCommand(
    tenantId: string,
    routerId: string,
    action: string,
    payload: Record<string, unknown>,
  ) {
    console.log(`[RouterManager] Enqueuing ${action} for router ${routerId}`);
    const { error } = await this.supabase.from("router_commands").insert({
      tenant_id: tenantId,
      router_id: routerId,
      action,
      payload,
      status: "queued",
    });
    if (error) throw error;
  }

  async provisionHotspotUser(params: {
    tenantId: string;
    routerId: string;
    username: string;
    password?: string;
    profile?: string;
    limitHours?: number;
    rateLimit?: string;
    sharedUsers?: number;
    mac?: string | null;
    comment?: string;
  }) {
    const totalSeconds = Math.floor((params.limitHours || 0) * 3600);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const limitStr = `${h}:${m}:${s}`;

    return this.enqueueCommand(params.tenantId, params.routerId, "hotspot.create_user", {
      username: params.username,
      password: params.password || params.username,
      profile: params.profile || "default",
      limit_uptime_hours: params.limitHours || 0,
      limit_uptime: limitStr,
      rate_limit: params.rateLimit,
      shared_users: params.sharedUsers || 1,
      mac: params.mac,
      comment: params.comment || "WiFiBilling User",
    });
  }

  async provisionPPPoEUser(params: {
    tenantId: string;
    routerId: string;
    username: string;
    password?: string;
    profile?: string;
    comment?: string;
  }) {
    return this.enqueueCommand(params.tenantId, params.routerId, "pppoe.create_user", {
      username: params.username,
      password: params.password || params.username,
      profile: params.profile || "default",
      comment: params.comment || "WiFiBilling PPPoE",
    });
  }
}

/**
 * Captive Portal Access Grant:
 * - Fetches package details (duration, rate limits, kind)
 * - Updates customer status to 'active' and computes new expiration
 * - Issues an 'active' voucher
 * - Enqueues MikroTik router provisioning commands (Hotspot or PPPoE)
 */
async function grantCaptivePortalAccess(
  supabase: SupabaseClient,
  txn: TransactionRecord,
  receipt: string | null,
) {
  const routerManager = new RouterManager(supabase);
  try {
    if (txn.voucher_id) {
      console.log(
        `[mpesa-callback] Transaction ${txn.id} already has voucher_id ${txn.voucher_id}. Skipping duplicate provisioning.`,
      );
      return;
    }
    if (!txn.package_id) {
      console.warn(`[mpesa-callback] Transaction ${txn.id} has no package_id`);
      return;
    }

    const [{ data: pkg }, { data: routers }] = await Promise.all([
      supabase.from("packages").select("*").eq("id", txn.package_id).maybeSingle(),
      supabase
        .from("routers")
        .select("id, name")
        .eq("tenant_id", txn.tenant_id)
        .eq("is_active", true),
    ]);

    if (!pkg) {
      console.warn(`[mpesa-callback] Package ${txn.package_id} not found in database`);
      return;
    }

    const hours = pkg.duration_hours ?? 24;
    const expiresAt = new Date(Date.now() + hours * 3_600_000).toISOString();

    const rawObj = (txn.raw as Record<string, unknown>) || {};
    const routerId = (rawObj.router_id as string | undefined) ?? routers?.[0]?.id ?? null;
    const macAddress = (rawObj.mac as string | undefined) ?? null;

    let code = generateVoucherCode(6);
    let pppPassword = code;

    // 1. Find existing customer by phone or create new customer
    let customerId: string | null = null;
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("id, username, password, kind")
      .eq("tenant_id", txn.tenant_id)
      .eq("phone", txn.phone)
      .maybeSingle();

    if (existingCustomer) {
      customerId = existingCustomer.id;
      if (existingCustomer.kind === "pppoe" && existingCustomer.username) {
        code = existingCustomer.username;
        pppPassword = existingCustomer.password || existingCustomer.username;
      }

      // Update customer state directly to 'active'
      await supabase
        .from("customers")
        .update({
          package_id: txn.package_id,
          router_id: routerId,
          username: code,
          mac_address: macAddress,
          expires_at: expiresAt,
          kind: pkg.kind ?? "hotspot",
          status: "active",
        })
        .eq("id", customerId);
    } else {
      // Create new active customer record
      const { data: newCustomer } = await supabase
        .from("customers")
        .insert({
          tenant_id: txn.tenant_id,
          full_name: `Customer ${String(txn.phone).slice(-4)}`,
          phone: txn.phone,
          kind: pkg.kind ?? "hotspot",
          package_id: txn.package_id,
          router_id: routerId,
          username: code,
          mac_address: macAddress,
          expires_at: expiresAt,
          status: "active",
        })
        .select("id")
        .maybeSingle();

      customerId = newCustomer?.id ?? null;
    }

    // 2. Issue 'active' voucher for instant login on captive portal
    const { data: voucher } = await supabase
      .from("vouchers")
      .insert({
        tenant_id: txn.tenant_id,
        package_id: txn.package_id,
        router_id: routerId,
        code,
        status: "active",
        phone: txn.phone,
        activated_at: new Date().toISOString(),
        expires_at: expiresAt,
      })
      .select("id, code")
      .maybeSingle();

    if (voucher) {
      await supabase
        .from("transactions")
        .update({
          voucher_id: voucher.id,
          customer_id: customerId,
        })
        .eq("id", txn.id);

      await supabase.from("sessions").insert({
        tenant_id: txn.tenant_id,
        customer_id: customerId,
        router_id: routerId,
        package_id: txn.package_id,
        voucher_id: voucher.id,
        username: code,
        mac_address: macAddress,
        status: "ACTIVE",
        expires_at: expiresAt,
        started_at: new Date().toISOString(),
        activated_at: new Date().toISOString(),
      });

      // 3. Enqueue MikroTik router user provisioning commands using RouterManager
      if (routerId) {
        if (pkg.kind === "pppoe") {
          await routerManager.provisionPPPoEUser({
            tenantId: txn.tenant_id,
            routerId,
            username: code,
            password: pppPassword,
            profile: pkg.name ?? "emmatech-pppoe-prof",
            comment: `M-Pesa ${txn.phone} - Renewal`,
          });
        } else {
          await routerManager.provisionHotspotUser({
            tenantId: txn.tenant_id,
            routerId,
            username: voucher.code,
            profile: pkg.name ?? "default",
            limitHours: hours,
            rateLimit: `${pkg.speed_up_mbps ?? 5}M/${pkg.speed_down_mbps ?? 5}M`,
            sharedUsers: pkg.device_limit ?? 1,
            mac: macAddress,
            comment: `M-Pesa ${txn.phone} - ${pkg.name}`,
          });
        }
      }
    }

    // 4. Audit Log
    await supabase.from("audit_logs").insert({
      tenant_id: txn.tenant_id,
      action: "portal.voucher_issued",
      entity_type: "transaction",
      entity_id: txn.id,
      metadata: { receipt: receipt ?? null, hours, code, source: "supabase_edge_function" },
    });

    console.log(
      `[mpesa-callback] Successfully granted portal access for ${txn.phone}, Voucher: ${code}, Status: active`,
    );
  } catch (err) {
    console.error("[mpesa-callback] Error in grantCaptivePortalAccess:", err);
  }
}

/**
 * Handles SaaS Subscription renewals
 */
async function grantSaaSSubscription(
  supabase: SupabaseClient,
  tenantId: string,
  transactionId: string,
  receipt: string | null,
) {
  try {
    const { data: existingAudits } = await supabase
      .from("audit_logs")
      .select("id")
      .eq("action", "subscription.renewed")
      .eq("entity_id", transactionId)
      .limit(1);

    if (existingAudits && existingAudits.length > 0) {
      console.log(
        `[mpesa-callback] SaaS subscription already granted for transaction ${transactionId}`,
      );
      return;
    }

    const [{ data: tenant }, { data: platform }] = await Promise.all([
      supabase
        .from("tenants")
        .select(
          "subscription_end_at, subscription_start_at, subscription_status, trial_end_at, is_active",
        )
        .eq("id", tenantId)
        .maybeSingle(),
      supabase.from("platform_settings").select("subscription_days").maybeSingle(),
    ]);

    if (!tenant) return;

    const days = platform?.subscription_days ?? 30;
    const now = new Date();
    const nowMs = now.getTime();

    const currentEndMs = tenant.subscription_end_at
      ? new Date(tenant.subscription_end_at).getTime()
      : 0;
    const trialEndMs = tenant.trial_end_at ? new Date(tenant.trial_end_at).getTime() : 0;
    const baseMs = Math.max(currentEndMs, trialEndMs, nowMs);
    const nextEnd = new Date(baseMs + days * 86_400_000);

    await supabase
      .from("tenants")
      .update({
        is_active: true,
        subscription_status: "active",
        subscription_start_at: tenant.subscription_start_at ?? now.toISOString(),
        subscription_end_at: nextEnd.toISOString(),
      })
      .eq("id", tenantId);

    await supabase.from("subscriptions").insert({
      tenant_id: tenantId,
      status: "active",
      plan_type: "standard",
      expiry_date: nextEnd.toISOString(),
    });

    await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      action: "subscription.renewed",
      entity_type: "transaction",
      entity_id: transactionId,
      metadata: {
        receipt: receipt ?? null,
        days,
        activated_at: now.toISOString(),
        next_end: nextEnd.toISOString(),
        source: "supabase_edge_function",
      },
    });
  } catch (err) {
    console.error("[mpesa-callback] Error in grantSaaSSubscription:", err);
  }
}

/**
 * Handles C2B Paybill / Buy Goods notifications
 */
async function handleC2BNotification(supabase: SupabaseClient, body: MpesaPayload) {
  try {
    const phone = String(body.MSISDN || "").trim();
    const receipt = String(body.TransID || "").trim();
    const amount = Number(body.TransAmount || 0);
    const billRef = String(body.BillRefNumber || "")
      .trim()
      .toLowerCase();

    if (!phone || !receipt) return;

    const { data: existingTxn } = await supabase
      .from("transactions")
      .select("id, status")
      .eq("mpesa_receipt", receipt)
      .maybeSingle();

    if (existingTxn) return;

    let tenantId: string | null = null;
    if (billRef) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("id")
        .ilike("slug", billRef)
        .maybeSingle();
      if (tenant?.id) tenantId = tenant.id;
    }

    if (!tenantId) {
      const { data: tenantByPhone } = await supabase
        .from("tenants")
        .select("id")
        .ilike("business_phone", `%${phone.slice(-9)}%`)
        .maybeSingle();
      if (tenantByPhone?.id) tenantId = tenantByPhone.id;
    }

    if (!tenantId) return;

    const { data: newTxn } = await supabase
      .from("transactions")
      .insert({
        tenant_id: tenantId,
        kind: "saas_subscription",
        status: "success",
        phone,
        amount_kes: amount,
        mpesa_receipt: receipt,
        raw: { c2b_payload: body },
      })
      .select("id")
      .maybeSingle();

    if (newTxn?.id) {
      await grantSaaSSubscription(supabase, tenantId, newTxn.id, receipt);
    }
  } catch (err) {
    console.error("[mpesa-callback] Error in handleC2BNotification:", err);
  }
}
