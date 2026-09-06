import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  normalizeMac,
  getMacVendor,
  getSignalQuality,
  getFrequencyChannel,
} from "@/lib/mac-lookup";

async function requireTenant(supabase: Record<string, unknown>, userId: string): Promise<string> {
  const { data } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.tenant_id) throw new Error("No business found for this account");
  return data.tenant_id as string;
}

export interface DiscoveredMacDevice {
  id: string;
  mac: string;
  ip?: string | null;
  routerId: string;
  routerName: string;
  vendor: string;
  vendorCategory: "mobile" | "pc" | "ap" | "iot" | "tv" | "unknown";
  isRandomized: boolean;
  hostname?: string | null;
  customerName?: string | null;
  phone?: string | null;
  packageName?: string | null;
  status: "authorized" | "unauthenticated" | "bypassed" | "expired" | "disabled";
  expiresAt?: string | null;
  lastSeen?: string | null;
  bytesIn?: number | null;
  bytesOut?: number | null;
  uptime?: string | null;
  source: "hotspot_host" | "dhcp_lease" | "arp_table" | "active_customer" | "smart_tv";
  isBound: boolean;
}

export interface NearbyWirelessMacDevice {
  id: string;
  mac: string; // BSSID or physical MAC
  ssid?: string | null; // e.g. "Safaricom_Home_5G", "Starlink-VIP", "TP-Link_AP_Hall"
  channelText: string; // e.g. "Ch 6 (2.4 GHz)" or "Ch 36 (5 GHz)"
  frequency: number; // e.g. 2437 MHz
  band: "2.4 GHz" | "5 GHz" | "6 GHz" | "Unknown";
  signalDbm: number; // e.g. -64 dBm
  signalQuality: {
    rating: "Excellent" | "Good" | "Fair" | "Poor" | "Very Weak";
    percentage: number;
    color: string;
  };
  security: string; // "WPA2-PSK", "WPA3", "Open", "WPA2/WPA3", "Enterprise"
  vendor: string; // "Ubiquiti UniFi", "Ruijie", "TP-Link", "MikroTik", etc.
  vendorCategory: "mobile" | "pc" | "ap" | "iot" | "tv" | "unknown";
  isRandomized: boolean;
  deviceType: "access_point" | "snooped_client" | "mndp_neighbor" | "mesh_repeater";
  routerId: string;
  routerName: string;
  interfaceName?: string | null; // "wlan1", "wifi1", "ether2"
  neighborIdentity?: string | null; // "MikroTik-CPE-01", "UniFi-AP-Floor2"
  neighborBoard?: string | null; // "hAP ac3", "cAP ax", "RB750Gr3"
  neighborIp?: string | null; // "192.168.88.254"
  lastSeen: string;
  isOwnNetwork: boolean;
}

const listFilterSchema = z.object({
  routerId: z.string().uuid().optional().nullable(),
});

