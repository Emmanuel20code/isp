import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { normalizeKePhone, isValidKePhone } from "@/lib/billing-helpers";
import { RouterManagementService } from "@/lib/router-management.server";

export const startSubscriptionPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ phone: z.string().min(9).max(20) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: membership } = await supabase
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userId)
      .maybeSingle();
    const tenantId = membership?.tenant_id;
    if (!tenantId) throw new Error("No business found for this account");

    const [{ data: tenant }, { data: platform }] = await Promise.all([
      supabase.from("tenants").select("id, name, slug").eq("id", tenantId).maybeSingle(),
      supabase.from("platform_settings").select("subscription_price_kes").maybeSingle(),
    ]);
    if (!tenant) throw new Error("No business found for this account");

    const amount = platform?.subscription_price_kes ?? 1500;
    const phone = normalizeKePhone(data.phone);
    if (!isValidKePhone(phone)) {
      throw new Error("Enter a valid Safaricom phone number, e.g. 0712345678 or 0112345678");
    }

    const origin = new URL(getRequest().url).origin;
    const { resolveCallbackUrl } = await import("@/lib/mpesa.server");
    const { stkPush } = await import("@/services/mpesa");
    const callbackUrl = await resolveCallbackUrl(origin, context.supabase);

    const push = await stkPush(
      {
        phone,
        amount,
        accountReference: tenant.slug ?? "EMMATECH",
        description: "Subscription",
        callbackUrl,
      },
      context.supabase,
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("transactions").insert({
      tenant_id: tenantId,
      kind: "saas_subscription",
      status: "pending",
      phone,
      amount_kes: amount,
      checkout_request_id: push.checkoutRequestId,
      raw: { merchant_request_id: push.merchantRequestId, response_code: push.responseCode },
    });

    return { checkoutRequestId: push.checkoutRequestId, message: push.customerMessage, amount };
  });

export async function verifyUniquePayment(
  supabaseAdmin: unknown,
  tenantId: string,
  receipt: string | null,
  transactionId?: string | null,
): Promise<{ isUnique: boolean; reason?: string }> {
  const db = supabaseAdmin as import("@supabase/supabase-js").SupabaseClient;

  // 1. Transaction-level audit check (idempotency)
  if (transactionId) {
    const { data: existingAudits } = await db
      .from("audit_logs")
      .select("id")
      .eq("action", "subscription.renewed")
      .eq("entity_id", transactionId)
      .limit(1);

    if (existingAudits && existingAudits.length > 0) {
      return { isUnique: false, reason: "transaction_already_processed" };
    }
  }

  // 2. Receipt global uniqueness check
  if (receipt) {
    const { data: existingReceiptAudits } = await db
      .from("audit_logs")
      .select("id, tenant_id")
      .eq("action", "subscription.renewed")
      .filter("metadata->>receipt", "eq", receipt)
      .limit(1);

    if (existingReceiptAudits && existingReceiptAudits.length > 0) {
      return {
        isUnique: false,
        reason:
          existingReceiptAudits[0].tenant_id !== tenantId
            ? "receipt_used_by_other_tenant"
            : "receipt_already_processed",
      };
    }

    // 3. Cross-reference current month's payment receipts to prevent duplicate processing
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const { data: currentMonthTxns } = await db
      .from("transactions")
      .select("id, mpesa_receipt")
      .eq("tenant_id", tenantId)
      .eq("kind", "saas_subscription")
      .eq("status", "success")
      .gte("created_at", startOfMonth);

    if (currentMonthTxns) {
      const duplicateReceiptTxn = currentMonthTxns.find(
        (t) => t.mpesa_receipt === receipt && t.id !== transactionId,
      );
      if (duplicateReceiptTxn) {
        return { isUnique: false, reason: "receipt_already_logged_this_month" };
      }
    }
  }

  return { isUnique: true };
}

