// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/mikrotik/scan-report")({
  server: {
    handlers: {
      GET: async ({ request }) => handleScanReport(request),
      POST: async ({ request }) => handleScanReport(request),
    },
  },
});

async function handleScanReport(request: Request): Promise<Response> {
  const url = new URL(request.url);

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
  const token = url.searchParams.get("token");
  const reportType = url.searchParams.get("type") || "all";

  let body: Record<string, unknown> = {};
  const contentType = request.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      body = (await request.json()) as Record<string, unknown>;
    } else {
      const rawText = await request.text();
      try {
        body = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        const params = new URLSearchParams(rawText);
        body = Object.fromEntries(params.entries());
      }
    }
  } catch {
    body = {};
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let routerQuery = supabaseAdmin
    .from("routers")
    .select("id, tenant_id, name, agent_key, onboard_token, is_disabled");

  if (routerId && agentKey) {
    routerQuery = routerQuery.eq("id", routerId).eq("agent_key", agentKey);
  } else if (token || body.token) {
    const cleanToken = (token || body.token) as string;
    routerQuery = routerQuery.or(`onboard_token.eq.${cleanToken},agent_key.eq.${cleanToken}`);
  } else if (routerId) {
    routerQuery = routerQuery.eq("id", routerId);
  } else {
    return json({ error: "Missing router authentication" }, 401);
  }

  const { data: router, error: authErr } = await routerQuery.maybeSingle();

  if (authErr || !router) {
    return json({ error: "Unauthorized router" }, 401);
  }

  if (router.is_disabled) {
    return json({ error: "Router disabled" }, 403);
  }

  const now = new Date().toISOString();
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("cf-connecting-ip") ||
    null;

  // Process and normalize report payload
  // Accepts: hosts array or string, neighbors array or string, wireless_aps array or string
  let parsedHosts: any[] = [];
  let parsedNeighbors: any[] = [];
  let parsedWireless: any[] = [];

  // Parse hosts
  if (Array.isArray(body.hosts)) {
    parsedHosts = body.hosts;
  } else if (typeof body.hosts === "string" && body.hosts.trim()) {
    try {
      parsedHosts = JSON.parse(body.hosts);
    } catch {
      // Split comma or newline separated MAC lines
      parsedHosts = body.hosts
        .split(/[\r\n]+/)
        .map((line) => {
          const parts = line.split(/[,\s|]+/);
          return {
            mac: parts[0]?.trim(),
            ip: parts[1]?.trim(),
            uptime: parts[2]?.trim(),
            status: parts[3]?.trim() || "unauthenticated",
          };
        })
        .filter((h) => h.mac && h.mac.length >= 11);
    }
  }

  // Parse neighbors
  if (Array.isArray(body.neighbors)) {
    parsedNeighbors = body.neighbors;
  } else if (typeof body.neighbors === "string" && body.neighbors.trim()) {
    try {
      parsedNeighbors = JSON.parse(body.neighbors);
    } catch {
      parsedNeighbors = body.neighbors
        .split(/[\r\n]+/)
        .map((line) => {
          const parts = line.split(/[,\s|]+/);
          return {
            mac: parts[0]?.trim(),
            identity: parts[1]?.trim(),
            ip: parts[2]?.trim(),
            board: parts[3]?.trim(),
            interface: parts[4]?.trim(),
          };
        })
        .filter((n) => n.mac && n.mac.length >= 11);
    }
  }

  // Parse wireless APs / scan
  if (Array.isArray(body.wireless)) {
    parsedWireless = body.wireless;
  } else if (Array.isArray(body.wireless_scan)) {
    parsedWireless = body.wireless_scan;
  } else if (typeof body.wireless === "string" && body.wireless.trim()) {
    try {
      parsedWireless = JSON.parse(body.wireless);
    } catch {
      parsedWireless = body.wireless
        .split(/[\r\n]+/)
        .map((line) => {
          const parts = line.split(/[,\s|]+/);
          return {
            mac: parts[0]?.trim(),
            ssid: parts[1]?.trim(),
            signal: parseInt(parts[2]?.trim() || "-70", 10),
            channel: parts[3]?.trim(),
          };
        })
        .filter((w) => w.mac && w.mac.length >= 11);
    }
  }

  // Save the real telemetry snapshot in router_heartbeats
  await supabaseAdmin.from("router_heartbeats").insert({
    router_id: router.id,
    tenant_id: router.tenant_id,
    ip_address: clientIp,
    active_hotspot_users: parsedHosts.filter(
      (h) => h.authorized === true || h.status === "authorized",
    ).length,
    active_pppoe_users: 0,
    config_version: 1,
    raw: {
      reportType,
      timestamp: now,
      hosts: parsedHosts,
      neighbors: parsedNeighbors,
      wireless_scan: parsedWireless,
      source: "mikrotik_scan_report",
      body,
    } as never,
  });

  // Also update router's last_seen
  await supabaseAdmin
    .from("routers")
    .update({
      last_seen_at: now,
      last_seen: now,
      status: "online",
      online_status: true,
    })
    .eq("id", router.id);

  console.log(
    `[MikroTik Scan Report] Router ${router.name} (${router.id}) reported: ` +
      `${parsedHosts.length} hosts, ${parsedNeighbors.length} neighbors, ${parsedWireless.length} wireless APs.`,
  );

  return json({
    success: true,
    routerId: router.id,
    hostsReceived: parsedHosts.length,
    neighborsReceived: parsedNeighbors.length,
    wirelessReceived: parsedWireless.length,
    timestamp: now,
  });
}
