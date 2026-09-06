// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/mikrotik/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => handleWebhook(request),
      POST: async ({ request }) => handleWebhook(request),
    },
  },
});

async function handleWebhook(request: Request): Promise<Response> {
  const url = new URL(request.url);

  const routerId =
    request.headers.get("x-router-id") ||
    url.searchParams.get("router_id") ||
    url.searchParams.get("id");
  const agentKey =
    request.headers.get("x-agent-key") ||
    url.searchParams.get("agent_key") ||
    url.searchParams.get("key");
  const token = url.searchParams.get("token");

  const event = url.searchParams.get("event") || "login";
  const username = url.searchParams.get("username") || "";
  const mac = url.searchParams.get("mac") || "";
  const ip = url.searchParams.get("ip") || "";

  console.log(
    `[MikroTik Webhook] Event: ${event}, Router: ${routerId}, User: ${username}, MAC: ${mac}, IP: ${ip}`,
  );

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let router: any = null;
  const providedKey = agentKey || token;

  if (routerId && providedKey) {
    const { data: r1 } = await supabaseAdmin
      .from("routers")
      .select("id, tenant_id, agent_key, onboard_token, is_disabled")
      .eq("id", routerId)
      .maybeSingle();

    if (r1 && (r1.agent_key === providedKey || r1.onboard_token === providedKey)) {
      router = r1;
    }
  } else if (providedKey) {
    const { data: r2 } = await supabaseAdmin
      .from("routers")
      .select("id, tenant_id, agent_key, onboard_token, is_disabled")
      .or(`agent_key.eq.${providedKey},onboard_token.eq.${providedKey}`)
      .maybeSingle();
    if (r2) {
      router = r2;
    }
  }

  if (!router) {
    console.error(`[MikroTik Webhook] Auth failed for routerId: ${routerId}`);
    return json({ error: "Unauthorized" }, 401);
  }

  if (router.is_disabled) {
    return json({ error: "Router disabled" }, 403);
  }

  // Update router last seen and status
  const now = new Date().toISOString();
  await supabaseAdmin
    .from("routers")
    .update({
      status: "online",
      online_status: true,
      last_seen_at: now,
      last_seen: now,
    })
    .eq("id", router.id);

  // If username is present, record connection or update customer state
  if (username) {
    try {
      if (event === "login") {
        // Mark customer/voucher as active & log event
        await supabaseAdmin
          .from("customers")
          .update({
            status: "active",
            mac_address: mac || undefined,
            last_login_at: now,
          })
          .eq("tenant_id", router.tenant_id)
          .eq("username", username);

        console.log(
          `[MikroTik Webhook] User ${username} logged in successfully on router ${router.id}`,
        );
      } else if (event === "logout") {
        console.log(`[MikroTik Webhook] User ${username} logged out from router ${router.id}`);
      }
    } catch (e) {
      console.error("[MikroTik Webhook] Error updating customer state:", e);
    }
  }

  return json({ status: "ok", received: true, event, username });
}