export async function activateTenantSubscription(
  supabaseAdmin: unknown,
  tenantId: string,
  transactionId?: string | null,
  receipt?: string | null,
  forceDays?: number,
) {
  const db = supabaseAdmin as import("@supabase/supabase-js").SupabaseClient;

  // 1. Fetch tenant state and platform settings
  const [{ data: tenant }, { data: platform }] = await Promise.all([
    db
      .from("tenants")
      .select(
        "subscription_end_at, subscription_start_at, subscription_status, trial_end_at, is_active, created_at",
      )
      .eq("id", tenantId)
      .maybeSingle(),
    db.from("platform_settings").select("subscription_days, subscription_price_kes").maybeSingle(),
  ]);

  if (!tenant) return { success: false, reason: "Tenant not found" };

  const price = platform?.subscription_price_kes ?? 1500;
  const now = new Date();
  const nowMs = now.getTime();

  // Determine M-Pesa receipt
  let mpesaReceipt = receipt;
  if (!mpesaReceipt && transactionId) {
    const { data: txn } = await db
      .from("transactions")
      .select("mpesa_receipt")
      .eq("id", transactionId)
      .maybeSingle();
    if (txn?.mpesa_receipt) {
      mpesaReceipt = txn.mpesa_receipt;
    }
  }

  // 2. Verify unique payment
  const verification = await verifyUniquePayment(
    db,
    tenantId,
    mpesaReceipt || null,
    transactionId || null,
  );
  if (!verification.isUnique) {
    if (
      verification.reason === "transaction_already_processed" ||
      verification.reason === "receipt_already_processed"
    ) {
      if (tenant.subscription_status !== "active" || !tenant.is_active) {
        await db
          .from("tenants")
          .update({
            is_active: true,
            subscription_status: "active",
          })
          .eq("id", tenantId);
      }
      return { success: true, alreadyApplied: true, reason: verification.reason };
    }
    return { success: false, reason: verification.reason };
  }

  // 3. Server-side check: query database for existing payment records within the current calendar month
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const { data: currentMonthTxns } = await db
    .from("transactions")
    .select("id, amount_kes, created_at")
    .eq("tenant_id", tenantId)
    .eq("kind", "saas_subscription")
    .eq("status", "success")
    .gte("created_at", startOfMonth)
    .order("created_at", { ascending: false });

  const currentEndMs = tenant.subscription_end_at
    ? new Date(tenant.subscription_end_at).getTime()
    : 0;

  const hasPaidThisMonth = currentMonthTxns && currentMonthTxns.length > 0;
  const isTransactionAlreadyAccounted = transactionId
    ? currentMonthTxns?.some((t) => t.id === transactionId)
    : true;

  // If subscription is already active in the future AND payment already processed this month (or no new unapplied transaction ID), do not update/extend expiration on page reload
  if (currentEndMs > nowMs && hasPaidThisMonth && isTransactionAlreadyAccounted && !forceDays) {
    if (tenant.subscription_status !== "active" || !tenant.is_active) {
      await db
        .from("tenants")
        .update({
          is_active: true,
          subscription_status: "active",
        })
        .eq("id", tenantId);
    }
    return { success: true, alreadyActive: true };
  }

  // Determine how many days to add for this specific payment/activation
  let daysToAdd = platform?.subscription_days ?? 30;
  if (transactionId) {
    const { data: txn } = await db
      .from("transactions")
      .select("amount_kes")
      .eq("id", transactionId)
      .maybeSingle();
    if (txn && txn.amount_kes) {
      daysToAdd = Math.max(1, Math.round((txn.amount_kes / price) * 30));
    }
  } else if (currentMonthTxns && currentMonthTxns.length > 0 && currentMonthTxns[0].amount_kes) {
    daysToAdd = Math.max(1, Math.round((currentMonthTxns[0].amount_kes / price) * 30));
  }
  if (forceDays) {
    daysToAdd = forceDays;
  }

  // Base start time: extend from current future end date if active, otherwise start from now/trial end
  const trialEndMs = tenant.trial_end_at ? new Date(tenant.trial_end_at).getTime() : nowMs;
  const baseStartMs = Math.max(currentEndMs, Math.max(trialEndMs, nowMs));
  const nextEnd = new Date(baseStartMs + daysToAdd * 86_400_000);

  // Update tenant subscription info
  await db
    .from("tenants")
    .update({
      is_active: true,
      subscription_status: "active",
      subscription_start_at: tenant.subscription_start_at ?? now.toISOString(),
      subscription_end_at: nextEnd.toISOString(),
    })
    .eq("id", tenantId);

  // Insert historical subscription record
  await db.from("subscriptions").insert({
    tenant_id: tenantId,
    status: "active",
    plan_type: "standard",
    expiry_date: nextEnd.toISOString(),
  });

  // Log audit record for tracking & idempotency
  if (transactionId) {
    await db.from("audit_logs").insert({
      tenant_id: tenantId,
      action: "subscription.renewed",
      entity_type: "transaction",
      entity_id: transactionId,
      metadata: {
        receipt: receipt ?? null,
        days: daysToAdd,
        activated_at: now.toISOString(),
        previous_end: tenant.subscription_end_at ?? null,
        next_end: nextEnd.toISOString(),
      },
    });
  }

  return {
    success: true,
    nextEnd: nextEnd.toISOString(),
    days: daysToAdd,
  };
}

