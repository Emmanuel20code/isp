import { enqueueRouterCommands } from "@/lib/agent-commands.server";

let lastRunTime = 0;
const MAINTENANCE_INTERVAL_MS = 60 * 1000; // 1 minute rate limit

/**
 * Runs background maintenance tasks to check and process expirations.
 * Rate-limited to run at most once per minute to minimize database overhead.
 */
export async function runBackgroundMaintenance(force = false): Promise<{
  tenantsExpired: number;
  customersExpired: number;
  vouchersExpired: number;
} | null> {
  const nowMs = Date.now();
  if (!force && nowMs - lastRunTime < MAINTENANCE_INTERVAL_MS) {
    return null; // Skipped due to rate-limiting
  }
  lastRunTime = nowMs;

  const results = {
    tenantsExpired: 0,
    customersExpired: 0,
    vouchersExpired: 0,
  };

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowStr = new Date().toISOString();

    // 1. Expire Trials
    const { data: expiredTrials } = await supabaseAdmin
      .from("tenants")
      .select("id, name")
      .eq("subscription_status", "trialing")
      .lt("trial_end_at", nowStr);

    if (expiredTrials && expiredTrials.length > 0) {
      const ids = expiredTrials.map((t) => t.id);
      const { error: trialErr } = await supabaseAdmin
        .from("tenants")
        .update({ subscription_status: "expired" })
        .in("id", ids);

      if (!trialErr) {
        results.tenantsExpired += ids.length;
        // Log auditing info
        for (const tenant of expiredTrials) {
          await supabaseAdmin.from("audit_logs").insert({
            tenant_id: tenant.id,
            action: "saas.trial_expired",
            entity_type: "tenant",
            entity_id: tenant.id,
            metadata: { name: tenant.name },
          });
        }
      }
    }

    // 2. Expire SaaS Subscriptions
    const { data: expiredSubs } = await supabaseAdmin
      .from("tenants")
      .select("id, name")
      .eq("subscription_status", "active")
      .lt("subscription_end_at", nowStr);

    if (expiredSubs && expiredSubs.length > 0) {
      const ids = expiredSubs.map((t) => t.id);
      const { error: subErr } = await supabaseAdmin
        .from("tenants")
        .update({ subscription_status: "expired" })
        .in("id", ids);

      if (!subErr) {
        results.tenantsExpired += ids.length;
        for (const tenant of expiredSubs) {
          await supabaseAdmin.from("audit_logs").insert({
            tenant_id: tenant.id,
            action: "saas.subscription_expired",
            entity_type: "tenant",
            entity_id: tenant.id,
            metadata: { name: tenant.name },
          });
        }
      }
    }

    // 3. Expire Vouchers
    const { data: expiredVouchers } = await supabaseAdmin
      .from("vouchers")
      .select("id, tenant_id, code")
      .eq("status", "active")
      .lt("expires_at", nowStr);

    if (expiredVouchers && expiredVouchers.length > 0) {
      const ids = expiredVouchers.map((v) => v.id);
      const { error: voucherErr } = await supabaseAdmin
        .from("vouchers")
        .update({ status: "expired" })
        .in("id", ids);

      if (!voucherErr) {
        results.vouchersExpired = ids.length;
        for (const voucher of expiredVouchers) {
          await supabaseAdmin.from("audit_logs").insert({
            tenant_id: voucher.tenant_id,
            action: "portal.voucher_expired",
            entity_type: "voucher",
            entity_id: voucher.id,
            metadata: { code: voucher.code },
          });
        }
      }
    }

    // 4. Expire Customers & Disconnect on MikroTik
    const { data: expiredCustomers } = await supabaseAdmin
      .from("customers")
      .select("id, tenant_id, router_id, username, full_name, kind")
      .eq("status", "active")
      .lt("expires_at", nowStr);

    if (expiredCustomers && expiredCustomers.length > 0) {
      const ids = expiredCustomers.map((c) => c.id);
      const { error: custErr } = await supabaseAdmin
        .from("customers")
        .update({ status: "expired" })
        .in("id", ids);

      if (!custErr) {
        results.customersExpired = ids.length;

        // Queue disconnect commands for each expired customer
        const commandsToQueue = expiredCustomers
          .filter((c) => c.router_id && c.username)
          .map((c) => {
            if (c.kind === "pppoe") {
              return {
                tenantId: c.tenant_id,
                routerId: c.router_id!,
                action: "pppoe.update_user",
                payload: {
                  username: c.username!,
                  profile: "expired-limited",
                  comment: "Expired - Automated Restriction",
                },
              };
            }
            return {
              tenantId: c.tenant_id,
              routerId: c.router_id!,
              action: "hotspot.remove_user",
              payload: {
                username: c.username!,
              },
            };
          });

        if (commandsToQueue.length > 0) {
          await enqueueRouterCommands(commandsToQueue);
        }

        for (const customer of expiredCustomers) {
          await supabaseAdmin.from("audit_logs").insert({
            tenant_id: customer.tenant_id,
            action: "portal.customer_expired",
            entity_type: "customer",
            entity_id: customer.id,
            metadata: { username: customer.username, name: customer.full_name },
          });
        }
      }
    }

    // 5. Recover Pending SaaS Payments (Automation)
    const { data: pendingTxns } = await supabaseAdmin
      .from("transactions")
      .select("id, tenant_id, checkout_request_id, kind, status")
      .eq("status", "pending")
      .eq("kind", "saas_subscription")
      .lt("created_at", new Date(Date.now() - 120 * 1000).toISOString()) // 2 mins old
      .limit(10);

    if (pendingTxns && pendingTxns.length > 0) {
      const { stkPushQuery } = await import("@/lib/mpesa.server");
      const { activateTenantSubscription } = await import("@/lib/payments.functions");

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
                txn.tenant_id!,
                txn.id,
                receipt ? String(receipt) : null,
              );
              console.log(`[maintenance] Recovered payment for tenant ${txn.tenant_id}`);
            }
          }
        } catch (e) {
          console.debug(
            `[maintenance] Failed to recover txn ${txn.id} (likely network timeout):`,
            e instanceof Error ? e.message : e,
          );
        }
      }
    }

    // 6. Recover Pending Customer Payments (Automation)
    const { data: pendingCustTxns } = await supabaseAdmin
      .from("transactions")
      .select("id, tenant_id, checkout_request_id, kind, status")
      .eq("status", "pending")
      .eq("kind", "customer_payment")
      .lt("created_at", new Date(Date.now() - 180 * 1000).toISOString()) // 3 mins old
      .limit(10);

    if (pendingCustTxns && pendingCustTxns.length > 0) {
      const { stkPushQuery } = await import("@/lib/mpesa.server");
      const { activateCustomerPackage } = await import("@/lib/payments.functions");

      for (const txn of pendingCustTxns) {
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
              await activateCustomerPackage(
                supabaseAdmin,
                txn.id,
                receipt ? String(receipt) : null,
              );
              console.log(`[maintenance] Recovered customer payment ${txn.id}`);
            }
          }
        } catch (e) {
          console.debug(
            `[maintenance] Failed to recover customer txn ${txn.id} (likely network timeout):`,
            e instanceof Error ? e.message : e,
          );
        }
      }
    }

    console.log("[maintenance] Finished background task check:", results);
  } catch (error) {
    console.error("[maintenance] Error in background maintenance run:", error);
  }

  return results;
}

