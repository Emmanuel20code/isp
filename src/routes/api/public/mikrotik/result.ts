import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/mikrotik/result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = request.headers.get("x-agent-key") ?? "";
        if (key.length < 10) return new Response("Missing agent key", { status: 401 });

        let rawText = "";
        try {
          rawText = await request.text();
        } catch {
          /* ignore */
        }

        const params = new URLSearchParams(rawText);
        const id = params.get("id");
        const ok = params.get("ok") === "true";

        if (!id) return new Response("Missing id", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: router } = await supabaseAdmin
          .from("routers")
          .select("id")
          .eq("agent_key", key)
          .maybeSingle();

        if (!router) return new Response("Unknown agent key", { status: 401 });

        await supabaseAdmin
          .from("router_commands")
          .update({
            status: ok ? "done" : "failed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("router_id", router.id);

        return new Response("OK");
      },
    },
  },
});