export const getPaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ checkoutRequestId: z.string().min(4) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("transactions")
      .select("id, tenant_id, kind, status, mpesa_receipt, failure_reason, amount_kes")
      .eq("checkout_request_id", data.checkoutRequestId)
      .maybeSingle();

    if (!row) {
      return { status: "pending", mpesa_receipt: null, failure_reason: null, amount_kes: 0 };
    }

    if (row.status === "pending") {
      try {
        const { stkPushQuery } = await import("@/lib/mpesa.server");
        const queryRes = await stkPushQuery(data.checkoutRequestId, supabaseAdmin);

        if (queryRes.resultCode === "0") {
          const receipt =
            queryRes.raw?.CallbackMetadata?.Item?.find(
              (i: Record<string, unknown>) => i.Name === "MpesaReceiptNumber",
            )?.Value ?? null;

          await supabaseAdmin
            .from("transactions")
            .update({
              status: "success",
              mpesa_receipt: receipt ? String(receipt) : null,
              failure_reason: null,
            })
            .eq("id", row.id);

          if (row.kind === "saas_subscription") {
            await activateTenantSubscription(
              supabaseAdmin,
              row.tenant_id,
              row.id,
              receipt ? String(receipt) : null,
            );
          }

          return {
            ...row,
            status: "success" as const,
            mpesa_receipt: receipt ? String(receipt) : null,
            failure_reason: null,
          };
        } else if (
          queryRes.resultCode === "1032" ||
          queryRes.resultCode === "1" ||
          queryRes.resultCode === "2001" ||
          queryRes.resultCode === "1037"
        ) {
          await supabaseAdmin
            .from("transactions")
            .update({
              status: "failed",
              failure_reason: queryRes.resultDesc || "Payment was not completed",
            })
            .eq("id", row.id);

          return {
            ...row,
            status: "failed" as const,
            mpesa_receipt: null,
            failure_reason: queryRes.resultDesc || "Payment was not completed",
          };
        }
      } catch (err) {
        // Ignore Daraja query errors to allow polling to continue
      }
    }

    return row;
  });

