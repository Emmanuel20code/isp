import { SupabaseClient } from "@supabase/supabase-js";
import { logRouterActivity } from "@/lib/router-logger.server";

export type RouterAction =
  | "hotspot.create_user"
  | "hotspot.delete_user"
  | "pppoe.create_user"
  | "pppoe.delete_user"
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

    console.log(`[RouterManagement] Provisioning ${kind} user ${username} on router ${routerId}`);

    if (kind === "pppoe") {
      return this.enqueueCommand({
        tenantId,
        routerId,
        action: "pppoe.create_user",
        payload: {
          username,
          password: password || username,
          profile: profile || "default",
          comment: comment || `Provisioned via ${kind}`,
        },
      });
    } else {
      const totalSeconds = Math.floor((limitUptimeHours || 0) * 3600);
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      const limitStr = `${h}:${m}:${s}`;

      return this.enqueueCommand({
        tenantId,
        routerId,
        action: "hotspot.create_user",
        payload: {
          username,
          password: password || username,
          profile: profile || "default",
          limit_uptime_hours: limitUptimeHours || 0,
          limit_uptime: limitStr,
          rate_limit: rateLimit,
          shared_users: sharedUsers || 1,
          mac: macAddress,
          ip: ipAddress,
          comment: comment || `Provisioned via ${kind}`,
        },
      });
    }
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
   * Directly enqueues a command into the router_commands table and logs via centralized logger.
   */
  private async enqueueCommand(opts: {
    tenantId: string;
    routerId: string;
    action: RouterAction;
    payload: Record<string, unknown>;
  }) {
    const { data, error } = await this.supabase
      .from("router_commands")
      .insert({
        tenant_id: opts.tenantId,
        router_id: opts.routerId,
        action: opts.action,
        payload: opts.payload,
        status: "queued",
      })
      .select()
      .single();

    if (error) {
      console.error("[RouterManagement] Failed to enqueue command:", error);
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

    await logRouterActivity(this.supabase, {
      tenantId: opts.tenantId,
      routerId: opts.routerId,
      action: opts.action,
      payload: opts.payload,
      status: "queued",
      response: data,
    });

    return data;
  }
}
