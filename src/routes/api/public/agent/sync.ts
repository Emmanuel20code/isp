import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  agent_version: z.string().max(40).optional(),
  identity: z.string().max(80).optional(),
  ros_version: z.string().max(40).optional(),
  uptime: z.string().max(40).optional(),
  active_hotspot_users: z.number().int().min(0).max(100000).optional(),
  active_pppoe_users: z.number().int().min(0).max(100000).optional(),
  results: z
    .array(
      z.object({
        id: z.string().uuid(),
        ok: z.boolean(),
        result: z.unknown().optional(),
        error: z.string().max(500).optional(),
      }),
    )
    .max(50)
    .optional(),
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/agent/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = request.headers.get("x-agent-key") ?? "";
        if (key.length < 10) return json({ error: "Missing agent key" }, 401);

        let raw: unknown = {};
        try {
          raw = await request.json();
        } catch {
          raw = {};
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) return json({ error: "Invalid payload" }, 400);
        const body = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: router } = await supabaseAdmin
          .from("routers")
          .select("id, tenant_id, name")
          .eq("agent_key", key)
          .maybeSingle();
        if (!router) return json({ error: "Unknown agent key" }, 401);

        await supabaseAdmin
          .from("routers")
          .update({
            status: "online",
            last_seen_at: new Date().toISOString(),
            agent_version: body.agent_version ?? null,
            identity: body.identity ?? null,
            ros_version: body.ros_version ?? null,
            uptime: body.uptime ?? null,
            active_hotspot_users: body.active_hotspot_users ?? 0,
            active_pppoe_users: body.active_pppoe_users ?? 0,
          })
          .eq("id", router.id);

        for (const r of body.results ?? []) {
          await supabaseAdmin
            .from("router_commands")
            .update({
              status: r.ok ? "done" : "failed",
              result: (r.result ?? null) as never,
              error: r.ok ? null : (r.error ?? "Command failed"),
              completed_at: new Date().toISOString(),
            })
            .eq("id", r.id)
            .eq("router_id", router.id);
        }

        const { data: queued } = await supabaseAdmin
          .from("router_commands")
          .select("id, action, payload")
          .eq("router_id", router.id)
          .eq("status", "queued")
          .order("created_at", { ascending: true })
          .limit(20);

        const commands = queued ?? [];
        if (commands.length > 0) {
          await supabaseAdmin
            .from("router_commands")
            .update({ status: "delivered", delivered_at: new Date().toISOString() })
            .in(
              "id",
              commands.map((c) => c.id),
            );
        }

        return json({ router: { id: router.id, name: router.name }, commands, poll_seconds: 15 });
      },
    },
  },
});
