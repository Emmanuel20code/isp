// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { generateUniversalOnboardingScript, getPublicBaseUrl } from "@/lib/mikrotik";

export const Route = createFileRoute("/api/public/mikrotik/config")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const routerId = request.headers.get("x-router-id") || request.headers.get("X-Router-ID");
        const agentKey = request.headers.get("x-agent-key") || request.headers.get("X-Agent-Key");

        if (!routerId || !agentKey) {
          return new Response("# ERROR: Missing credentials\n", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: router, error: authErr } = await supabaseAdmin
          .from("routers")
          .select(
            "id, tenant_id, name, agent_key, onboard_token, desired_configuration_version, walled_garden_domains",
          )
          .eq("id", routerId)
          .eq("agent_key", agentKey)
          .maybeSingle();

        if (authErr || !router) {
          return new Response("# ERROR: Unauthorized\n", { status: 401 });
        }

        const { data: tenant } = await supabaseAdmin
          .from("tenants")
          .select("id, name, slug")
          .eq("id", router.tenant_id)
          .maybeSingle();

        const baseUrl = getPublicBaseUrl(request);
        const tenantSlug = tenant?.slug || tenant?.id || router.tenant_id;
        const tenantName = tenant?.name || "WiFi Hotspot";

        const scriptContent = generateUniversalOnboardingScript({
          routerId: router.id,
          tenantId: router.tenant_id,
          tenantSlug,
          tenantName,
          onboardToken: router.onboard_token || "renew",
          agentKey: router.agent_key,
          baseUrl,
          customWalledGarden: router.walled_garden_domains || [],
        });

        return new Response(scriptContent, {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        });
      },
    },
  },
});
