import { createFileRoute } from "@tanstack/react-router";
import { MikroTikApiManager } from "@/lib/mikrotik-api.server";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/mikrotik/supabase-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader =
            request.headers.get("authorization") || request.headers.get("x-access-token");
          const body = await request.json().catch(() => ({}));

          console.log("[SupabaseCallback] Received realtime webhook payload:", body);

          const { type, table, record, old_record } = body;
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const mikrotikApi = new MikroTikApiManager(supabaseAdmin);

          // Handle customer / voucher / subscription status changes in real time
          if (table === "customers" && record) {
            const tenantId = record.tenant_id;
            const routerId = record.router_id;
            const username = record.username || record.phone;
            const status = record.status;
            const mac = record.mac_address;
            const ip = record.ip_address;

            if (status === "active") {
              console.log(
                `[SupabaseCallback] Realtime trigger: Customer ${username} is ACTIVE. Activating on MikroTik in real time.`,
              );
              await mikrotikApi.authorizeUser({
                tenantId,
                routerId,
                username,
                mac,
                ip,
                comment: `Realtime Supabase Activation - Status Active`,
              });
            } else if (status === "expired" || status === "suspended" || status === "inactive") {
              console.log(
                `[SupabaseCallback] Realtime trigger: Customer ${username} is ${status}. Disconnecting on MikroTik.`,
              );
              if (routerId) {
                await mikrotikApi.deactivateUserOnRouter({
                  tenantId,
                  routerId,
                  username,
                  mac: mac ?? undefined,
                });
              }
            }
          } else if (table === "transactions" && record) {
            // When payment transaction status becomes completed
            if (
              record.status === "completed" ||
              record.status === "success" ||
              record.result_code === 0
            ) {
              const tenantId = record.tenant_id;
              const rawMeta = (record.raw as Record<string, unknown>) || {};
              const username = String(rawMeta.username || rawMeta.phone || record.phone);
              const routerId = rawMeta.router_id ? String(rawMeta.router_id) : null;
              const mac = rawMeta.mac ? String(rawMeta.mac) : null;
              const ip = rawMeta.ip ? String(rawMeta.ip) : null;

              console.log(
                `[SupabaseCallback] Realtime transaction completed for ${username}. Activating internet immediately.`,
              );
              await mikrotikApi.authorizeUser({
                tenantId,
                routerId,
                username,
                mac,
                ip,
                comment: `Supabase Transaction Webhook - Paid & Authorized`,
              });
            }
          }

          return json({ success: true, processed: true });
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error("[SupabaseCallback] Error handling webhook:", errMsg);
          return json({ error: errMsg }, 500);
        }
      },
    },
  },
});