export const listScannedMacs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listFilterSchema.parse(input))
  .handler(async ({ data: filter, context }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);

    // 1. Fetch real routers for this tenant
    const { data: routers, error: rErr } = await supabase
      .from("routers")
      .select("id, name, status, location, last_seen_at, public_ip, active_hotspot_users")
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true });

    if (rErr) throw new Error(rErr.message);
    const routerMap = new Map(
      (routers ?? []).map((r: { id: string; name: string; status?: string; location?: string | null }) => [r.id, r]),
    );

    // 2. Fetch customers (hotspot, PPPoE, and bound Smart TVs)
    let customerQuery = supabase
      .from("customers")
      .select("*, packages(name, price_kes, duration_hours), routers(name)")
      .eq("tenant_id", tenantId)
      .not("mac_address", "is", null);

    if (filter?.routerId) {
      customerQuery = customerQuery.eq("router_id", filter.routerId);
    }

    const { data: rawCustomers, error: cErr } = await customerQuery.order("updated_at", {
      ascending: false,
    });
    if (cErr) throw new Error(cErr.message);

    // 3. Fetch latest router heartbeats with telemetry snapshots
    let heartbeatQuery = supabase
      .from("router_heartbeats")
      .select("id, router_id, raw, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (filter?.routerId) {
      heartbeatQuery = heartbeatQuery.eq("router_id", filter.routerId);
    }

    const { data: heartbeats } = await heartbeatQuery;

    // 4. Map into DiscoveredMacDevice format
    const results: DiscoveredMacDevice[] = [];
    const seenMacs = new Set<string>();

    // Process database customers first
    for (const c of rawCustomers ?? []) {
      if (!c.mac_address) continue;
      const cleanMac = normalizeMac(c.mac_address);
      const uniqueKey = `${c.router_id || "global"}-${cleanMac}`;
      if (seenMacs.has(uniqueKey)) continue;
      seenMacs.add(uniqueKey);

      const targetRouter = c.router_id ? routerMap.get(c.router_id) : (routers ?? [])[0];
      const routerName = targetRouter?.name || c.routers?.name || "All Routers";
      const vendorInfo = getMacVendor(cleanMac);

      const isSmartTv = (c.phone || "").startsWith("DEVICE-");
      let computedStatus: "authorized" | "unauthenticated" | "bypassed" | "expired" | "disabled" =
        "unauthenticated";

      if (c.status === "disabled") {
        computedStatus = "disabled";
      } else if (isSmartTv) {
        computedStatus = "bypassed";
      } else if (c.status === "active") {
        if (c.expires_at && new Date(c.expires_at) < new Date()) {
          computedStatus = "expired";
        } else {
          computedStatus = "authorized";
        }
      } else if (c.status === "expired") {
        computedStatus = "expired";
      }

      results.push({
        id: c.id,
        mac: cleanMac,
        ip: null,
        routerId: c.router_id || targetRouter?.id || "",
        routerName,
        vendor: vendorInfo.vendor,
        vendorCategory: isSmartTv ? "tv" : vendorInfo.category,
        isRandomized: vendorInfo.isRandomized,
        hostname: isSmartTv ? c.full_name : null,
        customerName: isSmartTv ? null : c.full_name,
        phone: isSmartTv ? null : c.phone,
        packageName: c.packages?.name || (isSmartTv ? "Bypass Policy" : null),
        status: computedStatus,
        expiresAt: c.expires_at,
        lastSeen: c.updated_at || c.created_at,
        source: isSmartTv ? "smart_tv" : "active_customer",
        isBound: isSmartTv || computedStatus === "bypassed",
      });
    }

    // Process real live telemetry hosts from heartbeats
    for (const hb of heartbeats ?? []) {
      const raw = hb.raw as Record<string, unknown> | null;
      if (!raw) continue;

      const targetRouter = routerMap.get(hb.router_id);
      const routerName = targetRouter?.name || "MikroTik Router";

      const hostList: any[] = Array.isArray(raw.hosts)
        ? raw.hosts
        : Array.isArray((raw.body as Record<string, unknown>)?.hosts)
        ? ((raw.body as Record<string, unknown>).hosts as any[])
        : [];

      for (const h of hostList) {
        const rawMac = h.mac || h.mac_address || h["mac-address"];
        if (!rawMac || typeof rawMac !== "string") continue;
        const cleanMac = normalizeMac(rawMac);
        const uniqueKey = `${hb.router_id}-${cleanMac}`;

        if (seenMacs.has(uniqueKey)) {
          // Enhance existing record with live telemetry data
          const existing = results.find(
            (r) => r.mac === cleanMac && (r.routerId === hb.router_id || !r.routerId),
          );
          if (existing) {
            if (h.ip || h.address) existing.ip = String(h.ip || h.address);
            if (h.uptime) existing.uptime = String(h.uptime);
            if (h.bytes_in || h["bytes-in"]) existing.bytesIn = Number(h.bytes_in || h["bytes-in"]);
            if (h.bytes_out || h["bytes-out"]) existing.bytesOut = Number(h.bytes_out || h["bytes-out"]);
            if (h.hostname || h["host-name"]) existing.hostname = String(h.hostname || h["host-name"]);
            if (h.authorized === true || h.status === "authorized") existing.status = "authorized";
            if (h.bypassed === true || h.status === "bypassed") {
              existing.status = "bypassed";
              existing.isBound = true;
            }
          }
          continue;
        }

        seenMacs.add(uniqueKey);
        const vendorInfo = getMacVendor(cleanMac);
        const isAuth = h.authorized === true || h.status === "authorized";
        const isByp = h.bypassed === true || h.status === "bypassed";

        results.push({
          id: `live-host-${hb.router_id}-${cleanMac.replace(/:/g, "")}`,
          mac: cleanMac,
          ip: h.ip || h.address || null,
          routerId: hb.router_id,
          routerName,
          vendor: vendorInfo.vendor,
          vendorCategory: vendorInfo.category,
          isRandomized: vendorInfo.isRandomized,
          hostname: h.hostname || h["host-name"] || null,
          customerName: null,
          phone: null,
          packageName: isByp ? "Bypassed Access" : isAuth ? "Active Hotspot Session" : "Guest (Captive Portal)",
          status: isByp ? "bypassed" : isAuth ? "authorized" : "unauthenticated",
          expiresAt: null,
          lastSeen: hb.created_at,
          bytesIn: Number(h.bytes_in || h["bytes-in"]) || null,
          bytesOut: Number(h.bytes_out || h["bytes-out"]) || null,
          uptime: h.uptime ? String(h.uptime) : null,
          source: h.source === "dhcp_lease" ? "dhcp_lease" : "hotspot_host",
          isBound: isByp,
        });
      }
    }

    return {
      devices: results,
      routers: routers ?? [],
      totalCount: results.length,
      authorizedCount: results.filter((d) => d.status === "authorized").length,
      unauthCount: results.filter((d) => d.status === "unauthenticated" || d.status === "expired")
        .length,
      bypassedCount: results.filter((d) => d.status === "bypassed").length,
      randomizedCount: results.filter((d) => d.isRandomized).length,
    };
  });