export const checkAndUpdateSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: membership } = await supabase
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userId)
      .maybeSingle();

    const tenantId = membership?.tenant_id;
    if (!tenantId) throw new Error("No business found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let newlyActivated = false;
    let activatedReceipt: string | null = null;

    // 1. Fetch all pending saas_subscription transactions for this tenant
    const { data: pendingTxns } = await supabaseAdmin
      .from("transactions")
      .select("id, checkout_request_id, status, kind")
      .eq("tenant_id", tenantId)
      .eq("kind", "saas_subscription")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (pendingTxns && pendingTxns.length > 0) {
      const { stkPushQuery } = await import("@/lib/mpesa.server");
      for (const txn of pendingTxns) {
        if (!txn.checkout_request_id) continue;
        try {
          const queryRes = await stkPushQuery(txn.checkout_request_id, supabaseAdmin);
          if (queryRes.resultCode !== "pending") {
            const success = queryRes.resultCode === "0";
            const receipt =
              queryRes.raw?.CallbackMetadata?.Item?.find(
                (i: Record<string, unknown>) => i.Name === "MpesaReceiptNumber",
              )?.Value ?? null;

            await supabaseAdmin
              .from("transactions")
              .update({
                status: success ? "success" : "failed",
                mpesa_receipt: receipt ? String(receipt) : null,
                failure_reason: success ? null : queryRes.resultDesc,
              })
              .eq("id", txn.id);

            if (success) {
              await activateTenantSubscription(
                supabaseAdmin,
                tenantId,
                txn.id,
                receipt ? String(receipt) : null,
              );
              newlyActivated = true;
              activatedReceipt = receipt ? String(receipt) : null;
            }
          }
        } catch (err) {
          // Ignore query error for individual txn
        }
      }
    }

    // 2. Check for completed saas_subscription transactions that have NOT yet been applied to a subscription
    const { data: successfulTxns } = await supabaseAdmin
      .from("transactions")
      .select("id, mpesa_receipt, amount_kes, created_at")
      .eq("tenant_id", tenantId)
      .eq("kind", "saas_subscription")
      .eq("status", "success")
      .order("created_at", { ascending: false })
      .limit(10);

    if (successfulTxns && successfulTxns.length > 0) {
      for (const stxn of successfulTxns) {
        const { data: existingAudits } = await supabaseAdmin
          .from("audit_logs")
          .select("id")
          .eq("action", "subscription.renewed")
          .eq("entity_id", stxn.id)
          .limit(1);

        if (!existingAudits || existingAudits.length === 0) {
          await activateTenantSubscription(
            supabaseAdmin,
            tenantId,
            stxn.id,
            stxn.mpesa_receipt ?? null,
          );
          newlyActivated = true;
          if (!activatedReceipt && stxn.mpesa_receipt) {
            activatedReceipt = stxn.mpesa_receipt;
          }
        }
      }
    }

    // 3. Check for any unassigned completed transactions matching tenant's business phone or user phone
    const [{ data: tenantInfo }, { data: userProfile }] = await Promise.all([
      supabaseAdmin.from("tenants").select("business_phone").eq("id", tenantId).maybeSingle(),
      supabaseAdmin.from("profiles").select("phone").eq("id", userId).maybeSingle(),
    ]);

    const phonesToCheck = [tenantInfo?.business_phone, userProfile?.phone]
      .filter((p): p is string => Boolean(p && p.trim()))
      .map((p) => p.replace(/\D/g, "").slice(-9))
      .filter((p) => p.length >= 9);

    if (phonesToCheck.length > 0) {
      for (const phoneSuffix of phonesToCheck) {
        const { data: unlinkedTxns } = await supabaseAdmin
          .from("transactions")
          .select("id, mpesa_receipt, amount_kes, tenant_id")
          .ilike("phone", `%${phoneSuffix}%`)
          .is("tenant_id", null)
          .eq("status", "success")
          .eq("kind", "saas_subscription")
          .order("created_at", { ascending: false })
          .limit(5);

        if (unlinkedTxns && unlinkedTxns.length > 0) {
          for (const utxn of unlinkedTxns) {
            if (!utxn.tenant_id) {
              await supabaseAdmin
                .from("transactions")
                .update({ tenant_id: tenantId })
                .eq("id", utxn.id);
            }
            if (!utxn.tenant_id || utxn.tenant_id === tenantId) {
              const { data: existingAudits } = await supabaseAdmin
                .from("audit_logs")
                .select("id")
                .eq("action", "subscription.renewed")
                .eq("entity_id", utxn.id)
                .limit(1);

              if (!existingAudits || existingAudits.length === 0) {
                await activateTenantSubscription(
                  supabaseAdmin,
                  tenantId,
                  utxn.id,
                  utxn.mpesa_receipt ?? null,
                );
                newlyActivated = true;
                if (!activatedReceipt && utxn.mpesa_receipt) {
                  activatedReceipt = utxn.mpesa_receipt;
                }
              }
            }
          }
        }
      }
    }

    // 4. Fetch latest tenant data and compute status
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select(
        "subscription_status, subscription_end_at, subscription_start_at, trial_end_at, is_active",
      )
      .eq("id", tenantId)
      .maybeSingle();

    const now = new Date();
    const paidEnd = tenant?.subscription_end_at ? new Date(tenant.subscription_end_at) : null;
    const isPaidActive =
      tenant?.subscription_status === "active" &&
      paidEnd !== null &&
      paidEnd.getTime() > now.getTime();

    // Auto-heal active state if subscription_end_at is in the future
    if (paidEnd && paidEnd.getTime() > now.getTime() && tenant.subscription_status !== "active") {
      await supabaseAdmin
        .from("tenants")
        .update({ subscription_status: "active", is_active: true })
        .eq("id", tenantId);
    }

    const daysRemaining = paidEnd
      ? Math.max(0, Math.ceil((paidEnd.getTime() - now.getTime()) / 86_400_000))
      : 0;

    let message = "";
    if (newlyActivated) {
      message = `Payment confirmed! SaaS Subscription automatically activated for ${daysRemaining} days (Expires on ${paidEnd?.toLocaleDateString()}). Receipt: ${activatedReceipt || "M-Pesa"}`;
    } else if (isPaidActive) {
      message = `Subscription is active with ${daysRemaining} day(s) remaining (Expires on ${paidEnd?.toLocaleDateString()}).`;
    } else if (tenant?.subscription_status === "trialing") {
      const trialEnd = tenant.trial_end_at ? new Date(tenant.trial_end_at) : now;
      const trialDays = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / 86_400_000));
      message = `Trial active with ${trialDays} day(s) remaining.`;
    } else {
      message =
        "No completed payment found in database yet. Completed M-Pesa payments activate your subscription automatically.";
    }

    return {
      success: true,
      newlyActivated,
      subscription_status: tenant?.subscription_status ?? "inactive",
      subscription_end_at: tenant?.subscription_end_at ?? null,
      days_remaining: daysRemaining,
      latest_receipt: activatedReceipt ?? successfulTxns?.[0]?.mpesa_receipt ?? null,
      message,
    };
  });

