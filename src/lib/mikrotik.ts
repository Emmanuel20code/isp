import { z } from "zod";

/**
 * Extract public base URL from incoming HTTP request.
 * Supports Cloud Run proxy headers, custom domains, and localhost.
 */
export function getPublicBaseUrl(request: Request): string {
  const forwardedProto =
    request.headers.get("x-forwarded-proto") || request.headers.get("x-forwarded-protocol");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const hostHeader = request.headers.get("host") || "";

  const host = (forwardedHost || hostHeader).split(",")[0].trim();
  let proto = (forwardedProto || "").split(",")[0].trim();

  if (!proto) {
    proto = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
  }

  return `${proto}://${host}`;
}

/**
 * Calculates real-time router status based on last heartbeat timestamp.
 * MikroTik scheduler runs every 15-30 seconds.
 */
export function computeRouterStatus(router: {
  status?: string | null;
  last_seen_at?: string | null;
  onboarded_at?: string | null;
}): "online" | "offline" | "pending" {
  if (!router.last_seen_at) {
    return router.onboarded_at ? "offline" : "pending";
  }
  const lastSeenMs = new Date(router.last_seen_at).getTime();
  if (isNaN(lastSeenMs)) return "pending";

  const diffMs = Date.now() - lastSeenMs;
  // If seen within last 75 seconds, considered actively online
  if (diffMs <= 75_000) {
    return "online";
  }
  return "offline";
}

/**
 * Generates the complete MikroTik RouterOS script that:
 * 1. Creates a unified LAN bridge (bridge-lan)
 * 2. Bridges ALL non-WAN ethernet (ether2-etherX, sfp), wireless (wlan1/wlan2), and v7 wifi interfaces into bridge-lan
 * 3. Assigns Gateway IP (10.5.50.1/24) and dedicated IP pools for Hotspot and PPPoE
 * 4. Configures DHCP Server on bridge-lan for instant Hotspot captive portal
 * 5. Configures Hotspot Server on bridge-lan with walled garden
 * 6. Configures PPPoE Server concurrently on bridge-lan (coexists on all ports)
 * 7. Sets up Masquerade NAT & DNS
 * 8. Configures the Wifi Billing sync script & scheduler
 */
