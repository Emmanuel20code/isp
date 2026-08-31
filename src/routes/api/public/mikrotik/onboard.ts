import { createFileRoute } from "@tanstack/react-router";
import { getPublicBaseUrl, generateMikrotikDualConfig } from "@/lib/mikrotik";

export const Route = createFileRoute("/api/public/mikrotik/onboard")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let rawText = "";
        try {
          rawText = await request.text();
        } catch {
          /* ignore */
        }

        const params = new URLSearchParams(rawText);
        const rawToken = params.get("token") || request.headers.get("x-onboard-token") || "";
        const token = rawToken.trim().toUpperCase();

        if (!token) {
          return new Response(':log error "Wifi Billing Onboarding Failed: Missing token";', {
            status: 400,
            headers: { "content-type": "text/plain" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: router } = await supabaseAdmin
          .from("routers")
          .select("id, agent_key, status, onboard_token_expires_at")
          .eq("onboard_token", token)
          .maybeSingle();

        if (!router) {
          return new Response(
            ':log error "Wifi Billing Onboarding Failed: Invalid or unrecognized onboarding token";',
            { status: 401, headers: { "content-type": "text/plain" } },
          );
        }

        // Check expiration
        if (
          router.onboard_token_expires_at &&
          new Date(router.onboard_token_expires_at).getTime() < Date.now()
        ) {
          return new Response(
            ':log error "Wifi Billing Onboarding Failed: Onboarding token has expired. Please regenerate a token in the dashboard.";',
            { status: 403, headers: { "content-type": "text/plain" } },
          );
        }

        // Record onboarding timestamp and invalidate onboarding token (single-use)
        await supabaseAdmin
          .from("routers")
          .update({
            onboarded_at: new Date().toISOString(),
            onboard_token_expires_at: new Date(0).toISOString(), // single-use: invalidate now!
          })
          .eq("id", router.id);

        const baseUrl = getPublicBaseUrl(request);
        const syncUrl = `${baseUrl}/api/public/mikrotik/sync`;

        // Generate complete unified dual Hotspot + PPPoE RouterOS configuration
        const rsc = generateMikrotikDualConfig(syncUrl, router.agent_key);

        return new Response(rsc, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        });
      },
      GET: async ({ request }) => {
        // Handle GET requests with token query param for convenience
        const url = new URL(request.url);
        const rawToken = url.searchParams.get("token") || "";
        const token = rawToken.trim().toUpperCase();

        if (!token) {
          return new Response(':log error "Wifi Billing Onboarding Failed: Missing token";', {
            status: 400,
            headers: { "content-type": "text/plain" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: router } = await supabaseAdmin
          .from("routers")
          .select("id, agent_key, status, onboard_token_expires_at")
          .eq("onboard_token", token)
          .maybeSingle();

        if (!router) {
          return new Response(
            ':log error "Wifi Billing Onboarding Failed: Invalid or unrecognized onboarding token";',
            { status: 401, headers: { "content-type": "text/plain" } },
          );
        }

        if (
          router.onboard_token_expires_at &&
          new Date(router.onboard_token_expires_at).getTime() < Date.now()
        ) {
          return new Response(
            ':log error "Wifi Billing Onboarding Failed: Token expired. Regenerate in Wifi Billing dashboard.";',
            { status: 403, headers: { "content-type": "text/plain" } },
          );
        }

        // Record onboarding timestamp and invalidate onboarding token (single-use)
        await supabaseAdmin
          .from("routers")
          .update({
            onboarded_at: new Date().toISOString(),
            onboard_token_expires_at: new Date(0).toISOString(), // single-use: invalidate now!
          })
          .eq("id", router.id);

        const baseUrl = getPublicBaseUrl(request);
        const syncUrl = `${baseUrl}/api/public/mikrotik/sync`;
        const rsc = generateMikrotikDualConfig(syncUrl, router.agent_key);

        return new Response(rsc, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        });
      },
    },
  },
});
