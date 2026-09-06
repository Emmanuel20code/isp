import { enqueueRouterCommands } from "@/lib/agent-commands.server";

let lastRunTime = 0;
let lastRouterCleanupTime = 0;
const MAINTENANCE_INTERVAL_MS = 10 * 1000; // 10 seconds rate limit
const ROUTER_CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

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
      .select("id, tenant_id, code, router_id")
      .eq("status", "active")
      .lt("expires_at", nowStr)
      .limit(50);

    if (expiredVouchers && expiredVouchers.length > 0) {
      const ids = expiredVouchers.map((v) => v.id);
      const { error: voucherErr } = await supabaseAdmin
        .from("vouchers")
        .update({ status: "expired" })
        .in("id", ids);

      if (!voucherErr) {
        results.vouchersExpired = ids.length;

        // Lookup associated customer records to get MAC addresses
        const voucherCodes = expiredVouchers.map((v) => v.code);
        const { data: matchedCustomers } = await supabaseAdmin
          .from("customers")
          .select("username, mac_address, router_id, tenant_id")
          .in("username", voucherCodes);

        const macByCode = new Map<string, string | null>();
        matchedCustomers?.forEach((c) => {
          if (c.username) macByCode.set(c.username, c.mac_address);
        });

        // Queue disconnect commands for each expired voucher
        const tenantIds = [...new Set(expiredVouchers.map((v) => v.tenant_id))];
        const { data: tenantRouters } = await supabaseAdmin
          .from("routers")
          .select("id, tenant_id")
          .in("tenant_id", tenantIds);

        if (tenantRouters && tenantRouters.length > 0) {
          const commandsToQueue = [];
          for (const voucher of expiredVouchers) {
            const routers = voucher.router_id
              ? tenantRouters.filter((r) => r.id === voucher.router_id)
              : tenantRouters.filter((r) => r.tenant_id === voucher.tenant_id);

            const mac = macByCode.get(voucher.code) ?? null;
            for (const router of routers) {
              commandsToQueue.push({
                tenantId: voucher.tenant_id,
                routerId: router.id,
                action: "hotspot.delete_user",
                payload: {
                  username: voucher.code,
                  mac,
                },
              });
            }
          }

          if (commandsToQueue.length > 0) {
            await enqueueRouterCommands(commandsToQueue);
          }
        }

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
      .select("id, tenant_id, router_id, username, full_name, kind, mac_address")
      .eq("status", "active")
      .lt("expires_at", nowStr)
      .limit(50);

    if (expiredCustomers && expiredCustomers.length > 0) {
      const ids = expiredCustomers.map((c) => c.id);
      const { error: custErr } = await supabaseAdmin
        .from("customers")
        .update({ status: "expired" })
        .in("id", ids);

      if (!custErr) {
        results.customersExpired = ids.length;

        // Fetch routers for tenants if router_id is missing on any customer
        const tenantIdsNeedingRouters = [
          ...new Set(expiredCustomers.filter((c) => !c.router_id).map((c) => c.tenant_id)),
        ];
        let fallbackRouters: { id: string; tenant_id: string }[] = [];
        if (tenantIdsNeedingRouters.length > 0) {
          const { data: rList } = await supabaseAdmin
            .from("routers")
            .select("id, tenant_id")
            .in("tenant_id", tenantIdsNeedingRouters);
          fallbackRouters = rList || [];
        }

        const commandsToQueue = [];
        for (const c of expiredCustomers) {
          if (!c.username) continue;
          const targetRids = c.router_id
            ? [c.router_id]
            : fallbackRouters.filter((r) => r.tenant_id === c.tenant_id).map((r) => r.id);

          for (const rid of targetRids) {
            if (c.kind === "pppoe") {
              commandsToQueue.push({
                tenantId: c.tenant_id,
                routerId: rid,
                action: "pppoe.set_enabled",
                payload: {
                  username: c.username,
                  enabled: false,
                },
              });
            } else {
              commandsToQueue.push({
                tenantId: c.tenant_id,
                routerId: rid,
                action: "hotspot.delete_user",
                payload: {
                  username: c.username,
                  mac: c.mac_address,
                },
              });
            }
          }
        }

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

    // 6. Recover Pending SaaS Payments (Automation)
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

    // 7. Update Offline Status for Inactive Routers (Heartbeat > 60 seconds)
    try {
      const sixtySecondsAgo = new Date(Date.now() - 60 * 1000).toISOString();
      await supabaseAdmin
        .from("routers")
        .update({ status: "offline" })
        .eq("status", "online")
        .lt("last_seen_at", sixtySecondsAgo);
    } catch (e) {
      console.debug("[maintenance] Router status update check notice:", e);
    }

    // 8. Periodic Ghost Session Cleanup on Routers
    // This removes sessions on the router that are NOT marked as active in our database.
    if (force || Date.now() - lastRouterCleanupTime > ROUTER_CLEANUP_INTERVAL_MS) {
      lastRouterCleanupTime = Date.now();
      try {
        const cleanupRes = await cleanupGhostSessionsAcrossRouters();
        console.log("[maintenance] Router ghost session cleanup finished:", cleanupRes);
      } catch (e) {
        console.error("[maintenance] Router cleanup error:", e);
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

/**
 * Synchronizes router active sessions with the database to remove "ghost" entries.
 * Runs on reachable (publicly accessible) routers using the Mikrotik API.
 */
export async function cleanupGhostSessionsAcrossRouters(): Promise<{
  routersProcessed: number;
  totalCleaned: number;
}> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { MikrotikApiClient } = await import("@/lib/mikrotik-api-client.server");

    // 1. Get all online routers that have a public IP (required for direct API access)
    const { data: routers } = await supabaseAdmin
      .from("routers")
      .select("id, name, public_ip, agent_key")
      .eq("status", "online")
      .not("public_ip", "is", null);

    if (!routers || routers.length === 0) {
      return { routersProcessed: 0, totalCleaned: 0 };
    }

    // 2. Get all active customer usernames across the system to form the "Allowed" list
    const { data: activeCustomers } = await supabaseAdmin
      .from("customers")
      .select("username")
      .eq("status", "active");

    const allowedUsernames = (activeCustomers || [])
      .map((c) => c.username)
      .filter((u): u is string => !!u);

    let routersProcessed = 0;
    let totalCleaned = 0;

    for (const router of routers) {
      if (!router.public_ip) continue;

      try {
        // We use 'billing_agent' as the username and 'agent_key' as the password
        // which was set during the onboarding script execution.
        const client = new MikrotikApiClient({
          host: router.public_ip,
          username: "billing_agent",
          password: router.agent_key,
        });

        const { kicked } = await client.cleanupStaleSessions(allowedUsernames);
        totalCleaned += kicked;
        routersProcessed++;

        await client.disconnect();
      } catch (err: any) {
        // Connection failures are expected for routers behind NAT without port forwarding
        const isTimeout = err?.message?.includes("Timed out") || err?.name === "RosException";
        if (isTimeout) {
          console.debug(
            `[maintenance] Router ${router.name} (${router.public_ip}) API is unreachable (timed out). This is normal if port 8728 is not forwarded.`,
          );
        } else {
          console.debug(
            `[maintenance] Cleanup skipped for router ${router.name} (${router.public_ip}): ${err instanceof Error ? err.message : "Unreachable"}`,
          );
        }
      }
    }

    return { routersProcessed, totalCleaned };
  } catch (error) {
    console.error("[maintenance] Ghost session cleanup failed:", error);
    return { routersProcessed: 0, totalCleaned: 0 };
  }
}