export function generateMikrotikDualConfig(syncUrl: string, agentKey: string): string {
  return `# =====================================================================
# Wifi Billing WiFi Billing - Dual Hotspot & PPPoE Bridge Configuration
# Configures ALL non-WAN ethernet and wireless ports for simultaneous
# Hotspot Captive Portal and PPPoE Broadband Server operation.
# Compatible with MikroTik RouterOS v6 and RouterOS v7+.
# =====================================================================

# 1. Create unified LAN Bridge (bridge-lan)
:if ([:len [/interface bridge find name=bridge-lan]] = 0) do={
  /interface bridge add name=bridge-lan comment="Wifi Billing Unified Dual Service Bridge" fast-forward=no on-error={};
}

# 2. Automatically bind all non-WAN Ethernet, SFP, and Wireless interfaces into bridge-lan
:foreach i in=[/interface ethernet find] do={
  :local iname [/interface ethernet get $i name];
  :local icomment "";
  :do { :set icomment [/interface ethernet get $i comment]; } on-error={};
  :if ($iname != "ether1" && !($icomment ~ "WAN") && !($icomment ~ "wan")) do={
    :if ([:len [/interface bridge port find interface=$iname]] = 0) do={
      /interface bridge port add bridge=bridge-lan interface=$iname comment="Wifi Billing Dual Service Port" on-error={};
    }
  }
}

# Add standard wireless interfaces (wlan1, wlan2, etc.)
:do {
  :foreach i in=[/interface wireless find] do={
    :local iname [/interface wireless get $i name];
    :if ([:len [/interface bridge port find interface=$iname]] = 0) do={
      /interface bridge port add bridge=bridge-lan interface=$iname comment="Wifi Billing WLAN Dual Port" on-error={};
    }
  }
} on-error={};

# Add RouterOS v7+ WiFi / WiFiWave2 interfaces (wifi1, wifi2, etc.)
:do {
  :foreach i in=[/interface wifi find] do={
    :local iname [/interface wifi get $i name];
    :if ([:len [/interface bridge port find interface=$iname]] = 0) do={
      /interface bridge port add bridge=bridge-lan interface=$iname comment="Wifi Billing v7 WiFi Dual Port" on-error={};
    }
  }
} on-error={};

# 3. Dedicated IP Pools and Bridge Gateway IP
/ip pool remove [find name="emmatech-pool"] on-error={};
/ip pool remove [find name="emmatech-hotspot-pool"] on-error={};
/ip pool remove [find name="emmatech-pppoe-pool"] on-error={};

/ip pool add name=emmatech-hotspot-pool ranges=10.5.50.10-10.5.50.254 comment="Wifi Billing Hotspot DHCP Pool" on-error={};
/ip pool add name=emmatech-pppoe-pool ranges=10.5.60.10-10.5.60.254 comment="Wifi Billing PPPoE Pool" on-error={};

# Assign Gateway IP to bridge-lan
/ip address remove [find comment="Wifi Billing Gateway"] on-error={};
/ip address add address=10.5.50.1/24 interface=bridge-lan network=10.5.50.0 comment="Wifi Billing Gateway" on-error={};

# 4. DHCP Server for Hotspot users on bridge-lan
/ip dhcp-server network remove [find comment="Wifi Billing DHCP Network"] on-error={};
/ip dhcp-server network add address=10.5.50.0/24 gateway=10.5.50.1 dns-server=8.8.8.8,1.1.1.1 comment="Wifi Billing DHCP Network" on-error={};

/ip dhcp-server remove [find name="emmatech-dhcp"] on-error={};
/ip dhcp-server add name=emmatech-dhcp interface=bridge-lan address-pool=emmatech-hotspot-pool lease-time=1h disabled=no on-error={};

# 5. Hotspot Server on bridge-lan
/ip hotspot profile remove [find name="emmatech-hsp-prof"] on-error={};
/ip hotspot profile add name=emmatech-hsp-prof hotspot-address=10.5.50.1 login-by=http-chap,http-pap,mac-cookie use-radius=no html-directory=hotspot on-error={};

/ip hotspot remove [find name="emmatech-hotspot"] on-error={};
/ip hotspot add name=emmatech-hotspot interface=bridge-lan address-pool=emmatech-hotspot-pool profile=emmatech-hsp-prof disabled=no on-error={};

# Hotspot Walled Garden for Cloud & Payments
/ip hotspot walled-garden remove [find comment="Wifi Billing Walled Garden"] on-error={};
/ip hotspot walled-garden ip remove [find comment="Wifi Billing Walled Garden"] on-error={};
/ip hotspot walled-garden ip add action=accept dst-address=0.0.0.0/0 protocol=udp dst-port=53 comment="Wifi Billing Walled Garden" on-error={};
/ip hotspot walled-garden add dst-host="*run.app" comment="Wifi Billing Walled Garden" on-error={};
/ip hotspot walled-garden add dst-host="*safaricom.co.ke" comment="Wifi Billing Walled Garden" on-error={};

# 6. PPPoE Server on bridge-lan (Simultaneous operation across all ports)
/ppp profile remove [find name="emmatech-pppoe-prof"] on-error={};
/ppp profile add name=emmatech-pppoe-prof local-address=10.5.60.1 remote-address=emmatech-pppoe-pool dns-server=8.8.8.8,1.1.1.1 comment="Wifi Billing PPPoE Profile" on-error={};

/interface pppoe-server server remove [find service-name="Wifi Billing-PPPoE"] on-error={};
/interface pppoe-server server add service-name=Wifi Billing-PPPoE interface=bridge-lan default-profile=emmatech-pppoe-prof authentication=pap,chap,mschap1,mschap2 one-session-per-host=no max-mtu=1480 max-mru=1480 keepalive-timeout=60 disabled=no on-error={};

# 7. DNS & NAT Masquerade
/ip dns set allow-remote-requests=yes servers=8.8.8.8,1.1.1.1 on-error={};
/ip firewall nat remove [find comment="Wifi Billing Masquerade"] on-error={};
/ip firewall nat add chain=srcnat action=masquerade comment="Wifi Billing Masquerade" on-error={};

# 8. Background Synchronization Script and Scheduler
/system script remove [find name="emmatech-sync"] on-error={};
/system scheduler remove [find name="emmatech-sched"] on-error={};
/system script add name=emmatech-sync source=":local url \\"${syncUrl}\\"; :local key \\"${agentKey}\\"; :local sysid [/system identity get name]; :local sysres [/system resource get version]; :local uptime [/system resource get uptime]; :local husers [:len [/ip hotspot active find]]; :local pusers [:len [/ppp active find service=pppoe]]; :local payload \\"identity=$sysid&version=$sysres&uptime=$uptime&hotspot_users=$husers&pppoe_users=$pusers\\"; :local res [/tool fetch url=$url http-method=post http-header-field=\\"x-agent-key: $key\\" http-data=$payload as-value output=user]; :execute ($res->\\"data\\");"
/system scheduler add name=emmatech-sched interval=15s on-event=emmatech-sync
:log info "Wifi Billing Dual Hotspot & PPPoE Bridge initialized successfully on all ports!";
`;
}
