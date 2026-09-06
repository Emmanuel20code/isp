// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const registerSchema = z.object({
  token: z.string().min(3),
  identity: z.string().max(100).optional(),
  ros_version: z.string().max(50).optional(),
  model: z.string().max(100).optional(),
  serial_number: z.string().max(100).optional(),
  architecture: z.string().max(50).optional(),
  uptime: z.string().max(60).optional(),
  cpu_load: z.union([z.string(), z.number()]).optional(),
  free_memory: z.union([z.string(), z.number()]).optional(),
  total_memory: z.union([z.string(), z.number()]).optional(),
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/mikrotik/register")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token") || url.searchParams.get("t");
        if (!token) {
          return json({ error: "Missing token query parameter" }, 400);
        }

        const rawIdentity = url.searchParams.get("identity");
        const rawVersion = url.searchParams.get("ros_version") || url.searchParams.get("version");
        const rawModel = url.searchParams.get("model");
        const rawSerial = url.searchParams.get("serial_number") || url.searchParams.get("serial");
        const rawArch = url.searchParams.get("architecture") || url.searchParams.get("arch");
        const rawUptime = url.searchParams.get("uptime");
        const rawCpu = url.searchParams.get("cpu_load") || url.searchParams.get("cpu");
        const rawFreeMem = url.searchParams.get("free_memory") || url.searchParams.get("free_mem");
        const rawTotMem = url.searchParams.get("total_memory") || url.searchParams.get("total_mem");

        const body = {
          token,
          identity: rawIdentity ? rawIdentity.replace(/_/g, " ").trim() : undefined,
          ros_version: rawVersion ? rawVersion.replace(/_/g, " ").trim() : undefined,
          model: rawModel ? rawModel.replace(/_/g, " ").trim() : undefined,
          serial_number: rawSerial ? rawSerial.replace(/_/g, " ").trim() : undefined,
          architecture: rawArch ? rawArch.replace(/_/g, " ").trim() : undefined,
          uptime: rawUptime ? rawUptime.replace(/_/g, " ").trim() : undefined,
          cpu_load: rawCpu ? String(rawCpu).trim() : undefined,
          free_memory: rawFreeMem ? String(rawFreeMem).trim() : undefined,
          total_memory: rawTotMem ? String(rawTotMem).trim() : undefined,
        };

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: router, error: findErr } = await supabaseAdmin
          .from("routers")
          .select("id, tenant_id, name, agent_key, configuration_version")
          .eq("onboard_token", body.token)
          .maybeSingle();

        if (findErr || !router) {
          return json({ error: "Invalid or expired onboarding token" }, 403);
        }

        const clientIp =
          request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
          request.headers.get("cf-connecting-ip") ||
          null;
        const now = new Date().toISOString();

        await supabaseAdmin
          .from("routers")
          .update({
            status: "online",
            online_status: true,
            identity: body.identity || router.name,
            ros_version: body.ros_version || null,
            model: body.model || null,
            serial_number: body.serial_number || null,
            architecture: body.architecture || null,
            uptime: body.uptime || null,
            cpu_load: body.cpu_load || null,
            free_memory: body.free_memory || null,
            total_memory: body.total_memory || null,
            public_ip: clientIp,
            onboarded_at: now,
            last_seen_at: now,
            last_seen: now,
            heartbeat_at: now,
            sync_status: "synced",
          })
          .eq("id", router.id);

        // Record initial heartbeat record
        await supabaseAdmin.from("router_heartbeats").insert({
          router_id: router.id,
          tenant_id: router.tenant_id,
          cpu_load: parseInt(body.cpu_load || "0", 10) || 0,
          free_memory: parseInt(body.free_memory || "0", 10) || 0,
          uptime: body.uptime || null,
          active_hotspot_users: 0,
          active_pppoe_users: 0,
          config_version: router.configuration_version || 1,
          ip_address: clientIp,
        });

        // Record audit log
        await supabaseAdmin.from("audit_logs").insert({
          tenant_id: router.tenant_id,
          action: "router.registered",
          entity_type: "router",
          entity_id: router.id,
          metadata: {
            identity: body.identity,
            ros_version: body.ros_version,
            model: body.model,
            serial_number: body.serial_number,
            architecture: body.architecture,
            uptime: body.uptime,
            ip: clientIp,
          },
        });

        return json({
          success: true,
          status: "online",
          router_id: router.id,
          agent_key: router.agent_key,
          message: "Router onboarded and registered successfully",
        });
      },
      POST: async ({ request }) => {
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

        const parsed = registerSchema.safeParse(body);
        if (!parsed.success) {
          return json(
            { error: "Invalid registration payload", details: parsed.error.format() },
            400,
          );
        }

        const data = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: router, error: findErr } = await supabaseAdmin
          .from("routers")
          .select("id, tenant_id, name, agent_key, configuration_version")
          .eq("onboard_token", data.token)
          .maybeSingle();

        if (findErr || !router) {
          return json({ error: "Invalid or expired onboarding token" }, 403);
        }

        const clientIp =
          request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
          request.headers.get("cf-connecting-ip") ||
          null;

        const now = new Date().toISOString();
        const cpuStr = data.cpu_load !== undefined ? String(data.cpu_load) : null;
        const freeMemStr = data.free_memory !== undefined ? String(data.free_memory) : null;
        const totMemStr = data.total_memory !== undefined ? String(data.total_memory) : null;

        // Update router hardware details & set to online
        await supabaseAdmin
          .from("routers")
          .update({
            status: "online",
            online_status: true,
            identity: data.identity || router.name,
            ros_version: data.ros_version || null,
            model: data.model || null,
            serial_number: data.serial_number || null,
            architecture: data.architecture || null,
            uptime: data.uptime || null,
            cpu_load: cpuStr,
            free_memory: freeMemStr,
            total_memory: totMemStr,
            public_ip: clientIp,
            onboarded_at: now,
            last_seen_at: now,
            last_seen: now,
            heartbeat_at: now,
            sync_status: "synced",
          })
          .eq("id", router.id);

        // Store heartbeat log
        await supabaseAdmin.from("router_heartbeats").insert({
          router_id: router.id,
          tenant_id: router.tenant_id,
          cpu_load: parseInt(cpuStr || "0", 10) || 0,
          free_memory: parseInt(freeMemStr || "0", 10) || 0,
          uptime: data.uptime || null,
          active_hotspot_users: 0,
          active_pppoe_users: 0,
          config_version: router.configuration_version || 1,
          ip_address: clientIp,
        });

        // Record audit log
        await supabaseAdmin.from("audit_logs").insert({
          tenant_id: router.tenant_id,
          action: "router.registered",
          entity_type: "router",
          entity_id: router.id,
          metadata: {
            identity: data.identity,
            ros_version: data.ros_version,
            model: data.model,
            serial_number: data.serial_number,
            ip: clientIp,
          },
        });

        return json({
          success: true,
          status: "online",
          router_id: router.id,
          agent_key: router.agent_key,
          configuration_version: router.configuration_version || 1,
          message: "Router onboarded and registered successfully",
        });
      },
    },
  },
});
