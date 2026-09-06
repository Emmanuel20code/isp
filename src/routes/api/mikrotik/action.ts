// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api/mikrotik/action")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let rawText = "";
        try {
          rawText = await request.text();
        } catch {
          /* ignore */
        }

        let payload: Record<string, unknown> = {};
        try {
          payload = JSON.parse(rawText);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const routerId = payload.routerId;
        const action = payload.action;

        if (!routerId || !action) return new Response("Missing fields", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: router } = await supabaseAdmin
          .from("routers")
          .select("tenant_id")
          .eq("id", routerId)
          .maybeSingle();

        if (!router) return new Response("Router not found", { status: 404 });

        await supabaseAdmin.from("router_commands").insert({
          tenant_id: router.tenant_id,
          router_id: routerId,
          action,
          payload: (payload.data as Record<string, unknown>) || {},
          status: "queued",
        });

        return new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