/**
 * Attempts to recover any pending SaaS payments for a specific tenant.
 * Useful for "immediate" activation when a user pays and refreshes their dashboard.
 */
export async function recoverPendingSaaSPayment(tenantId: string): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { stkPushQuery } = await import("@/lib/mpesa.server");
    const { activateTenantSubscription } = await import("@/lib/payments.functions");

    let recovered = false;

    // 1. Check all recent pending transactions
    const { data: pendingList } = await supabaseAdmin
      .from("transactions")
      .select("id, checkout_request_id, status")
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .eq("kind", "saas_subscription")
      .order("created_at", { ascending: false })
      .limit(5);

    if (pendingList && pendingList.length > 0) {
      for (const txn of pendingList) {
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
              recovered = true;
            }
          }
        } catch (err) {
          // ignore individual query error
        }
      }
    }

    // 2. Check for any uncredited completed transactions
    const { data: successList } = await supabaseAdmin
      .from("transactions")
      .select("id, mpesa_receipt")
      .eq("tenant_id", tenantId)
      .eq("status", "success")
      .eq("kind", "saas_subscription")
      .order("created_at", { ascending: false })
      .limit(5);

    if (successList && successList.length > 0) {
      for (const stxn of successList) {
        const { data: existingAudit } = await supabaseAdmin
          .from("audit_logs")
          .select("id")
          .eq("action", "subscription.renewed")
          .eq("entity_id", stxn.id)
          .maybeSingle();

        if (!existingAudit) {
          await activateTenantSubscription(
            supabaseAdmin,
            tenantId,
            stxn.id,
            stxn.mpesa_receipt ?? null,
          );
          recovered = true;
        }
      }
    }

    return recovered;
  } catch (e) {
    console.error(`[maintenance] Immediate recovery failed for tenant ${tenantId}:`, e);
  }
  return false;
}
