import { SupabaseClient } from "@supabase/supabase-js";
import { logRouterActivity } from "@/lib/router-logger.server";

export interface RouterCommandPayload {
  username: string;
  password?: string;
  profile?: string;
  mac?: string;
  ip?: string;
  comment?: string;
  limitUptime?: string;
  limitBytesTotal?: number;
}

/**
 * Centralized, robust MikroTik RouterOS API and Command Management Utility.
 * Handles connection retries, session bindings, command encoding, and immediate activation of paid users.
 */
export class MikroTikApiManager {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Execute an operation with exponential backoff and retry logic.
   */
  async withRetry<T>(operation: () => Promise<T>, maxRetries = 3, delayMs = 1000): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (err) {
        lastError = err;
        console.warn(`[MikroTikApiManager] Attempt ${attempt}/${maxRetries} failed:`, err);
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, attempt - 1)));
        }
      }
    }
    throw lastError;
  }

  /**
   * Properly encodes and enqueues commands to manage session binding, IP binding,
   * and hotspot user creation for immediate internet access.
   */
  async activatePaidUserOnRouter(opts: {
    tenantId: string;
    routerId: string;
    username: string;
    password?: string;
    profile?: string;
    mac?: string;
    ip?: string;
    comment?: string;
  }): Promise<void> {
    const action = "hotspot.create_user";
    const payload = {
      username: opts.username.trim(),
      password: opts.password || opts.username.trim(),
      profile: opts.profile || "default",
      mac: opts.mac ? opts.mac.trim() : null,
      ip: opts.ip ? opts.ip.trim() : null,
      comment: opts.comment || "Paid Active Subscriber - Instant Access",
      sessionBinding: true,
    };

    await this.withRetry(async () => {
      // 1. Enqueue command for router sync
      const { error: insertErr } = await this.supabase.from("router_commands").insert({
        tenant_id: opts.tenantId,
        router_id: opts.routerId,
        action,
        payload,
        status: "queued",
      });

      if (insertErr) {
        throw new Error(`Failed to insert router command: ${insertErr.message}`);
      }

      // 2. Log activity via centralized router logger
      await logRouterActivity(this.supabase, {
        tenantId: opts.tenantId,
        routerId: opts.routerId,
        action,
        payload,
        status: "success",
        response: {
          queued: true,
          message: "User activation command enqueued successfully with session binding",
        },
      });
    });
  }

  /**
   * Disconnects and removes a user from the router upon package expiration.
   */
  async deactivateUserOnRouter(opts: {
    tenantId: string;
    routerId: string;
    username: string;
    mac?: string;
  }): Promise<void> {
    const action = "hotspot.delete_user";
    const payload = {
      username: opts.username.trim(),
      mac: opts.mac ? opts.mac.trim() : null,
      disconnectActive: true,
    };

    await this.withRetry(async () => {
      await this.supabase.from("router_commands").insert({
        tenant_id: opts.tenantId,
        router_id: opts.routerId,
        action,
        payload,
        status: "queued",
      });

      await logRouterActivity(this.supabase, {
        tenantId: opts.tenantId,
        routerId: opts.routerId,
        action,
        payload,
        status: "success",
        response: {
          queued: true,
          message: "User deactivation & disconnection command enqueued successfully",
        },
      });
    });
  }

  /**
   * Explicitly authorize a user by injecting them directly into the MikroTik hotspot active sessions
   * and IP bindings for immediate high-priority internet access.
   */
  async authorizeUser(opts: {
    tenantId: string;
    routerId?: string | null;
    username: string;
    mac?: string | null;
    ip?: string | null;
    profile?: string;
    comment?: string;
  }): Promise<void> {
    const routerId = opts.routerId;
    if (!routerId) {
      // Find default router for tenant
      const { data: defaultRouter } = await this.supabase
        .from("routers")
        .select("id")
        .eq("tenant_id", opts.tenantId)
        .limit(1)
        .maybeSingle();
      if (!defaultRouter) {
        throw new Error(
          `No active router found for tenant ${opts.tenantId} to authorize user ${opts.username}`,
        );
      }
      opts.routerId = defaultRouter.id;
    }

    await this.activatePaidUserOnRouter({
      tenantId: opts.tenantId,
      routerId: opts.routerId!,
      username: opts.username,
      mac: opts.mac ?? undefined,
      ip: opts.ip ?? undefined,
      profile: opts.profile || "default",
      comment: opts.comment || "M-Pesa Paid User - Instant Active Authorization",
    });
  }

  /**
   * Scans all paid / active customers and vouchers for a tenant (or all tenants)
   * and ensures they are immediately activated and provisioned on their assigned MikroTik routers.
   */
  async activateAllPaidUsers(tenantId?: string): Promise<{ activatedCount: number }> {
    let query = this.supabase
      .from("customers")
      .select("id, tenant_id, username, phone, mac_address, router_id, status, package_id")
      .eq("status", "active");

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data: customers, error } = await query;
    if (error || !customers) {
      console.error("[MikroTikApiManager] Failed to fetch active customers for activation:", error);
      return { activatedCount: 0 };
    }

    let activatedCount = 0;

    // Fetch all routers for tenants
    const tenantIds = [...new Set(customers.map((c) => c.tenant_id))];
    const { data: routers } = await this.supabase
      .from("routers")
      .select("id, tenant_id, is_disabled")
      .in("tenant_id", tenantIds)
      .eq("is_disabled", false);

    if (!routers || routers.length === 0) {
      return { activatedCount: 0 };
    }

    for (const customer of customers) {
      const assignedRouters = customer.router_id
        ? routers.filter((r) => r.id === customer.router_id)
        : routers.filter((r) => r.tenant_id === customer.tenant_id);

      for (const router of assignedRouters) {
        try {
          await this.activatePaidUserOnRouter({
            tenantId: customer.tenant_id,
            routerId: router.id,
            username: customer.username || customer.phone || `cust_${customer.id.substring(0, 6)}`,
            mac: customer.mac_address,
            comment: `Bulk Active User Sync - ID: ${customer.id}`,
          });
          activatedCount++;
        } catch (actErr) {
          console.error(
            `[MikroTikApiManager] Failed to activate user ${customer.username}:`,
            actErr,
          );
        }
      }
    }

    console.log(
      `[MikroTikApiManager] Successfully enqueued immediate activation for ${activatedCount} paid user entries.`,
    );
    return { activatedCount };
  }
}