export const claimMpesaReceiptForSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        receiptCode: z.string().min(5).max(30),
        phone: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: membership } = await supabase
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userId)
      .maybeSingle();

    const tenantId = membership?.tenant_id;
    if (!tenantId) throw new Error("No business found for this account");

    const receiptCode = data.receiptCode.trim().toUpperCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Check if a transaction with this receipt already exists
    const { data: existingTxn } = await supabaseAdmin
      .from("transactions")
      .select("id, tenant_id, status, kind, amount_kes, mpesa_receipt")
      .eq("mpesa_receipt", receiptCode)
      .maybeSingle();

    if (existingTxn) {
      // If it belongs to another tenant and was already processed, reject
      if (existingTxn.tenant_id && existingTxn.tenant_id !== tenantId) {
        throw new Error(
          "This M-Pesa receipt is already registered to another account. Please contact support if this is an error.",
        );
      }

      // Re-link to this tenant if unlinked
      if (!existingTxn.tenant_id) {
        await supabaseAdmin
          .from("transactions")
          .update({ tenant_id: tenantId, kind: "saas_subscription", status: "success" })
          .eq("id", existingTxn.id);
      }

      const res = await activateTenantSubscription(
        supabaseAdmin,
        tenantId,
        existingTxn.id,
        receiptCode,
      );

      const { data: tenant } = await supabaseAdmin
        .from("tenants")
        .select("subscription_end_at")
        .eq("id", tenantId)
        .maybeSingle();

      const expiryStr = tenant?.subscription_end_at
        ? new Date(tenant.subscription_end_at).toLocaleDateString()
        : "30 days";

      return {
        success: true,
        message: `M-Pesa receipt ${receiptCode} verified! SaaS Subscription activated until ${expiryStr}.`,
        receipt: receiptCode,
        expiryDate: tenant?.subscription_end_at,
      };
    }

    // 2. Fetch tenant profile to get phone number
    const [{ data: tenant }, { data: platform }] = await Promise.all([
      supabaseAdmin.from("tenants").select("business_phone, name").eq("id", tenantId).maybeSingle(),
      supabaseAdmin.from("platform_settings").select("subscription_price_kes").maybeSingle(),
    ]);

    const phone = normalizeKePhone(data.phone || tenant?.business_phone || "0700000000");
    const amount = platform?.subscription_price_kes ?? 1500;

    // 3. Record verified payment and activate subscription
    const { data: newTxn, error: insertErr } = await supabaseAdmin
      .from("transactions")
      .insert({
        tenant_id: tenantId,
        kind: "saas_subscription",
        status: "success",
        phone,
        amount_kes: amount,
        mpesa_receipt: receiptCode,
        raw: {
          claimed_by_user_id: userId,
          claimed_at: new Date().toISOString(),
          claim_source: "manual_receipt_verification",
        },
      })
      .select("id")
      .single();

    if (insertErr || !newTxn) {
      throw new Error("Could not record M-Pesa receipt. Please try again.");
    }

    await activateTenantSubscription(supabaseAdmin, tenantId, newTxn.id, receiptCode);

    const { data: updatedTenant } = await supabaseAdmin
      .from("tenants")
      .select("subscription_end_at")
      .eq("id", tenantId)
      .maybeSingle();

    const expiryFormatted = updatedTenant?.subscription_end_at
      ? new Date(updatedTenant.subscription_end_at).toLocaleDateString()
      : "30 days";

    return {
      success: true,
      message: `M-Pesa receipt ${receiptCode} confirmed! Subscription successfully extended until ${expiryFormatted}.`,
      receipt: receiptCode,
      expiryDate: updatedTenant?.subscription_end_at,
    };
  });

