import { SupabaseClient } from "@supabase/supabase-js";
import { logRouterActivity } from "@/lib/router-logger.server";

export type RouterAction =
  | "hotspot.create_user"
  | "hotspot.delete_user"
  | "hotspot.setup_pool"
  | "pppoe.create_user"
  | "pppoe.delete_user"
  | "pppoe.setup_pool"
  | "walled_garden.add"
  | "raw.command";

export interface ProvisioningOptions {
  tenantId: string;
  routerId: string;
  kind: "hotspot" | "pppoe";
  username: string;
  password?: string;
  profile?: string;
  limitUptimeHours?: number;
  rateLimit?: string;
  sharedUsers?: number;
  macAddress?: string | null;
  ipAddress?: string | null;
  comment?: string;
}

/**
 * High-level Router Management Module
 * Handles provisioning logic for different connection types.
 */
export class RouterManagementService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Provisions or updates a user on the specified router.
   * Always attempts direct RouterOS API authorization first for instant internet access,
   * while guaranteeing the command is queued for the automated 15-second RouterOS sync script.
   */
  async provisionUser(opts: ProvisioningOptions) {
    const {
      tenantId,
      routerId,
      kind,
      username,
      password,
      profile,
      limitUptimeHours,
      rateLimit,
      sharedUsers,
      macAddress,
      ipAddress,
      comment,
    } = opts;

    console.log(
      `[PAYMENT_FLOW][3/5] RouterOS request sending: Provisioning ${kind} user ${username} on router ${routerId} (MAC: ${macAddress || "none"}, IP: ${ipAddress || "none"})`,
    );

    const totalSeconds = Math.floor((limitUptimeHours || 0) * 3600);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const limitStr = limitUptimeHours ? `${h}:${m}:${s}` : undefined;

    const payload: Record<string, unknown> =
      kind === "pppoe"
        ? {
            username,
            password: password || username,
            profile: profile || "default",
            rate_limit: rateLimit,
            comment: comment || `M-Pesa PPPoE Active`,
          }
        : {
            username,
            password: password || username,
            profile: profile || "default",
            limit_uptime_hours: limitUptimeHours || 0,
            limit_uptime: limitStr,
            rate_limit: rateLimit,
            shared_users: sharedUsers || 1,
            mac: macAddress,
            ip: ipAddress,
            comment: comment || `M-Pesa Hotspot Active`,
          };

    // 1. Check if router has direct RouterOS API credentials configured
    let directApiSuccess = false;
    let directApiError: string | null = null;

    try {
      const { data: router } = await this.supabase
        .from("routers")
        .select("id, name, ip_address, public_ip, api_port, api_username, api_password, is_disabled")
        .eq("id", routerId)
        .maybeSingle();

      const routerHost = router?.ip_address || router?.public_ip;
      if (router && !router.is_disabled && routerHost && (router.api_password || router.api_username)) {
        console.log(`[PAYMENT_FLOW][3/5] Attempting direct RouterOS API connection to ${routerHost}:${router.api_port || 8728}...`);
        const { MikrotikApiClient } = await import("@/lib/mikrotik-api-client.server");
        const client = new MikrotikApiClient({
          host: routerHost,
          port: router.api_port || 8728,
          username: router.api_username || "admin",
          password: router.api_password || "",
          timeout: 4, // 4-second timeout to avoid stalling payment callbacks
        });

        if (kind === "pppoe") {
          await client.upsertPPPoEUser(
            username,
            password || username,
            profile || "default",
            rateLimit,
            comment || "Paid PPPoE User",
          );
          directApiSuccess = true;
          console.log(
            `[PAYMENT_FLOW][4/5] Router response received: Direct RouterOS API PPPoE user ${username} created/updated and session kicked for immediate reconnection on ${router.name || routerHost}`,
          );
        } else {
          await client.upsertHotspotUser(
            username,
            password || username,
            profile || "default",
            limitStr,
            undefined,
            comment || "Paid Hotspot User",
          );

          // Direct active login so they appear under /ip hotspot active immediately without manual page refresh
          await client.authorizeHotspotActiveSession(
            username,
            password || username,
            ipAddress || undefined,
            macAddress || undefined,
          );
          directApiSuccess = true;
          console.log(
            `[PAYMENT_FLOW][4/5] Router response received: Direct RouterOS API Hotspot user ${username} provisioned and active session authorized on ${router.name || routerHost}`,
          );
        }

        await client.disconnect();
      }
    } catch (apiErr: any) {
      directApiError = apiErr?.message || String(apiErr);
      console.warn(
        `[PAYMENT_FLOW][4/5] Direct RouterOS API attempt finished with notice: ${directApiError}. Command enqueued for automated 15s router sync script.`,
      );
    }

    // 2. Insert into router_commands table
    const action: RouterAction = kind === "pppoe" ? "pppoe.create_user" : "hotspot.create_user";
    const commandStatus = directApiSuccess ? "done" : "queued";

    return this.enqueueCommand({
      tenantId,
      routerId,
      action,
      payload,
      status: commandStatus,
      directApiSuccess,
      directApiError,
    });
  }

  /**
   * Suspends or deletes a user from the router.
   */
  async suspendUser(
    tenantId: string,
    routerId: string,
    kind: "hotspot" | "pppoe",
    username: string,
    macAddress?: string | null,
  ) {
    console.log(`[RouterManagement] Suspending ${kind} user ${username} on router ${routerId}`);

    const action = kind === "pppoe" ? "pppoe.delete_user" : "hotspot.delete_user";
    return this.enqueueCommand({
      tenantId,
      routerId,
      action,
      payload: {
        username,
        mac: macAddress,
      },
    });
  }

  /**
   * Provisions or expands high-capacity PPPoE IP pool (16M+ active connections, 1M+ expired pool).
   */
  async setupHighCapacityPPPoEPool(tenantId: string, routerId: string) {
    console.log(`[RouterManagement] Setting up 16M+ PPPoE IP pool for router ${routerId}`);

    let directApiSuccess = false;
    let directApiError: string | null = null;

    try {
      const { data: router } = await this.supabase
        .from("routers")
        .select("id, ip_address, public_ip, api_port, api_user, api_password")
        .eq("id", routerId)
        .maybeSingle();

      const host = router?.public_ip || router?.ip_address;
      if (host) {
        const { MikrotikApiClient } = await import("@/lib/mikrotik-api-client.server");
        const client = new MikrotikApiClient({
          host,
          port: router.api_port || 8728,
          username: router.api_user || "billing_agent",
          password: router.api_password || "",
        });
        await client.ensureHighCapacityPPPoEPool();
        directApiSuccess = true;
      }
    } catch (err: any) {
      directApiError = err?.message || String(err);
      console.log(`[RouterManagement] Direct API pool setup deferred to 15s sync script: ${directApiError}`);
    }

    return this.enqueueCommand({
      tenantId,
      routerId,
      action: "pppoe.setup_pool",
      payload: {
        activePool: "PPPOE ACTIVE POOL",
        activeRange: "10.0.0.2-10.9.255.255,10.11.0.1-10.255.255.254",
        activeCapacity: 16711676,
        expiredPool: "expired_pppoe_pool",
        expiredRange: "172.16.0.2-172.31.255.254",
        expiredCapacity: 1048574,
        localAddress: "10.0.0.1",
        natSubnet: "10.0.0.0/8",
        expiredNatSubnet: "172.16.0.0/12",
      },
      status: directApiSuccess ? "done" : "queued",
      directApiSuccess,
      directApiError,
    });
  }

  /**
   * Provisions or expands high-capacity Hotspot IP pool (65,525 client hosts on 10.10.0.0/16)
   * with gateway 10.10.0.1/16, 30m lease time, and NAT masquerade.
   */
  async setupHighCapacityHotspotPool(tenantId: string, routerId: string) {
    console.log(`[RouterManagement] Setting up 65K+ Hotspot IP pool for router ${routerId}`);

    let directApiSuccess = false;
    let directApiError: string | null = null;

    try {
      const { data: router } = await this.supabase
        .from("routers")
        .select("id, ip_address, public_ip, api_port, api_user, api_password")
        .eq("id", routerId)
        .maybeSingle();

      const host = router?.public_ip || router?.ip_address;
      if (host) {
        const { MikrotikApiClient } = await import("@/lib/mikrotik-api-client.server");
        const client = new MikrotikApiClient({
          host,
          port: router.api_port || 8728,
          username: router.api_user || "billing_agent",
          password: router.api_password || "",
        });
        await client.ensureHighCapacityHotspotPool();
        directApiSuccess = true;
      }
    } catch (err: any) {
      directApiError = err?.message || String(err);
      console.log(`[RouterManagement] Direct API hotspot pool setup deferred to 15s sync script: ${directApiError}`);
    }

    return this.enqueueCommand({
      tenantId,
      routerId,
      action: "hotspot.setup_pool",
      payload: {
        poolName: "hs-pool",
        poolRange: "10.10.0.10-10.10.255.254",
        gateway: "10.10.0.1/16",
        network: "10.10.0.0/16",
        leaseTime: "30m",
        capacity: 65525,
        natSubnet: "10.10.0.0/16",
      },
      status: directApiSuccess ? "done" : "queued",
      directApiSuccess,
      directApiError,
    });
  }

  /**
   * Directly enqueues a command into the router_commands table and logs via centralized logger.
   */
  private async enqueueCommand(opts: {
    tenantId: string;
    routerId: string;
    action: RouterAction;
    payload: Record<string, unknown>;
    status?: "queued" | "done";
    directApiSuccess?: boolean;
    directApiError?: string | null;
  }) {
    const status = opts.status || "queued";
    const now = new Date().toISOString();

    const insertRecord: Record<string, unknown> = {
      tenant_id: opts.tenantId,
      router_id: opts.routerId,
      action: opts.action,
      payload: opts.payload,
      status,
    };

    if (status === "done") {
      insertRecord.delivered_at = now;
      insertRecord.completed_at = now;
    }

    const { data, error } = await this.supabase
      .from("router_commands")
      .insert(insertRecord)
      .select()
      .single();

    if (error) {
      console.error("[PAYMENT_FLOW][4/5] CRITICAL: Failed to enqueue router command:", error);
      await logRouterActivity(this.supabase, {
        tenantId: opts.tenantId,
        routerId: opts.routerId,
        action: opts.action,
        payload: opts.payload,
        status: "failed",
        error: error.message,
      });
      throw error;
    }

    console.log(
      `[PAYMENT_FLOW][4/5] Router command record created (ID: ${data?.id}, Status: ${status}, DirectApi: ${opts.directApiSuccess ? "SUCCESS" : "QUEUED_FOR_SYNC"})`,
    );

    await logRouterActivity(this.supabase, {
      tenantId: opts.tenantId,
      routerId: opts.routerId,
      action: opts.action,
      payload: opts.payload,
      status,
      response: {
        id: data?.id,
        directApiSuccess: opts.directApiSuccess || false,
        directApiError: opts.directApiError || null,
        message: opts.directApiSuccess
          ? "Executed directly via RouterOS API"
          : "Enqueued for automated 15-second RouterOS sync script",
      },
    });

    return data;
  }
}
