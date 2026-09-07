// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const heartbeatSchema = z.object({
  identity: z.string().max(100).optional(),
  ros_version: z.string().max(50).optional(),
  uptime: z.string().max(60).optional(),
  cpu_load: z.union([z.string(), z.number()]).optional(),
  free_memory: z.union([z.string(), z.number()]).optional(),
  total_memory: z.union([z.string(), z.number()]).optional(),
  active_hotspot_users: z.number().int().min(0).max(100000).optional(),
  active_pppoe_users: z.number().int().min(0).max(100000).optional(),
  configuration_version: z.number().int().optional(),
});

function parseHotspotActive(raw: unknown) {
  if (!raw || typeof raw !== "string") return [];
  const entries = raw.split(";").map((s) => s.trim()).filter(Boolean);
  const list: Array<{
    user?: string;
    mac?: string;
    ip?: string;
    uptime?: string;
    bytes_in?: number;
    bytes_out?: number;
    authorized: boolean;
    status: string;
  }> = [];

  for (const entry of entries) {
    const parts = entry.split(",");
    const user = parts[0]?.trim();
    const mac = parts[1]?.trim();
    const ip = parts[2]?.trim();
    const uptime = parts[3]?.trim();
    const bytesIn = Number(parts[4]) || undefined;
    const bytesOut = Number(parts[5]) || undefined;
    if (user || mac || ip) {
      list.push({
        user: user || undefined,
        mac: mac || undefined,
        ip: ip || undefined,
        uptime: uptime || undefined,
        bytes_in: bytesIn,
        bytes_out: bytesOut,
        authorized: true,
        status: "authorized",
      });
    }
  }
  return list;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/mikrotik/heartbeat")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);

        // --- DIAGNOSTIC LOGGING ---
        console.log(`[MikroTik Heartbeat] Incoming GET request: ${url.searchParams.toString()}`);
        console.log(
          `[MikroTik Heartbeat] Headers: ${JSON.stringify(Object.fromEntries(request.headers.entries()))}`,
        );
        // --------------------------

        const routerId =
          request.headers.get("x-router-id") ||
          request.headers.get("X-Router-ID") ||
          url.searchParams.get("router_id") ||
          url.searchParams.get("id");
        const agentKey =
          request.headers.get("x-agent-key") ||
          request.headers.get("X-Agent-Key") ||
          url.searchParams.get("agent_key") ||
          url.searchParams.get("key");
        const token = url.searchParams.get("token");

        console.log(`[MikroTik Heartbeat] Extracted token: ${token}, routerId: ${routerId}`);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let routerQuery = supabaseAdmin
          .from("routers")
          .select(
            "id, tenant_id, name, agent_key, configuration_version, desired_configuration_version, is_disabled",
          );

        if (routerId && agentKey) {
          routerQuery = routerQuery.eq("id", routerId).eq("agent_key", agentKey);
        } else if (token) {
          routerQuery = routerQuery.eq("onboard_token", token);
        } else {
          return json({ error: "Missing router authentication headers" }, 401);
        }

        const { data: router, error: authErr } = await routerQuery.maybeSingle();

        if (authErr || !router) {
          return json({ error: "Unauthorized: Invalid router credentials" }, 401);
        }

        if (router.is_disabled) {
          return json({ error: "Router disabled by administrator", status: "disabled" }, 403);
        }

        const clientIp =
          request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
          request.headers.get("cf-connecting-ip") ||
          null;
        const now = new Date().toISOString();

        const cpuParam = url.searchParams.get("cpu_load") || url.searchParams.get("cpu");
        const freeMemParam =
          url.searchParams.get("free_mem") || url.searchParams.get("free_memory");
        const hsUsers = parseInt(url.searchParams.get("hs") || "0", 10) || 0;
        const pppUsers = parseInt(url.searchParams.get("ppp") || "0", 10) || 0;
        const uptimeParam = url.searchParams.get("uptime")?.replace(/_/g, " ").trim();

        await supabaseAdmin
          .from("routers")
          .update({
            status: "online",
            online_status: true,
            last_seen_at: now,
            last_seen: now,
            heartbeat_at: now,
            sync_status: "synced",
            uptime: uptimeParam || undefined,
            cpu_load: cpuParam || undefined,
            free_memory: freeMemParam || undefined,
            active_hotspot_users: hsUsers,
            active_pppoe_users: pppUsers,
            public_ip: clientIp,
          })
          .eq("id", router.id);

        // Record heartbeat log for analytics
        await supabaseAdmin.from("router_heartbeats").insert({
          router_id: router.id,
          tenant_id: router.tenant_id,
          cpu_load: parseInt(cpuParam || "0", 10) || 0,
          free_memory: parseInt(freeMemParam || "0", 10) || 0,
          uptime: uptimeParam || null,
          active_hotspot_users: hsUsers,
          active_pppoe_users: pppUsers,
          config_version: router.configuration_version || 1,
          ip_address: clientIp,
        });

        return json({
          success: true,
          status: "online",
          router_id: router.id,
          configuration_version: router.configuration_version || 1,
          timestamp: now,
        });
      },
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const routerId =
          request.headers.get("x-router-id") ||
          request.headers.get("X-Router-ID") ||
          url.searchParams.get("router_id") ||
          url.searchParams.get("id");
        const agentKey =
          request.headers.get("x-agent-key") ||
          request.headers.get("X-Agent-Key") ||
          url.searchParams.get("agent_key") ||
          url.searchParams.get("key");
        const token = url.searchParams.get("token");

        let body: Record<string, unknown> = {};
        const contentType = request.headers.get("content-type") || "";

        try {
          if (contentType.includes("application/json")) {
            body = (await request.json()) as Record<string, unknown>;
          } else {
            const rawText = await request.text();
            try {
              body = JSON.parse(rawText) as Record<string, unknown>;
            } catch {
              const params = new URLSearchParams(rawText);
              body = Object.fromEntries(params.entries());
            }
          }
        } catch {
          body = {};
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let routerQuery = supabaseAdmin
          .from("routers")
          .select(
            "id, tenant_id, name, agent_key, configuration_version, desired_configuration_version, is_disabled",
          );

        if (routerId && agentKey) {
          routerQuery = routerQuery.eq("id", routerId).eq("agent_key", agentKey);
        } else if (token || body.token) {
          routerQuery = routerQuery.eq("onboard_token", (token || body.token) as string);
        } else {
          return json({ error: "Missing router authentication headers" }, 401);
        }

        const { data: router, error: authErr } = await routerQuery.maybeSingle();

        if (authErr || !router) {
          return json({ error: "Unauthorized: Invalid router credentials" }, 401);
        }

        if (router.is_disabled) {
          return json({ error: "Router disabled by administrator", status: "disabled" }, 403);
        }

        const clientIp =
          request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
          request.headers.get("cf-connecting-ip") ||
          null;

        const now = new Date().toISOString();

        // Convert CPU / Memory safely
        const cpuStr = body.cpu_load !== undefined ? String(body.cpu_load) : null;
        const freeMemStr = body.free_memory !== undefined ? String(body.free_memory) : null;
        const totalMemStr = body.total_memory !== undefined ? String(body.total_memory) : null;

        // Update real-time router status
        await supabaseAdmin
          .from("routers")
          .update({
            status: "online",
            last_seen_at: now,
            identity: (body.identity as string) ?? router.name,
            ros_version: (body.ros_version as string) ?? null,
            uptime: (body.uptime as string) ?? null,
            cpu_load: cpuStr,
            free_memory: freeMemStr,
            total_memory: totalMemStr,
            active_hotspot_users: Number(body.active_hotspot_users) || 0,
            active_pppoe_users: Number(body.active_pppoe_users) || 0,
            public_ip: clientIp,
          })
          .eq("id", router.id);

        const parsedHosts = parseHotspotActive(body.hs_active || url.searchParams.get("hs_active"));

        // Store telemetry snapshot (sample)
        await supabaseAdmin.from("router_heartbeats").insert({
          router_id: router.id,
          tenant_id: router.tenant_id,
          cpu_load:
            typeof body.cpu_load === "number" ? body.cpu_load : parseInt(cpuStr || "0", 10) || 0,
          free_memory:
            typeof body.free_memory === "number"
              ? body.free_memory
              : parseInt(freeMemStr || "0", 10) || 0,
          uptime: (body.uptime as string) || null,
          active_hotspot_users: Number(body.active_hotspot_users) || 0,
          active_pppoe_users: Number(body.active_pppoe_users) || 0,
          config_version: router.configuration_version,
          ip_address: clientIp,
          raw: {
            ...body,
            hosts: parsedHosts.length > 0 ? parsedHosts : (body.hosts as unknown),
          } as never,
        });

        // Check if there are pending queued commands
        const { count: pendingCommandsCount } = await supabaseAdmin
          .from("router_commands")
          .select("id", { count: "exact", head: true })
          .eq("router_id", router.id)
          .eq("status", "queued");

        const syncRequired =
          (router.desired_configuration_version || 1) > (router.configuration_version || 1);

        // Trigger background maintenance task (session expiration/cleanup)
        try {
          const { runBackgroundMaintenance } = await import("@/lib/maintenance.server");
          // Await to ensure execution completes in serverless environments
          await runBackgroundMaintenance();
        } catch (e) {
          console.error("[Heartbeat] Maintenance Error:", e);
        }

        return json({
          success: true,
          status: "online",
          configuration_version: router.configuration_version || 1,
          desired_configuration_version: router.desired_configuration_version || 1,
          sync_required: syncRequired,
          pending_commands_count: pendingCommandsCount || 0,
          timestamp: now,
        });
      },
    },
  },
});
