// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";

async function handleSyncRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  let bearerToken = "";
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    bearerToken = authHeader.substring(7).trim();
  }

  const routerId =
    request.headers.get("x-router-id") ||
    request.headers.get("X-Router-ID") ||
    url.searchParams.get("router_id") ||
    url.searchParams.get("id");
  const agentKey =
    request.headers.get("x-agent-key") ||
    request.headers.get("X-Agent-Key") ||
    url.searchParams.get("agent_key") ||
    url.searchParams.get("key");
  const token = bearerToken || url.searchParams.get("token");

  // Read post data if present
  const bodyData: Record<string, string> = {};
  if (request.method === "POST") {
    try {
      const text = await request.text();
      if (text) {
        const params = new URLSearchParams(text);
        params.forEach((value, key) => {
          bodyData[key] = value;
        });
      }
    } catch {
      // ignore body parse errors
    }
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let router: any = null;
  const providedKey = agentKey || token;

  if (routerId && providedKey) {
    const { data: r1 } = await supabaseAdmin
      .from("routers")
      .select("id, tenant_id, is_disabled, name, agent_key, onboard_token")
      .eq("id", routerId)
      .maybeSingle();

    if (r1 && (r1.agent_key === providedKey || r1.onboard_token === providedKey)) {
      router = r1;
    }
  } else if (providedKey) {
    const { data: r2 } = await supabaseAdmin
      .from("routers")
      .select("id, tenant_id, is_disabled, name, agent_key, onboard_token")
      .or(`agent_key.eq.${providedKey},onboard_token.eq.${providedKey}`)
      .maybeSingle();
    if (r2) {
      router = r2;
    }
  }

  if (!router) {
    console.error(
      `[MikroTik Sync] Auth failed for routerId: ${routerId}, token: ${token}, agentKey: ${agentKey}`,
    );
    return new Response("# ERROR: Unauthorized\n", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  console.log(
    `[MikroTik Sync] Router ${router.name} (${router.id}) connected. Checking for commands...`,
  );

  if (router.is_disabled) {
    return new Response("# Router disabled by admin\n", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("cf-connecting-ip") ||
    null;

  // Update heartbeat / sync status and telemetry if body metrics are sent
  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    last_seen_at: now,
    status: "online",
    onboarded_at: now,
    sync_status: "synced",
    public_ip: clientIp,
  };

  if (bodyData.identity) {
    updatePayload.name = bodyData.identity;
  }
  if (bodyData.version) {
    updatePayload.ros_version = bodyData.version;
  }
  if (bodyData.uptime) {
    updatePayload.uptime = bodyData.uptime;
  }
  if (bodyData.hotspot_users !== undefined) {
    updatePayload.active_hotspot_users = Number(bodyData.hotspot_users) || 0;
  }
  if (bodyData.pppoe_users !== undefined) {
    updatePayload.active_pppoe_users = Number(bodyData.pppoe_users) || 0;
  }

  await supabaseAdmin.from("routers").update(updatePayload).eq("id", router.id);

  // Proactively run maintenance check to ensure any newly expired sessions are enqueued immediately
  try {
    const { runBackgroundMaintenance } = await import("@/lib/maintenance.server");
    await runBackgroundMaintenance(false);
  } catch (mErr) {
    console.error("[mikrotik-sync] Auto-maintenance error:", mErr);
  }

  // Fetch pending commands
  const { data: queuedCommands } = await supabaseAdmin
    .from("router_commands")
    .select("id, action, payload")
    .eq("router_id", router.id)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(30);

  const commands = queuedCommands || [];

  if (commands.length === 0) {
    return new Response("# WiFiBilling: No pending commands\n", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Generate RouterOS commands script
  const rscLines: string[] = [
    `# WiFiBilling Command Batch (${commands.length} actions)`,
    `:log info "WiFiBilling: Executing ${commands.length} remote sync commands...";`,
  ];

  const deliveredIds: string[] = [];

  for (const cmd of commands) {
    deliveredIds.push(cmd.id);
    const p = (cmd.payload || {}) as Record<string, unknown>;

    if (cmd.action === "hotspot.create_user") {
      const username = String(p.username || "").replace(/"/g, "");
      const password = String(p.password || username).replace(/"/g, "");
      const profile = String(p.profile || "default").replace(/"/g, "");
      const comment = String(p.comment || "WiFiBilling User").replace(/"/g, "");
      const limitHours = Number(p.limit_uptime_hours) || 0;
      // Convert hours to MikroTik duration format (HH:MM:SS)
      const totalSeconds = Math.floor(limitHours * 3600);
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      const limitStr = `${h}:${m}:${s}`;
      const mac = p.mac ? String(p.mac).trim() : null;
      const ip = p.ip ? String(p.ip).trim() : null;

      if (p.rate_limit) {
        const rateLimit = String(p.rate_limit).replace(/"/g, "");
        const sharedUsers = Number(p.shared_users) || 1;
        rscLines.push(`:if ([:len [/ip hotspot user profile find name="${profile}"]] = 0) do={`);
        rscLines.push(
          `  /ip hotspot user profile add name="${profile}" rate-limit="${rateLimit}" shared-users=${sharedUsers} status-autorefresh=1m;`,
        );
        rscLines.push(`} else={`);
        rscLines.push(
          `  /ip hotspot user profile set [find name="${profile}"] rate-limit="${rateLimit}" shared-users=${sharedUsers} status-autorefresh=1m;`,
        );
        rscLines.push(`};`);
      }

      rscLines.push(`:if ([:len [/ip hotspot user find name="${username}"]] = 0) do={`);
      rscLines.push(
        `  /ip hotspot user add name="${username}" password="${password}" profile="${profile}" ${limitHours > 0 ? `limit-uptime=${limitStr}` : ""} comment="${comment}";`,
      );
      rscLines.push(`} else={`);
      rscLines.push(
        `  /ip hotspot user set [find name="${username}"] password="${password}" profile="${profile}" ${limitHours > 0 ? `limit-uptime=${limitStr}` : ""} comment="${comment}";`,
      );
      rscLines.push(`};`);

      if (mac) {
        // Automatically add/update IP binding for immediate internet access without captive portal friction
        rscLines.push(`:if ([:len [/ip hotspot ip-binding find mac-address="${mac}"]] = 0) do={`);
        rscLines.push(
          `  /ip hotspot ip-binding add mac-address="${mac}" type=bypassed comment="${comment}";`,
        );
        rscLines.push(`} else={`);
        rscLines.push(
          `  /ip hotspot ip-binding set [find mac-address="${mac}"] type=bypassed comment="${comment}";`,
        );
        rscLines.push(`};`);
        rscLines.push(
          `:log info "WiFiBilling: Instant internet access granted for MAC ${mac} (user ${username})";`,
        );
      }
    } else if (cmd.action === "hotspot.delete_user") {
      const username = String(p.username || "").replace(/"/g, "");
      const mac = p.mac ? String(p.mac).trim() : null;

      rscLines.push(`:log info "WiFiBilling: Expiring user ${username}...";`);
      rscLines.push(`:do { /ip hotspot user remove [find name="${username}"]; } on-error={};`);
      rscLines.push(`:do { /ip hotspot active remove [find user="${username}"]; } on-error={};`);
      rscLines.push(`:do { /ip hotspot cookie remove [find user="${username}"]; } on-error={};`);

      if (mac) {
        rscLines.push(
          `:do { /ip hotspot ip-binding remove [find mac-address="${mac}"]; } on-error={};`,
        );
        rscLines.push(
          `:do { /ip hotspot active remove [find mac-address="${mac}"]; } on-error={};`,
        );
        rscLines.push(
          `:do { /ip hotspot cookie remove [find mac-address="${mac}"]; } on-error={};`,
        );
        rscLines.push(`:do { /ip hotspot host remove [find mac-address="${mac}"]; } on-error={};`);
      }
    } else if (cmd.action === "hotspot.disconnect") {
      const username = String(p.username || "").replace(/"/g, "");
      const mac = p.mac ? String(p.mac).trim() : null;

      if (username) {
        rscLines.push(`:log info "WiFiBilling: Disconnecting hotspot user ${username}...";`);
        rscLines.push(`:do { /ip hotspot active remove [find user="${username}"]; } on-error={};`);
        rscLines.push(`:do { /ip hotspot cookie remove [find user="${username}"]; } on-error={};`);
      }
      if (mac) {
        rscLines.push(
          `:do { /ip hotspot active remove [find mac-address="${mac}"]; } on-error={};`,
        );
        rscLines.push(
          `:do { /ip hotspot cookie remove [find mac-address="${mac}"]; } on-error={};`,
        );
        rscLines.push(`:do { /ip hotspot host remove [find mac-address="${mac}"]; } on-error={};`);
      }
    } else if (cmd.action === "hotspot.bind_mac") {
      const mac = String(p.mac || "")
        .trim()
        .toUpperCase();
      const comment = String(p.comment || "WiFiBilling Bypassed Device").replace(/"/g, "");
      if (mac) {
        rscLines.push(`:log info "WiFiBilling: Binding MAC ${mac}...";`);
        rscLines.push(`:if ([:len [/ip hotspot ip-binding find mac-address="${mac}"]] = 0) do={`);
        rscLines.push(
          `  /ip hotspot ip-binding add mac-address="${mac}" type=bypassed comment="${comment}";`,
        );
        rscLines.push(`} else={`);
        rscLines.push(
          `  /ip hotspot ip-binding set [find mac-address="${mac}"] type=bypassed comment="${comment}";`,
        );
        rscLines.push(`};`);
      }
    } else if (cmd.action === "hotspot.unbind_mac") {
      const mac = String(p.mac || "")
        .trim()
        .toUpperCase();
      if (mac) {
        rscLines.push(`:log info "WiFiBilling: Unbinding MAC ${mac}...";`);
        rscLines.push(
          `:do { /ip hotspot ip-binding remove [find mac-address="${mac}"]; } on-error={};`,
        );
        rscLines.push(
          `:do { /ip hotspot active remove [find mac-address="${mac}"]; } on-error={};`,
        );
        rscLines.push(
          `:do { /ip hotspot cookie remove [find mac-address="${mac}"]; } on-error={};`,
        );
        rscLines.push(`:do { /ip hotspot host remove [find mac-address="${mac}"]; } on-error={};`);
      }
    } else if (cmd.action === "pppoe.create_user") {
      const username = String(p.username || "").replace(/"/g, "");
      const password = String(p.password || "").replace(/"/g, "");
      const profile = String(p.profile || "default").replace(/"/g, "");
      const comment = String(p.comment || "WiFiBilling PPPoE").replace(/"/g, "");
      const disabled = p.disabled === true ? "yes" : "no";
      const rateLimit = p.rate_limit ? String(p.rate_limit).replace(/"/g, "") : null;

      if (profile && profile !== "default") {
        rscLines.push(`:if ([:len [/ppp profile find name="${profile}"]] = 0) do={`);
        rscLines.push(
          `  /ppp profile add name="${profile}" ${rateLimit ? `rate-limit="${rateLimit}"` : ""} dns-server=8.8.8.8,1.1.1.1;`,
        );
        rscLines.push(`} else={`);
        if (rateLimit) {
          rscLines.push(`  /ppp profile set [find name="${profile}"] rate-limit="${rateLimit}";`);
        }
        rscLines.push(`};`);
      }

      rscLines.push(`:if ([:len [/ppp secret find name="${username}"]] = 0) do={`);
      rscLines.push(
        `  /ppp secret add name="${username}" password="${password}" profile="${profile}" disabled=${disabled} comment="${comment}";`,
      );
      rscLines.push(`} else={`);
      rscLines.push(
        `  /ppp secret set [find name="${username}"] password="${password}" profile="${profile}" disabled=${disabled} comment="${comment}";`,
      );
      rscLines.push(`};`);

      if (disabled === "yes") {
        rscLines.push(`:do { /ppp active remove [find name="${username}"]; } on-error={};`);
      }
    } else if (cmd.action === "pppoe.update_user") {
      const username = String(p.username || "").replace(/"/g, "");
      const password = p.password !== undefined ? String(p.password).replace(/"/g, "") : undefined;
      const profile = p.profile !== undefined ? String(p.profile).replace(/"/g, "") : undefined;
      const disabled = typeof p.disabled === "boolean" ? p.disabled : undefined;

      if (username) {
        rscLines.push(`:log info "WiFiBilling: Updating PPPoE user ${username}...";`);
        let setCmd = `/ppp secret set [find name="${username}"]`;
        if (password !== undefined) setCmd += ` password="${password}"`;
        if (profile !== undefined) setCmd += ` profile="${profile}"`;
        if (disabled !== undefined) setCmd += ` disabled=${disabled ? "yes" : "no"}`;

        rscLines.push(`:if ([:len [/ppp secret find name="${username}"]] > 0) do={`);
        rscLines.push(`  ${setCmd};`);
        rscLines.push(`};`);

        if (disabled) {
          rscLines.push(`:do { /ppp active remove [find name="${username}"]; } on-error={};`);
        }
      }
    } else if (cmd.action === "pppoe.set_enabled") {
      const username = String(p.username || "").replace(/"/g, "");
      const enabled = Boolean(p.enabled);

      if (username) {
        rscLines.push(
          `:log info "WiFiBilling: Setting PPPoE user ${username} enabled=${enabled}...";`,
        );
        rscLines.push(`:if ([:len [/ppp secret find name="${username}"]] > 0) do={`);
        rscLines.push(
          `  /ppp secret set [find name="${username}"] disabled=${enabled ? "no" : "yes"};`,
        );
        rscLines.push(`};`);

        if (!enabled) {
          rscLines.push(`:do { /ppp active remove [find name="${username}"]; } on-error={};`);
        }
      }
    } else if (cmd.action === "pppoe.delete_user") {
      const username = String(p.username || "").replace(/"/g, "");
      rscLines.push(`:do { /ppp secret remove [find name="${username}"]; } on-error={};`);
      rscLines.push(`:do { /ppp active remove [find name="${username}"]; } on-error={};`);
    } else if (cmd.action === "walled_garden.add") {
      const domain = String(p.domain || "").replace(/"/g, "");
      if (domain) {
        rscLines.push(
          `:if ([:len [/ip hotspot walled-garden find dst-host="${domain}"]] = 0) do={`,
        );
        rscLines.push(
          `  /ip hotspot walled-garden add dst-host="${domain}" comment="WiFiBilling Dynamic";`,
        );
        rscLines.push(`};`);
      }
    } else if (cmd.action === "raw.command") {
      if (p.command) {
        rscLines.push(String(p.command));
      }
    }
  }

  rscLines.push(`:log info "WiFiBilling: Remote commands successfully executed.";`);

  // Mark commands as done
  await supabaseAdmin
    .from("router_commands")
    .update({
      status: "done",
      delivered_at: now,
      completed_at: now,
    })
    .in("id", deliveredIds);

  // Record sync log
  await supabaseAdmin.from("router_sync_logs").insert({
    router_id: router.id,
    tenant_id: router.tenant_id,
    action: "batch_command_sync",
    status: "success",
    details: { command_count: commands.length, ids: deliveredIds },
  });

  return new Response(rscLines.join("\n") + "\n", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

export const Route = createFileRoute("/api/public/mikrotik/sync")({
  server: {
    handlers: {
      GET: async ({ request }) => handleSyncRequest(request),
      POST: async ({ request }) => handleSyncRequest(request),
    },
  },
});