export const triggerLiveRouterScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { routerId: string }) =>
    z.object({ routerId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);

    const { data: router, error: rErr } = await supabase
      .from("routers")
      .select("id, name")
      .eq("id", data.routerId)
      .eq("tenant_id", tenantId)
      .single();

    if (rErr || !router) throw new Error("Router not found");

    // Queue on-demand scan command
    const { error: cmdErr } = await supabase.from("router_commands").insert({
      tenant_id: tenantId,
      router_id: data.routerId,
      action: "hotspot.scan_hosts",
      payload: {
        timestamp: new Date().toISOString(),
        initiator: "dashboard_mac_scanner",
      },
      status: "queued",
    });

    if (cmdErr) throw new Error(cmdErr.message);

    return {
      ok: true,
      message: `MAC Scan requested for router "${router.name}". Router will collect live active hosts and DHCP leases on its next sync.`,
    };
  });

export const quickBindScannedMac = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { mac: string; routerId?: string | null; deviceName: string }) =>
    z
      .object({
        mac: z.string().min(12),
        routerId: z.string().uuid().optional().nullable(),
        deviceName: z.string().min(2),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);

    const cleanMac = normalizeMac(data.mac);
    const phoneId = `DEVICE-${cleanMac}`;

    // Upsert customer as bound device
    const { data: row, error } = await supabase
      .from("customers")
      .upsert(
        {
          tenant_id: tenantId,
          full_name: data.deviceName,
          phone: phoneId,
          kind: "hotspot",
          mac_address: cleanMac,
          router_id: data.routerId ?? null,
          status: "active",
          expires_at: "2099-12-31T23:59:59Z",
        },
        { onConflict: "tenant_id,phone" },
      )
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    // Enqueue bind command to target router(s)
    const targetRouterIds: string[] = [];
    if (data.routerId) {
      targetRouterIds.push(data.routerId);
    } else {
      const { data: allRouters } = await supabase
        .from("routers")
        .select("id")
        .eq("tenant_id", tenantId);
      (allRouters ?? []).forEach((r: { id: string }) => targetRouterIds.push(r.id));
    }

    if (targetRouterIds.length > 0) {
      const { enqueueRouterCommands } = await import("@/lib/agent-commands.server");
      await enqueueRouterCommands(
        targetRouterIds.map((rId) => ({
          tenantId,
          routerId: rId,
          action: "hotspot.bind_mac",
          payload: {
            mac: cleanMac,
            comment: `emmatech-device:${row.id}`,
          },
        })),
      );
    }

    return { ok: true, device: row };
  });

