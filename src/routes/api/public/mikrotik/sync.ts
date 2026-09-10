// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { getPublicBaseUrl } from "@/lib/mikrotik";

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
        // Automatically authorize the user by active login so they appear in 'active' sessions
        // and respect limit-uptime, instead of bypassing them.
        rscLines.push(`:local hip "";`);
        rscLines.push(
          `:do { :set hip [/ip hotspot host get [find mac-address="${mac}"] address]; } on-error={};`,
        );
        if (ip) {
          rscLines.push(`:if ([:len $hip] = 0) do={ :set hip "${ip}"; };`);
        }
        rscLines.push(`:if ([:len $hip] > 0) do={`);
        rscLines.push(
          `  :do { /ip hotspot active login user="${username}" password="${password}" mac-address="${mac}" ip=$hip; } on-error={};`,
        );
        rscLines.push(
          `  :log info "WiFiBilling: Active login executed for MAC ${mac} (user ${username})";`,
        );
        rscLines.push(`} else={`);
        rscLines.push(
          `  :log warning "WiFiBilling: Could not find IP for MAC ${mac} to execute active login";`,
        );
        rscLines.push(`};`);

        // Also remove any existing bypassed binding to ensure they are strictly rate-limited
        rscLines.push(
          `:do { /ip hotspot ip-binding remove [find mac-address="${mac}"]; } on-error={};`,
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
        rscLines.push(
          `:do { /ip hotspot active remove [find mac-address="${mac}"]; } on-error={};`,
        );
        rscLines.push(
          `:do { /ip hotspot cookie remove [find mac-address="${mac}"]; } on-error={};`,
        );
        rscLines.push(`:do { /ip hotspot host remove [find mac-address="${mac}"]; } on-error={};`);
      }
    } else if (cmd.action === "hotspot.unbind_mac") {
      const mac = String(p.mac || "")
        .trim()
        .toUpperCase();
      if (mac) {
        rscLines.push(`:log info "WiFiBilling: Unbinding MAC ${mac} (forcing captive portal)...";`);
        rscLines.push(
          `:do { /ip hotspot ip-binding remove [find mac-address="${mac}"]; } on-error={};`,
        );
        rscLines.push(`:do {`);
        rscLines.push(`  :foreach h in=[/ip hotspot host find mac-address="${mac}"] do={`);
        rscLines.push(`    :local hip [/ip hotspot host get $h address];`);
        rscLines.push(`    :if ([:len $hip] > 0) do={`);
        rscLines.push(
          `      :do { /ip firewall connection remove [find src-address~$hip]; } on-error={};`,
        );
        rscLines.push(
          `      :do { /ip firewall connection remove [find dst-address~$hip]; } on-error={};`,
        );
        rscLines.push(`    };`);
        rscLines.push(`  };`);
        rscLines.push(`  :foreach l in=[/ip dhcp-server lease find mac-address="${mac}"] do={`);
        rscLines.push(`    :local lip [/ip dhcp-server lease get $l address];`);
        rscLines.push(`    :if ([:len $lip] > 0) do={`);
        rscLines.push(
          `      :do { /ip firewall connection remove [find src-address~$lip]; } on-error={};`,
        );
        rscLines.push(
          `      :do { /ip firewall connection remove [find dst-address~$lip]; } on-error={};`,
        );
        rscLines.push(`    };`);
        rscLines.push(`  };`);
        rscLines.push(`} on-error={};`);
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
    } else if (
      cmd.action === "hotspot.harden_security" ||
      cmd.action === "hotspot.fix_unauthorized" ||
      cmd.action === "hotspot.fix_repeater" ||
      cmd.action === "hotspot.restore_billing"
    ) {
      rscLines.push(
        `:log warning "WiFiBilling: Restoring Hotspot Billing & Locking Captive Portal Enforcement...";`,
      );
      // 1. Remove rogue Anti-Repeater Mangle rule that spikes CPU to 100% and breaks routing
      rscLines.push(
        `:do { /ip firewall mangle remove [find comment="WiFiBilling: Anti-Repeater-NAT"]; } on-error={};`,
      );

      // 2. Fix Hotspot Profiles: Enforce HTTP-CHAP, HTTP-PAP and COOKIE for local synced authentication.
      // CRITICAL: Omit 'trial' from login-by to ensure free trial is disabled.
      // NEVER set trial-uptime-limit=0s (in RouterOS, 0s = UNLIMITED FREE TRIAL!).
      rscLines.push(
        `:do { /ip hotspot profile set [find] login-by=http-chap,http-pap,cookie split-user-domain=no http-cookie-lifetime=1d use-radius=no; } on-error={};`,
      );

      // 3. Ensure all Hotspot Servers are enabled and enforce 1 device per MAC
      rscLines.push(`:do { /ip hotspot set [find] disabled=no addresses-per-mac=1; } on-error={};`);
      rscLines.push(`:do { /ip hotspot enable [find]; } on-error={};`);

      // 4. Set 1 shared user on all hotspot user profiles with short keepalive
      rscLines.push(
        `:do { /ip hotspot user profile set [find] shared-users=1 status-autorefresh=1m keepalive-timeout=2m; } on-error={};`,
      );

      // 5. Re-enable Anti-DNS-Tunneling Protection: Force all client DNS requests (UDP/TCP 53)
      // to the router resolver. This completely stops users from getting free internet via
      // Ha Tunnel Plus, HTTP Custom, NapsternetV, SlowDNS, or TLS Tunnel!
      rscLines.push(`:do {`);
      rscLines.push(`  /ip hotspot walled-garden ip remove [find comment~"Allow DNS Queries"];`);
      rscLines.push(
        `  :if ([:len [/ip firewall nat find comment="WiFiBilling: Anti-DNS-Tunnel-UDP"]] = 0) do={`,
      );
      rscLines.push(
        `    /ip firewall nat add chain=dstnat protocol=udp dst-port=53 action=redirect to-ports=53 comment="WiFiBilling: Anti-DNS-Tunnel-UDP" place-before=0;`,
      );
      rscLines.push(`  };`);
      rscLines.push(
        `  :if ([:len [/ip firewall nat find comment="WiFiBilling: Anti-DNS-Tunnel-TCP"]] = 0) do={`,
      );
      rscLines.push(
        `    /ip firewall nat add chain=dstnat protocol=tcp dst-port=53 action=redirect to-ports=53 comment="WiFiBilling: Anti-DNS-Tunnel-TCP" place-before=0;`,
      );
      rscLines.push(`  };`);
      rscLines.push(`} on-error={};`);

      // 6. Block QUIC (UDP 443) and rogue tunnel proxy ports
      rscLines.push(`:do {`);
      rscLines.push(
        `  :if ([:len [/ip firewall filter find comment="block-quic-youtube-bypass"]] = 0) do={`,
      );
      rscLines.push(
        `    /ip firewall filter add chain=forward action=drop protocol=udp dst-port=443 comment="block-quic-youtube-bypass" place-before=0;`,
      );
      rscLines.push(`  };`);
      rscLines.push(
        `  :if ([:len [/ip firewall raw find comment="block-quic-youtube-bypass"]] = 0) do={`,
      );
      rscLines.push(
        `    /ip firewall raw add chain=prerouting action=drop protocol=udp dst-port=443 comment="block-quic-youtube-bypass";`,
      );
      rscLines.push(`  };`);
      rscLines.push(`} on-error={};`);

      // 7. Fix Captive Portal Detection: Remove OS probe domains from walled garden so phones detect portal
      rscLines.push(`:do {`);
      rscLines.push(`  /ip hotspot walled-garden remove [find dst-host="captive.apple.com"];`);
      rscLines.push(
        `  /ip hotspot walled-garden remove [find dst-host="connectivitycheck.gstatic.com"];`,
      );
      rscLines.push(
        `  /ip hotspot walled-garden remove [find dst-host="connectivitycheck.android.com"];`,
      );
      rscLines.push(`  /ip hotspot walled-garden remove [find dst-host="clients3.google.com"];`);
      rscLines.push(`  /ip hotspot walled-garden remove [find dst-host="msftconnecttest.com"];`);
      rscLines.push(
        `  /ip hotspot walled-garden remove [find dst-host="detectportal.firefox.com"];`,
      );
      rscLines.push(`} on-error={};`);

      // 8. Remove default unpassworded 'admin' hotspot user if present
      rscLines.push(`:do { /ip hotspot user remove [find name="admin"]; } on-error={};`);

      // 9. Flush active unauthenticated sessions and cookies so all users are immediately forced to captive portal
      rscLines.push(`:do { /ip hotspot cookie remove [find]; } on-error={};`);
      rscLines.push(`:do { /ip hotspot active remove [find]; } on-error={};`);
      rscLines.push(`:do { /ip hotspot host remove [find]; } on-error={};`);
      rscLines.push(
        `:log info "WiFiBilling: Hotspot Billing Restored and Captive Portal Enforced.";`,
      );
    } else if (cmd.action === "hotspot.kick_mac") {
      const macToKick = p.mac ? String(p.mac).toUpperCase() : "";
      if (macToKick) {
        rscLines.push(
          `:do { /ip hotspot active remove [find mac-address="${macToKick}"]; /ip hotspot host remove [find mac-address="${macToKick}"]; :log info "WiFiBilling: Disconnected MAC ${macToKick}"; } on-error={};`,
        );
      }
    } else if (cmd.action === "hotspot.scan_hosts") {
      const cleanBase = getPublicBaseUrl(request);
      const routerToken = router.onboard_token || router.agent_key;
      rscLines.push(`:log info "WiFiBilling: Running live MAC & Network Host Scan...";`);
      rscLines.push(`:do {`);
      rscLines.push(`  :local hsData "";`);
      rscLines.push(`  :foreach h in=[/ip hotspot host find] do={`);
      rscLines.push(`    :local hm [/ip hotspot host get $h mac-address];`);
      rscLines.push(`    :local hip [/ip hotspot host get $h address];`);
      rscLines.push(`    :local hup [/ip hotspot host get $h uptime];`);
      rscLines.push(`    :local haut [/ip hotspot host get $h authorized];`);
      rscLines.push(`    :local hbyp [/ip hotspot host get $h bypassed];`);
      rscLines.push(`    :local hstat "unauthorized";`);
      rscLines.push(`    :if ($haut = true) do={ :set hstat "authorized" };`);
      rscLines.push(`    :if ($hbyp = true) do={ :set hstat "bypassed" };`);
      rscLines.push(
        `    :set hsData ($hsData . $hm . "," . $hip . "," . $hup . "," . $hstat . "\\n");`,
      );
      rscLines.push(`  };`);
      rscLines.push(`  :foreach l in=[/ip dhcp-server lease find] do={`);
      rscLines.push(`    :local lm [/ip dhcp-server lease get $l mac-address];`);
      rscLines.push(`    :local lip [/ip dhcp-server lease get $l address];`);
      rscLines.push(`    :local lhn [/ip dhcp-server lease get $l host-name];`);
      rscLines.push(`    :local lst [/ip dhcp-server lease get $l status];`);
      rscLines.push(
        `    :set hsData ($hsData . $lm . "," . $lip . "," . $lhn . "," . $lst . "\\n");`,
      );
      rscLines.push(`  };`);
      rscLines.push(`  :if ([:len $hsData] > 0) do={`);
      rscLines.push(
        `    /tool fetch url="${cleanBase}/api/public/mikrotik/scan-report?token=${routerToken}&type=hosts" mode=https http-method=post http-data=("hosts=" . $hsData) check-certificate=no output=none;`,
      );
      rscLines.push(`  };`);
      rscLines.push(`} on-error={ :log warning "WiFiBilling: Live host scan report failed"; };`);
    } else if (cmd.action === "wireless.scan_nearby" || cmd.action === "wireless.snoop") {
      const cleanBase = getPublicBaseUrl(request);
      const routerToken = router.onboard_token || router.agent_key;
      rscLines.push(
        `:log info "WiFiBilling: Scanning nearby Over-the-Air Wireless MACs and BSSIDs...";`,
      );
      rscLines.push(`:do {`);
      rscLines.push(`  :local nData "";`);
      rscLines.push(`  :foreach n in=[/ip neighbor find] do={`);
      rscLines.push(`    :local nm [/ip neighbor get $n mac-address];`);
      rscLines.push(`    :local ni [/ip neighbor get $n identity];`);
      rscLines.push(`    :local nip [/ip neighbor get $n address];`);
      rscLines.push(`    :local nb [/ip neighbor get $n board];`);
      rscLines.push(`    :local nint [/ip neighbor get $n interface];`);
      rscLines.push(
        `    :set nData ($nData . $nm . "," . $ni . "," . $nip . "," . $nb . "," . $nint . "\\n");`,
      );
      rscLines.push(`  };`);
      rscLines.push(`  :if ([:len $nData] > 0) do={`);
      rscLines.push(
        `    /tool fetch url="${cleanBase}/api/public/mikrotik/scan-report?token=${routerToken}&type=nearby" mode=https http-method=post http-data=("neighbors=" . $nData) check-certificate=no output=none;`,
      );
      rscLines.push(`  };`);
      rscLines.push(`} on-error={ :log warning "WiFiBilling: Neighbor scan report failed"; };`);
      rscLines.push(
        `:do { /interface wireless scan [find default-name=wlan1] duration=5; } on-error={};`,
      );
      rscLines.push(`:do { /interface wifi scan [find] duration=5; } on-error={};`);
    } else if (cmd.action === "neighbor.scan") {
      const cleanBase = getPublicBaseUrl(request);
      const routerToken = router.onboard_token || router.agent_key;
      rscLines.push(
        `:log info "WiFiBilling: Scanning Layer-2 Network Neighbors (MNDP/CDP/LLDP)...";`,
      );
      rscLines.push(`:do {`);
      rscLines.push(`  :local nData "";`);
      rscLines.push(`  :foreach n in=[/ip neighbor find] do={`);
      rscLines.push(`    :local nm [/ip neighbor get $n mac-address];`);
      rscLines.push(`    :local ni [/ip neighbor get $n identity];`);
      rscLines.push(`    :local nip [/ip neighbor get $n address];`);
      rscLines.push(`    :local nb [/ip neighbor get $n board];`);
      rscLines.push(`    :local nint [/ip neighbor get $n interface];`);
      rscLines.push(
        `    :set nData ($nData . $nm . "," . $ni . "," . $nip . "," . $nb . "," . $nint . "\\n");`,
      );
      rscLines.push(`  };`);
      rscLines.push(`  :if ([:len $nData] > 0) do={`);
      rscLines.push(
        `    /tool fetch url="${cleanBase}/api/public/mikrotik/scan-report?token=${routerToken}&type=nearby" mode=https http-method=post http-data=("neighbors=" . $nData) check-certificate=no output=none;`,
      );
      rscLines.push(`  };`);
      rscLines.push(`} on-error={};`);
    } else if (cmd.action === "raw.command" || cmd.action === "sys.terminal") {
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
