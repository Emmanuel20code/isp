import { createFileRoute } from "@tanstack/react-router";
import { getPublicBaseUrl, generateMikrotikDualConfig } from "@/lib/mikrotik";

export const Route = createFileRoute("/api/public/mikrotik/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = request.headers.get("x-agent-key") ?? "";
        if (key.length < 10) {
          return new Response(':log error "Wifi Billing Sync: Missing or invalid agent key";', {
            status: 401,
            headers: { "content-type": "text/plain" },
          });
        }

        let rawText = "";
        try {
          rawText = await request.text();
        } catch {
          /* ignore */
        }

        const params = new URLSearchParams(rawText);
        const identity = params.get("identity") || null;
        const ros_version = params.get("version") || null;
        const uptime = params.get("uptime") || null;
        const hotspot_users = parseInt(params.get("hotspot_users") || "0", 10);
        const pppoe_users = parseInt(params.get("pppoe_users") || "0", 10);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: router } = await supabaseAdmin
          .from("routers")
          .select("id, tenant_id, name")
          .eq("agent_key", key)
          .maybeSingle();

        if (!router) {
          return new Response(':log error "Wifi Billing Sync: Unrecognized agent key";', {
            status: 401,
            headers: { "content-type": "text/plain" },
          });
        }

        // Router is actively connected and calling sync endpoint!
        await supabaseAdmin
          .from("routers")
          .update({
            status: "online",
            last_seen_at: new Date().toISOString(),
            identity: identity || undefined,
            ros_version: ros_version || undefined,
            uptime: uptime || undefined,
            active_hotspot_users: isNaN(hotspot_users) ? 0 : hotspot_users,
            active_pppoe_users: isNaN(pppoe_users) ? 0 : pppoe_users,
          })
          .eq("id", router.id);

        // Run background maintenance tasks (trial expirations, customer disconnects)
        const { runBackgroundMaintenance } = await import("@/lib/maintenance.server");
        runBackgroundMaintenance().catch((err) =>
          console.error("[sync] Background maintenance trigger error:", err),
        );

        const { data: queued } = await supabaseAdmin
          .from("router_commands")
          .select("id, action, payload")
          .eq("router_id", router.id)
          .eq("status", "queued")
          .order("created_at", { ascending: true })
          .limit(10);

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

        const baseUrl = getPublicBaseUrl(request);
        const resultUrl = `${baseUrl}/api/public/mikrotik/result`;
        const syncUrl = `${baseUrl}/api/public/mikrotik/sync`;

        let rsc = "";
        for (const cmd of commands) {
          const p = (cmd.payload as Record<string, unknown>) || {};

          if (cmd.action === "sync.config") {
            // Apply full dual Hotspot + PPPoE on all ports
            rsc += generateMikrotikDualConfig(syncUrl, key) + "\n";
          } else if (cmd.action === "test.connection") {
            rsc += `:log info "Wifi Billing Connection Test: Success! Router is communicating with backend at ${baseUrl}";\n`;
          } else if (cmd.action === "hotspot.create_user") {
            const user = p.username || "";
            const pass = p.password || p.username || "";
            const prof = (p.profile as string) || "default";
            const comment = (p.comment as string) || "emmatech-hotspot";
            const rateLimit = (p.rate_limit as string) || "";
            const sharedUsers = Number(p.shared_users) || 1;
            const uptimeHours = Number(p.limit_uptime_hours) || 0;
            const uptimeStr = uptimeHours > 0 ? `${uptimeHours}h` : "";
            const mac = (p.mac as string) || "";

            if (prof !== "default" && rateLimit) {
              rsc += `:if ([:len [/ip hotspot user profile find name="${prof}"]] = 0) do={ /ip hotspot user profile add name="${prof}" rate-limit="${rateLimit}" shared-users=${sharedUsers} on-error={}; } else={ /ip hotspot user profile set [find name="${prof}"] rate-limit="${rateLimit}" shared-users=${sharedUsers} on-error={}; };\n`;
            }
            rsc += `/ip hotspot user remove [find name="${user}"];\n`;
            let addCmd = `/ip hotspot user add name="${user}" password="${pass}" profile="${prof}" comment="${comment}"`;
            if (uptimeStr) {
              addCmd += ` limit-uptime=${uptimeStr}`;
            }
            if (mac) {
              addCmd += ` mac-address="${mac}"`;
            }
            addCmd += ` on-error={};\n`;
            rsc += addCmd;
          } else if (cmd.action === "hotspot.remove_user") {
            const user = p.username || "";
            rsc += `/ip hotspot user remove [find name="${user}"];\n`;
            rsc += `/ip hotspot active remove [find user="${user}"];\n`;
          } else if (cmd.action === "hotspot.disconnect") {
            const user = p.username || "all";
            if (user === "all") {
              rsc += `/ip hotspot active remove [find];\n`;
            } else {
              rsc += `/ip hotspot active remove [find user="${user}"];\n`;
            }
          } else if (cmd.action === "hotspot.bind_mac") {
            const mac = p.mac || "";
            const comment = p.comment || "emmatech-bypassed";
            if (mac) {
              rsc += `/ip hotspot ip-binding remove [find mac-address="${mac}"];\n`;
              rsc += `/ip hotspot ip-binding add mac-address="${mac}" type=bypassed comment="${comment}" on-error={};\n`;
            }
          } else if (cmd.action === "hotspot.unbind_mac") {
            const mac = p.mac || "";
            if (mac) {
              rsc += `/ip hotspot ip-binding remove [find mac-address="${mac}"];\n`;
            }
          } else if (cmd.action === "pppoe.create_user") {
            const user = p.username || "";
            const pass = p.password || "";
            const prof = p.profile || "emmatech-pppoe-prof";
            const comment = p.comment || "emmatech-pppoe";
            rsc += `/ppp secret remove [find name="${user}"];\n`;
            rsc += `/ppp secret add name="${user}" password="${pass}" service="pppoe" profile="${prof}" comment="${comment}" on-error={};\n`;
          } else if (cmd.action === "pppoe.remove_user") {
            const user = p.username || "";
            rsc += `/ppp secret remove [find name="${user}"];\n`;
            rsc += `/ppp active remove [find name="${user}"];\n`;
          } else if (cmd.action === "pppoe.disconnect") {
            const user = p.username || "all";
            if (user === "all") {
              rsc += `/ppp active remove [find service="pppoe"];\n`;
            } else {
              rsc += `/ppp active remove [find name="${user}"];\n`;
            }
          }

          // Report command execution success back to backend API
          rsc += `/tool fetch url="${resultUrl}" http-method=post http-header-field="x-agent-key: ${key}" http-data="id=${cmd.id}&ok=true" output=none on-error={};\n`;
        }

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
