// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const resultSchema = z.object({
  version: z.number().int(),
  success: z.boolean(),
  error: z.string().max(500).optional(),
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/mikrotik/config-result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const routerId = request.headers.get("x-router-id") || request.headers.get("X-Router-ID");
        const agentKey = request.headers.get("x-agent-key") || request.headers.get("X-Agent-Key");

        if (!routerId || !agentKey) {
          return json({ error: "Missing router credentials" }, 401);
        }

        let raw: unknown = {};
        try {
          raw = await request.json();
        } catch {
          raw = {};
        }

        const parsed = resultSchema.safeParse(raw);
        if (!parsed.success) {
          return json({ error: "Invalid payload" }, 400);
        }

        const body = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: router, error: authErr } = await supabaseAdmin
          .from("routers")
          .select("id, tenant_id")
          .eq("id", routerId)
          .eq("agent_key", agentKey)
          .maybeSingle();

        if (authErr || !router) {
          return json({ error: "Unauthorized" }, 401);
        }

        const now = new Date().toISOString();

        if (body.success) {
          await supabaseAdmin
            .from("routers")
            .update({
              configuration_version: body.version,
              sync_status: "synced",
              last_seen_at: now,
            })
            .eq("id", router.id);
        } else {
          await supabaseAdmin
            .from("routers")
            .update({
              sync_status: "error",
              last_error: body.error || "Configuration apply failure",
              last_seen_at: now,
            })
            .eq("id", router.id);
        }

        return json({ acknowledged: true });
      },
    },
  },
});