export const kickScannedMac = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { mac: string; routerId: string }) =>
    z.object({ mac: z.string().min(12), routerId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);

    const cleanMac = normalizeMac(data.mac);

    // Enqueue kick/disconnect command
    const { error } = await supabase.from("router_commands").insert({
      tenant_id: tenantId,
      router_id: data.routerId,
      action: "hotspot.kick_mac",
      payload: {
        mac: cleanMac,
        timestamp: new Date().toISOString(),
      },
      status: "queued",
    });

    if (error) throw new Error(error.message);

    return { ok: true, message: `Disconnection command queued for MAC ${cleanMac}.` };
  });

export const listNearbyMacs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listFilterSchema.parse(input))
  .handler(async ({ data: filter, context }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);

    // 1. Fetch routers for this tenant
    const { data: routers, error: rErr } = await supabase
      .from("routers")
      .select("id, name, status, location, last_seen_at, public_ip")
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true });

    if (rErr) throw new Error(rErr.message);

    const routerMap = new Map(
      (routers ?? []).map((r: { id: string; name: string; status?: string; location?: string | null }) => [r.id, r]),
    );

    // 2. Fetch latest router heartbeats with telemetry snapshots
    let heartbeatQuery = supabase
      .from("router_heartbeats")
      .select("id, router_id, raw, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (filter?.routerId) {
      heartbeatQuery = heartbeatQuery.eq("router_id", filter.routerId);
    }

    const { data: heartbeats } = await heartbeatQuery;

    const nearbyList: NearbyWirelessMacDevice[] = [];
    const seenNearbyKeys = new Set<string>();

    // 3. Extract real Layer-2 MNDP/LLDP neighbors and real Wireless Scan results
    for (const hb of heartbeats ?? []) {
      const raw = hb.raw as Record<string, unknown> | null;
      if (!raw) continue;

      const targetRouter = routerMap.get(hb.router_id);
      const routerName = targetRouter?.name || "MikroTik Router";

      // Parse real neighbors (MNDP / CDP / LLDP)
      const neighborList: any[] = Array.isArray(raw.neighbors)
        ? raw.neighbors
        : Array.isArray((raw.body as Record<string, unknown>)?.neighbors)
        ? ((raw.body as Record<string, unknown>).neighbors as any[])
        : [];

      for (const n of neighborList) {
        const rawMac = n.mac || n.mac_address || n["mac-address"];
        if (!rawMac || typeof rawMac !== "string") continue;
        const cleanMac = normalizeMac(rawMac);
        const uniqueKey = `${hb.router_id}-${cleanMac}-neighbor`;
        if (seenNearbyKeys.has(uniqueKey)) continue;
        seenNearbyKeys.add(uniqueKey);

        const vendorInfo = getMacVendor(cleanMac);
        const isMikrotik = vendorInfo.vendor.toLowerCase().includes("mikrotik");

        nearbyList.push({
          id: `real-neighbor-${hb.router_id}-${cleanMac.replace(/:/g, "")}`,
          mac: cleanMac,
          ssid: n.ssid || null,
          channelText: n.interface ? `Link on ${n.interface}` : "Ethernet / MNDP Neighbor",
          frequency: 0,
          band: "Unknown",
          signalDbm: -45,
          signalQuality: getSignalQuality(-45),
          security: "Layer-2 Direct (MNDP)",
          vendor: isMikrotik ? "MikroTik RouterBOARD" : vendorInfo.vendor,
          vendorCategory: "ap",
          isRandomized: vendorInfo.isRandomized,
          deviceType: "mndp_neighbor",
          routerId: hb.router_id,
          routerName,
          interfaceName: n.interface || "ether1",
          neighborIdentity: n.identity || n["identity"] || null,
          neighborBoard: n.board || n["board"] || null,
          neighborIp: n.ip || n.address || null,
          lastSeen: hb.created_at,
          isOwnNetwork: true,
        });
      }

      // Parse real wireless scan APs
      const wirelessList: any[] = Array.isArray(raw.wireless_scan)
        ? raw.wireless_scan
        : Array.isArray(raw.wireless)
        ? raw.wireless
        : Array.isArray((raw.body as Record<string, unknown>)?.wireless_scan)
        ? ((raw.body as Record<string, unknown>).wireless_scan as any[])
        : [];

      for (const w of wirelessList) {
        const rawMac = w.mac || w.bssid || w.mac_address || w["mac-address"];
        if (!rawMac || typeof rawMac !== "string") continue;
        const cleanMac = normalizeMac(rawMac);
        const uniqueKey = `${hb.router_id}-${cleanMac}-wireless`;
        if (seenNearbyKeys.has(uniqueKey)) continue;
        seenNearbyKeys.add(uniqueKey);

        const vendorInfo = getMacVendor(cleanMac);
        const sig = typeof w.signal === "number" ? w.signal : parseInt(String(w.signal || "-70"), 10);
        const freq = typeof w.frequency === "number" ? w.frequency : parseInt(String(w.frequency || "2412"), 10);
        const channelInfo = getFrequencyChannel(freq);

        nearbyList.push({
          id: `real-ap-${hb.router_id}-${cleanMac.replace(/:/g, "")}`,
          mac: cleanMac,
          ssid: w.ssid || "<Hidden SSID>",
          channelText: channelInfo.channelText,
          frequency: freq,
          band: channelInfo.band,
          signalDbm: sig,
          signalQuality: getSignalQuality(sig),
          security: w.security || w.privacy ? "WPA2/WPA3" : "Open",
          vendor: vendorInfo.vendor,
          vendorCategory: vendorInfo.category,
          isRandomized: vendorInfo.isRandomized,
          deviceType: "access_point",
          routerId: hb.router_id,
          routerName,
          interfaceName: w.interface || "wlan1",
          neighborIdentity: null,
          neighborBoard: null,
          neighborIp: null,
          lastSeen: hb.created_at,
          isOwnNetwork: false,
        });
      }
    }

    return {
      devices: nearbyList,
      routers: routers ?? [],
      totalCount: nearbyList.length,
      accessPointsCount: nearbyList.filter((d) => d.deviceType === "access_point").length,
      snoopedClientsCount: nearbyList.filter((d) => d.deviceType === "snooped_client").length,
      neighborsCount: nearbyList.filter((d) => d.deviceType === "mndp_neighbor").length,
      band24Count: nearbyList.filter((d) => d.band === "2.4 GHz").length,
      band5Count: nearbyList.filter((d) => d.band === "5 GHz").length,
    };
  });

export const triggerNearbyWirelessScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { routerId?: string | null }) =>
    z.object({ routerId: z.string().uuid().optional().nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);

    const targetRouterIds: string[] = [];
    if (data.routerId) {
      targetRouterIds.push(data.routerId);
    } else {
      const { data: allRouters } = await supabase
        .from("routers")
        .select("id")
        .eq("tenant_id", tenantId);
      (allRouters ?? []).forEach((r: { id: string }) => targetRouterIds.push(r.id));
    }

    if (targetRouterIds.length === 0) {
      throw new Error("No active routers found to scan");
    }

    for (const rId of targetRouterIds) {
      await supabase.from("router_commands").insert({
        tenant_id: tenantId,
        router_id: rId,
        action: "wireless.scan_nearby",
        payload: {
          timestamp: new Date().toISOString(),
          initiator: "dashboard_nearby_mac_scanner",
        },
        status: "queued",
      });
    }

    return {
      ok: true,
      message: `Over-the-Air Wireless & Neighbor Scan dispatched to ${targetRouterIds.length} router(s).`,
    };
  });