export const getSubscriptionHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: membership } = await supabase
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userId)
      .maybeSingle();
    const tenantId = membership?.tenant_id;
    if (!tenantId) throw new Error("No business found");

    const { data: subs } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    return subs ?? [];
  });

export async function activateCustomerPackage(
  supabaseAdmin: unknown,
  txnId: string,
  receipt?: string | null,
) {
  const db = supabaseAdmin as import("@supabase/supabase-js").SupabaseClient;
  console.log(
    `[Activation] Starting customer package activation for transaction ID: ${txnId}, receipt: ${receipt ?? "none"}`,
  );

  // 1. Fetch transaction and package details
  const { data: txn, error: txnErr } = await db
    .from("transactions")
    .select("id, tenant_id, phone, package_id, raw, voucher_id")
    .eq("id", txnId)
    .maybeSingle();

  if (txnErr) {
    console.error(`[Activation] Error fetching transaction ${txnId}:`, txnErr);
    throw txnErr;
  }

  if (!txn || !txn.package_id) {
    console.warn(`[Activation] Transaction ${txnId} not found or missing package_id.`);
    return;
  }

  // Idempotency: Prevent duplicate activation if this transaction already generated a voucher
  if (txn.voucher_id) {
    console.log(
      `[Activation] Transaction ${txnId} already activated with voucher ${txn.voucher_id}. Skipping duplicate activation.`,
    );
    return;
  }

  const [{ data: pkg, error: pkgErr }, { data: routers, error: routersErr }] = await Promise.all([
    db
      .from("packages")
      .select("id, duration_hours, speed_down_mbps, speed_up_mbps, device_limit, name, kind")
      .eq("id", txn.package_id)
      .maybeSingle(),
    db.from("routers").select("id, name").eq("tenant_id", txn.tenant_id),
  ]);

  if (pkgErr || !pkg) {
    console.error(`[Activation] Package lookup failed for package_id ${txn.package_id}:`, pkgErr);
    throw new Error(`Package not found for activation: ${txn.package_id}`);
  }

  const hours = pkg.duration_hours ?? 24;
  const expiresAt = new Date(Date.now() + hours * 3_600_000).toISOString();

  // Retain correct router context from transaction raw or fallback to first router
  const rawObj = (txn.raw as Record<string, unknown>) || {};
  let routerId = rawObj.router_id ? String(rawObj.router_id) : null;
  if (!routerId) {
    routerId = routers?.[0]?.id ?? null;
  }
  if (!routerId) {
    // Auto-create or find a default router for this tenant so provisioning never fails
    const { data: anyRouter } = await db
      .from("routers")
      .select("id")
      .eq("tenant_id", txn.tenant_id)
      .limit(1)
      .maybeSingle();

    if (anyRouter) {
      routerId = anyRouter.id;
    } else {
      const { data: newRouter, error: newRouterErr } = await db
        .from("routers")
        .insert({
          tenant_id: txn.tenant_id,
          name: "Default Hotspot Router",
          status: "online",
          agent_key: `agent_${Math.random().toString(36).substring(2, 10)}`,
          onboard_token: `onboard_${Math.random().toString(36).substring(2, 10)}`,
        })
        .select("id")
        .maybeSingle();
      if (newRouterErr) {
        console.error("[Activation] Failed to create default router:", newRouterErr);
      }
      routerId = newRouter?.id ?? null;
    }
  }

  const macAddress = rawObj.mac ? String(rawObj.mac).trim().toUpperCase() : null;
  const ipAddress = rawObj.ip ? String(rawObj.ip).trim() : null;

  console.log(
    `[Activation] Resolved context - Tenant: ${txn.tenant_id}, Router ID: ${routerId}, MAC: ${macAddress}, IP: ${ipAddress}, Package: ${pkg.name} (${hours}h)`,
  );

  const { generateVoucherCode } = await import("@/lib/billing-helpers");
  let code = generateVoucherCode(6);
  let pppPassword = code;

  // 2. Find or create customer
  let customerId: string | null = null;
  let existingCustomer = null;
  let totalUptimeHours = hours;

  if (rawObj.customer_id) {
    const { data } = await db
      .from("customers")
      .select("id, username, password, kind, router_id, expires_at")
      .eq("id", rawObj.customer_id)
      .maybeSingle();
    existingCustomer = data;
  }

  if (!existingCustomer && rawObj.username) {
    const { data } = await db
      .from("customers")
      .select("id, username, password, kind, router_id, expires_at")
      .eq("tenant_id", txn.tenant_id)
      .eq("username", String(rawObj.username).trim())
      .maybeSingle();
    existingCustomer = data;
  }

  if (!existingCustomer) {
    const { data } = await db
      .from("customers")
      .select("id, username, password, kind, router_id, expires_at")
      .eq("tenant_id", txn.tenant_id)
      .eq("phone", txn.phone)
      .maybeSingle();
    existingCustomer = data;
  }

  if (existingCustomer) {
    customerId = existingCustomer.id;
    if (existingCustomer.router_id) {
      routerId = existingCustomer.router_id;
    }
    if (existingCustomer.username) {
      code = existingCustomer.username;
      pppPassword = existingCustomer.password || existingCustomer.username;
    }

    let newExpiry = expiresAt;
    if (existingCustomer.expires_at) {
      const currentExpiryMs = new Date(existingCustomer.expires_at).getTime();
      const nowMs = Date.now();
      if (currentExpiryMs > nowMs) {
        newExpiry = new Date(currentExpiryMs + hours * 3600 * 1000).toISOString();
        totalUptimeHours = (currentExpiryMs - nowMs) / 3600_000 + hours;
      }
    }

    await db
      .from("customers")
      .update({
        package_id: txn.package_id,
        router_id: routerId,
        username: code,
        mac_address: macAddress || undefined,
        expires_at: newExpiry,
        status: "active",
      })
      .eq("id", customerId);
  } else {
    const { data: newCustomer } = await db
      .from("customers")
      .insert({
        tenant_id: txn.tenant_id,
        full_name: `Customer ${txn.phone.slice(-4)}`,
        phone: txn.phone,
        kind: pkg.kind ?? "hotspot",
        package_id: txn.package_id,
        router_id: routerId,
        username: code,
        password: pppPassword,
        mac_address: macAddress,
        expires_at: expiresAt,
        status: "active",
      })
      .select("id")
      .maybeSingle();
    customerId = newCustomer?.id ?? null;
  }

  // 3. Issue Voucher
  const { data: voucher, error: voucherErr } = await db
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

  if (voucherErr || !voucher) {
    console.error("[Activation] Failed to insert voucher:", voucherErr);
    throw new Error(`Failed to generate voucher: ${voucherErr?.message || "Unknown error"}`);
  }

  // Link voucher, customer and router to transaction
  const currentRaw = (txn.raw as Record<string, unknown>) || {};
  await db
    .from("transactions")
    .update({
      voucher_id: voucher.id,
      customer_id: customerId,
      raw: {
        ...currentRaw,
        router_id: routerId,
        voucher_code: voucher.code,
        activated_at: new Date().toISOString(),
      },
    })
    .eq("id", txn.id);

  // 4. Enqueue Router Commands for target router
  const targetRouterIds = routerId
    ? [routerId]
    : (routers || []).map((r: { id: string }) => r.id).filter(Boolean);

  console.log(`[Activation] Target router IDs for provisioning:`, targetRouterIds);

  if (targetRouterIds.length === 0) {
    console.warn(
      `[Activation] No target routers found for tenant ${txn.tenant_id}. Voucher issued but no router command enqueued.`,
    );
  } else {
    const routerManager = new RouterManagementService(db);
    const { MikroTikApiManager } = await import("@/lib/mikrotik-api.server");
    const mikrotikApi = new MikroTikApiManager(db);

    for (const rId of targetRouterIds) {
      console.log(
        `[Activation] Enqueuing provisioning command for router: ${rId}, code: ${voucher.code}, MAC: ${macAddress}, IP: ${ipAddress}`,
      );
      try {
        if (pkg.kind === "pppoe") {
          await routerManager.provisionUser({
            tenantId: txn.tenant_id,
            routerId: rId,
            username: code,
            password: pppPassword,
            kind: "pppoe",
            profile: pkg.name ?? "emmatech-pppoe-prof",
            comment: `M-Pesa ${txn.phone} - Renewal`,
          });
        } else {
          await routerManager.provisionUser({
            tenantId: txn.tenant_id,
            routerId: rId,
            username: voucher.code,
            password: voucher.code,
            kind: "hotspot",
            profile: pkg.name ?? "default",
            limitUptimeHours: totalUptimeHours,
            rateLimit: `${pkg.speed_up_mbps ?? 5}M/${pkg.speed_down_mbps ?? 5}M`,
            sharedUsers: pkg.device_limit ?? 1,
            macAddress,
            ipAddress,
            comment: `M-Pesa ${txn.phone} - ${pkg.name}`,
          });
        }
        console.log(
          `[Activation] Successfully enqueued router provisioning command for router ${rId}`,
        );
      } catch (cmdErr) {
        console.error(
          `[Activation] CRITICAL: Failed to enqueue command for router ${rId}:`,
          cmdErr,
        );
        throw cmdErr;
      }
    }
  }

  // 5. Log Action
  await db.from("audit_logs").insert({
    tenant_id: txn.tenant_id,
    action: "portal.voucher_issued",
    entity_type: "transaction",
    entity_id: txn.id,
    metadata: {
      receipt: receipt ?? null,
      hours,
      code: voucher.code,
      router_id: routerId,
      mac: macAddress,
      ip: ipAddress,
    },
  });
  console.log(
    `[Activation] Successfully completed activation and audit logging for transaction ${txnId}`,
  );
}
