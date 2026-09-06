/**
 * Universal MikroTik Router Management Engine
 * Production-ready, fully compatible with RouterOS v6.x and v7.x across all hardware architectures.
 */

export interface RouterInfo {
  id: string;
  name: string;
  location?: string | null;
  status: "online" | "offline" | "pending";
  agent_key: string;
  onboard_token?: string | null;
  onboard_token_expires_at?: string | null;
  identity?: string | null;
  ros_version?: string | null;
  uptime?: string | null;
  last_seen_at?: string | null;
  active_hotspot_users?: number;
  active_pppoe_users?: number;
  serial_number?: string | null;
  model?: string | null;
  architecture?: string | null;
  cpu_load?: string | null;
  free_memory?: string | null;
  total_memory?: string | null;
  configuration_version?: number;
  desired_configuration_version?: number;
  sync_status?: string;
  is_disabled?: boolean;
}

/**
 * Extract public base URL from incoming HTTP request or environment.
 */
export function getPublicBaseUrl(request?: Request): string {
  if (typeof process !== "undefined" && process.env) {
    if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL.replace(/\/+$/, "");
    if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
    if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, "");
  }

  if (!request) {
    console.warn("getPublicBaseUrl: No request and no APP_URL env, defaulting to wifibilling.site");
    return "https://wifibilling.site";
  }

  const forwardedProto =
    request.headers.get("x-forwarded-proto") || request.headers.get("x-forwarded-protocol");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const hostHeader = request.headers.get("host") || "";

  const host = (forwardedHost || hostHeader).split(",")[0].trim();
  let proto = (forwardedProto || "").split(",")[0].trim();

  if (!proto) {
    proto = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
  }

  if (!host) {
    console.warn("getPublicBaseUrl: No host found, defaulting to wifibilling.site");
    return "https://wifibilling.site";
  }

  return `${proto}://${host}`;
}

/**
 * Generate the verified 1-step MikroTik terminal command to onboard a router.
 * Uses /api/public/mikrotik/onboard\?token=TOKEN with the escaped question mark
 * so RouterOS terminal does not intercept '?' as CLI autocomplete/help.
 */
export function generateOnboardingCommand(baseUrl: string, onboardToken: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const token = encodeURIComponent(onboardToken.trim());

  // New robust 1-step command that imports Let's Encrypt CAs first if needed,
  // then fetches the main script. This ensures 'check-certificate=yes' works in the future.
  return `:do { /tool fetch url="https://letsencrypt.org/certs/isrgrootx1.pem" dst-path="isrgrootx1.pem" check-certificate=no; /certificate import file-name=isrgrootx1.pem passphrase=""; /file remove isrgrootx1.pem; } on-error={}; /tool fetch url="${cleanBase}/scripts/mainhotspot.rsc\\?token=${token}" dst-path=mainhotspot.rsc check-certificate=no; :delay 1s; /import mainhotspot.rsc`;
}

/**
 * Calculates real-time router status based on last heartbeat timestamp.
 */
export function computeRouterStatus(router: {
  status?: string | null;
  last_seen_at?: string | null;
  onboarded_at?: string | null;
  is_disabled?: boolean | null;
}): "online" | "offline" | "pending" {
  if (router.is_disabled) {
    return "offline";
  }
  if (!router.last_seen_at) {
    return router.onboarded_at ? "offline" : "pending";
  }
  const lastSeenMs = new Date(router.last_seen_at).getTime();
  if (Number.isNaN(lastSeenMs)) {
    return "pending";
  }
  const diffSeconds = (Date.now() - lastSeenMs) / 1000;
  // If heartbeat received within 180 seconds (3 minutes), router is considered actively online
  if (diffSeconds <= 180) {
    return "online";
  }
  return "offline";
}

export interface ScriptParams {
  routerId: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  onboardToken: string;
  agentKey: string;
  baseUrl: string;
  customWalledGarden?: string[];
}

/**
 * Generate bridge-aware interface binding logic for MikroTik scripts.
 * Handles ROS 6 vs 7 differences automatically.
 */
function getBridgeAwareInterfaceLogic(bridgeName: string): string {
  return `
# ─── DYNAMIC BRIDGE & INTERFACE BINDING ───
:log info "WiFiBilling: Starting dynamic bridge binding to ${bridgeName}..."
:local targetBridge "${bridgeName}"
:if ([:len [/interface bridge find name=$targetBridge]] = 0) do={
    :log info "WiFiBilling: Creating bridge ${bridgeName}..."
    /interface bridge add name=$targetBridge protocol-mode=rstp
} else={
    :log info "WiFiBilling: Bridge ${bridgeName} already exists."
}

# Auto-bind all Ethernet and Wireless interfaces, excluding WAN (ether1)
:foreach i in=[/interface find where type="ether" or type="wifi" or type="wlan"] do={
    :local intName [/interface get $i name]
    :if ($intName != "ether1" && $intName != "WAN") do={
        :log info "WiFiBilling: Binding $intName to $targetBridge..."
        :do {
            /interface bridge port remove [find where interface=$intName]
            /interface bridge port add bridge=$targetBridge interface=$intName
        } on-error={ :log error "WiFiBilling: Failed to bind $intName to $targetBridge!" }
    }
}
:log info "WiFiBilling: Bridge binding complete."
`;
}

/**
 * Generate a COMPLETE Safe RouterOS 6 & 7 onboarding script (.rsc)
 */
export function generateUniversalOnboardingScript(params: ScriptParams): string {
  return generateModularScript("master", params);
}

/**
 * Generate sub-scripts modularly for ISP Ledger style setup compatibility.
 */
export function generateModularScript(type: string, params: ScriptParams): string {
  const rawBase = params.baseUrl ? params.baseUrl.replace(/\/+$/, "") : "https://wifibilling.site";
  const cleanBase = rawBase;
  const fetchMode = cleanBase.startsWith("http://") ? "http" : "https";

  let domainOnly = "wifibilling.site";
  try {
    const parsedHost = new URL(cleanBase).host;
    domainOnly = parsedHost.split(":")[0];
  } catch (e) {
    // Ignore invalid URL
  }

  const token = params.onboardToken ? params.onboardToken.trim() : "REPLACE_WITH_AGENT_TOKEN";
  const tenantSlug = params.tenantSlug || "tenant";

  switch (type.toLowerCase()) {
    case "master":
    case "main":
    case "mainhotspot":
      return `# Main WiFiBilling Setup Script (mainhotspot.rsc)
# Optimized for high-priority internet authorization and robust SSL/TLS connectivity.

:log info "Starting Master Onboarding Script..."

# 1. Update DNS for reliable reachability
/ip dns set servers=8.8.8.8,1.1.1.1 allow-remote-requests=yes
:delay 1s

# 2. Fix SSL/TLS Handshake (Import Let's Encrypt Root CA)
:put "Ensuring SSL/TLS trust chain is trusted..."
:do {
    /tool fetch url="https://letsencrypt.org/certs/isrgrootx1.pem" dst-path="isrgrootx1.pem" check-certificate=no
    /certificate import file-name=isrgrootx1.pem passphrase=""
    /file remove isrgrootx1.pem
    :log info "ISRG Root X1 CA imported successfully"
} on-error={ :log warning "Could not import ISRG Root X1 CA. HTTPS might require check-certificate=no" }

# 3. Environment Check
:global version [/system package update get installed-version]
:local majorVersion 0
:local minorVersion 0
:local dotPos [:find $version "."]
:if ([:len $dotPos] > 0) do={
    :set majorVersion [:tonum [:pick $version 0 $dotPos]]
    :local remaining [:pick $version ($dotPos + 1) [:len $version]]
    :set dotPos [:find $remaining "."]
    :if ([:len $dotPos] > 0) do={
        :set minorVersion [:tonum [:pick $remaining 0 $dotPos]]
    }
}
:if ($majorVersion < 6 || ($majorVersion = 6 && $minorVersion < 48)) do={
    :put "RouterOS version 6.48 or higher is required."
    :error "RouterOS version 6.48 or higher is required."
}
:if ([/ping 8.8.8.8 count=3] = 0) do={
    :error "No internet connection. Please verify your WAN connection."
}

# 4. Modular Fetch & Setup
:do {
    :put "Downloading hotspot configuration..."
    /tool fetch url="${cleanBase}/api/public/mikrotik/onboard?token=${token}&type=hotspot" dst-path=hotspotsetup.rsc check-certificate=no
    :delay 2s
    :put "Applying hotspot configuration..."
    /import hotspotsetup.rsc
    /file remove hotspotsetup.rsc

    :put "Downloading PPPoE configuration..."
    /tool fetch url="${cleanBase}/api/public/mikrotik/onboard?token=${token}&type=pppoe" dst-path=pppoesetup.rsc check-certificate=no
    :delay 2s
    :put "Applying PPPoE configuration..."
    /import pppoesetup.rsc
    /file remove pppoesetup.rsc

    :put "Downloading users configuration..."
    /tool fetch url="${cleanBase}/api/public/mikrotik/onboard?token=${token}&type=users" dst-path=users.rsc check-certificate=no
    :delay 2s
    :put "Applying users configuration..."
    /import users.rsc
    /file remove users.rsc

    :put "Downloading sync-users configuration..."
    /tool fetch url="${cleanBase}/api/public/mikrotik/onboard?token=${token}&type=syncusers" dst-path=syncusers.rsc check-certificate=no
    :delay 2s
    :put "Applying sync-users configuration..."
    /import syncusers.rsc
    /file remove syncusers.rsc

    :put "Downloading heartbeat configuration..."
    /tool fetch url="${cleanBase}/api/public/mikrotik/onboard?token=${token}&type=heartbeat" dst-path=heartbeat.rsc check-certificate=no
    :delay 2s
    :put "Applying heartbeat configuration..."
    /import heartbeat.rsc
    /file remove heartbeat.rsc

    :put "Setting up DNS flush firewalls..."
    :foreach i in=[/system scheduler find where name="dns-flush"] do={ /system scheduler remove \$i }
    /system scheduler add name="dns-flush" interval=06:00:00 on-event="/ip dns cache flush" policy=read,write,test,ftp start-time=00:00:00
    /ip dns cache flush
    :put "DNS flush scheduler installed"

    :put "Suppressing script warnings in system log..."
    :do {
        /system logging set [find topics="warning"] topics=warning,!script
        /system logging set [find topics="script"] topics=script,!warning
        :put "Log script-warning suppression applied"
    } on-error={ :put "Log suppress skipped (non-fatal)" }

    :put "All configurations completed successfully."
    :log info "MikroTik Onboarding Complete."
} on-error={
    :put "Setup failed. Check system logs for details."
    :log error "MikroTik Onboarding Failed."
}
}
`;

    case "vpn":
    case "vpn6":
    case "vpn7":
      return `# VPN bypassed (strictly streamlined local setup)
:log info "WiFiBilling: VPN configuration bypassed as requested."
`;

    case "hotspot":
    case "hotspotsetup":
      return `# WiFiBilling Hotspot Setup Script
# Sets bridge, address, pool, hotspot, profile, w-garden, NAT & mangle
# ─── BRIDGE ─────────────────────────────────────────────────────────────
:foreach i in=[/ip address find where interface="hotspot-bridge"] do={ /ip address remove \$i }
#
:foreach i in=[/interface bridge find where name=hotspot-bridge] do={ /interface bridge remove \$i }
/interface bridge add name=hotspot-bridge

# ─── PORT ASSIGNMENT (Auto-assign all non-WAN interfaces) ───────────────
:log info "WiFiBilling: Automatically assigning non-WAN ethernet and wireless interfaces to hotspot-bridge..."
:foreach int in=[/interface find where (type="ether" and name!="ether1") or type="wlan"] do={
  :local intName [/interface get \$int name]
  :do {
    /interface bridge port remove [find where interface=\$intName]
    /interface bridge port add bridge=hotspot-bridge interface=\$intName
  } on-error={}
}

# ─── GATEWAY IP ─────────────────────────────────────────────────────────
/ip address
add address=10.10.0.1/24 interface=hotspot-bridge
# ─── POOL ───────────────────────────────────────────────────────────────
:foreach i in=[/ip pool find where name=hotspot] do={ /ip pool remove \$i }
/ip pool add name=hotspot ranges=10.10.0.10-10.10.0.254
# ─── HOTSPOT PROFILE (dns-name, hotspot-address, per-mac) ───────────────
:local hsDir "hotspot"
:if ([:len [/file find name="flash"]] > 0) do={ :set hsDir "flash/hotspot" }
:foreach i in=[/ip hotspot profile find where name!="default"] do={ /ip hotspot profile remove $i }
:foreach i in=[/ip hotspot profile find where name=hsprof1] do={ /ip hotspot profile remove $i }
/ip hotspot profile add name="hsprof1" hotspot-address=10.10.0.1 dns-name="hotspot.lan" html-directory=$hsDir login-by=http-pap,cookie ssl-certificate=none
# Disable hotspot popups for unauthorized users to let them browse the portal smoothly
/ip hotspot profile set [find name=hsprof1] use-radius=no

# ─── DNS REDIRECT ───────────────────────────────────────────────────────
:do { /ip dns static remove [find name="wifi.login"] } on-error={}
:do { /ip dns static remove [find name="hotspot.local"] } on-error={}
:do { /ip dns static remove [find name="hotspot.lan"] } on-error={}
/ip dns static add name="wifi.login" address=10.10.0.1
/ip dns static add name="hotspot.lan" address=10.10.0.1
# ─── HOTSPOT SERVER (uses profile) ──────────────────────────────────────
:foreach i in=[/ip hotspot find where name=hotspot1] do={ /ip hotspot remove $i }
/ip hotspot add name=hotspot1 interface=hotspot-bridge profile=hsprof1 address-pool=hotspot addresses-per-mac=1 disabled=no
# ---------- DHCP-SERVER on hotspot-bridge ----------
:foreach i in=[/ip dhcp-server find where name="hotspot-dhcp"] do={ /ip dhcp-server remove $i }
/ip dhcp-server add name="hotspot-dhcp" interface=hotspot-bridge address-pool=hotspot lease-time=1h disabled=no
:foreach j in=[/ip dhcp-server network find address="10.10.0.0/24"] do={ /ip dhcp-server network remove $j }
/ip dhcp-server network add address=10.10.0.0/24 gateway=10.10.0.1 dns-server=8.8.8.8,8.8.4.4 comment="hotspot network"

# ─── HOTSPOT COUPLING & HEALTH CHECK VALIDATION ─────────────────────────
:log info "WiFiBilling: Performing Hotspot profile coupling verification..."
:local hsExists [/ip hotspot find where name=hotspot1]
:if ([:len $hsExists] = 0) do={
    /ip hotspot add name=hotspot1 interface=hotspot-bridge profile=hsprof1 address-pool=hotspot addresses-per-mac=5 disabled=no
} else={
    /ip hotspot set [find where name=hotspot1] interface=hotspot-bridge profile=hsprof1 address-pool=hotspot disabled=no
}

# ─── WALLED-GARDEN IP ───────────────────────────────────────────────────
:foreach i in=[/ip hotspot walled-garden ip find where server=hotspot1] do={ /ip hotspot walled-garden ip remove $i }
/ip hotspot walled-garden ip
# Explicit bypass for DNS traffic to prevent interference with captive portal loading & domain name resolution
add server=hotspot1 protocol=udp dst-port=53 action=accept comment="Allow DNS Queries (UDP)"
add server=hotspot1 protocol=tcp dst-port=53 action=accept comment="Allow DNS Queries (TCP)"
add server=hotspot1 dst-address=69.46.46.122 action=accept comment="Allow Safaricom M-Pesa API"
add server=hotspot1 dst-address=196.201.214.200 action=accept comment="Safaricom Daraja Sandbox"
add server=hotspot1 dst-address=196.201.214.206 action=accept comment="Safaricom Daraja Production"
add server=hotspot1 dst-address=196.201.214.207 action=accept comment="Safaricom Daraja Production"
add server=hotspot1 dst-address=196.201.214.208 action=accept comment="Safaricom Daraja Production"

:do {
  :local portalIP [:resolve "${domainOnly}"];
  /ip hotspot walled-garden ip add dst-address=$portalIP action=accept comment="Allow Portal IP (Resolved)";
} on-error={ :log warning "WiFiBilling: Could not resolve portal IP during setup"; }

# ─── WALLED-GARDEN (HTTP) ───────────────────────────────────────────────
:foreach i in=[/ip hotspot walled-garden find where server=hotspot1] do={ /ip hotspot walled-garden remove $i }
/ip hotspot walled-garden
add server=hotspot1 dst-host="${domainOnly}" action=allow comment="Allow Portal Site"
add server=hotspot1 dst-host="*.${domainOnly}" action=allow comment="Allow Portal Assets"
add server=hotspot1 dst-host="connectivitycheck.gstatic.com" action=allow comment="Google Portal Probe"
add server=hotspot1 dst-host="clients3.google.com" action=allow comment="Google Client Probe"
add server=hotspot1 dst-host="connectivitycheck.android.com" action=allow comment="Android Portal Probe"
add server=hotspot1 dst-host="captive.apple.com" action=allow comment="Apple Portal Probe"
add server=hotspot1 dst-host="msftconnecttest.com" action=allow comment="Windows Portal Probe"
add server=hotspot1 dst-host="detectportal.firefox.com" action=allow comment="Firefox Portal Probe"
add server=hotspot1 dst-host="paystack.com" action=allow
add server=hotspot1 dst-host="*.paystack.com" action=allow
add server=hotspot1 dst-host="*.paystack.co" action=allow
add server=hotspot1 dst-host="checkout.paystack.com" action=allow
add server=hotspot1 dst-host="api.paystack.co" action=allow
add server=hotspot1 dst-host="api.paystack.com" action=allow
add server=hotspot1 dst-host="flutterwave.com" action=allow
add server=hotspot1 dst-host="*.flutterwave.com" action=allow
add server=hotspot1 dst-host="checkout.flutterwave.com" action=allow
add server=hotspot1 dst-host="api.flutterwave.com" action=allow
add server=hotspot1 dst-host="*.ravepay.co" action=allow
add server=hotspot1 dst-host="safaricom.co.ke" action=allow
add server=hotspot1 dst-host="*.safaricom.co.ke" action=allow
add server=hotspot1 dst-host="safaricom.com" action=allow
add server=hotspot1 dst-host="*.safaricom.com" action=allow
add server=hotspot1 dst-host="airtel.com" action=allow
add server=hotspot1 dst-host="*.airtel.com" action=allow
add server=hotspot1 dst-host="airtel.co.ke" action=allow
add server=hotspot1 dst-host="*.airtel.co.ke" action=allow
add server=hotspot1 dst-host="mtn.com" action=allow
add server=hotspot1 dst-host="*.mtn.com" action=allow
add server=hotspot1 dst-host="mtnmomo.com" action=allow
add server=hotspot1 dst-host="*.mtnmomo.com" action=allow
add server=hotspot1 dst-host="vodacom.co.tz" action=allow
add server=hotspot1 dst-host="*.vodacom.co.tz" action=allow
add server=hotspot1 dst-host="tigo.co.tz" action=allow
add server=hotspot1 dst-host="*.tigo.co.tz" action=allow
add server=hotspot1 dst-host="s3-eu-west-1.amazonaws.com" action=allow
add server=hotspot1 dst-host="public-files-paystack-prod.s3.eu-west-1.amazonaws.com" action=allow
add server=hotspot1 dst-host=*.posthog.com action=allow
add server=hotspot1 dst-host=eu.i.posthog.com action=allow

# ─── BLOCK QUIC (UDP 443) - Prevent unauthenticated YouTube/Google bypass ───
:do { /ip firewall filter remove [find comment~"block-quic"] } on-error={}
/ip firewall filter add chain=forward action=drop protocol=udp dst-port=443 comment="block-quic-youtube-bypass" place-before=0
:do { /ip firewall raw remove [find comment~"block-quic"] } on-error={}
/ip firewall raw add chain=prerouting action=drop protocol=udp dst-port=443 comment="block-quic-youtube-bypass"

# ─── CLEANUP ──
/ip dns cache flush
# ─── FIREWALL LAYER 7 & CONNECTION TRACKING ────────────────────────────
:do { /system script remove [find name="firewall-connection-tracking"] } on-error={}
/system script add name=firewall-connection-tracking source={
  :global pqCount
  :if ([:typeof \$pqCount] = "nil") do={
    :local entries [/log find where message~"PQ_" and message~"trying to log in"]
    :global pqCount [:len \$entries]
    :return []
  }
  :local entries [/log find where message~"PQ_" and message~"trying to log in"]
  :local totalEntries [:len \$entries]
  :if (\$totalEntries <= \$pqCount) do={ :return [] }
  :if (\$totalEntries < \$pqCount) do={
    :global pqCount 0
    :return []
  }
  :local counter 0
  :foreach i in=\$entries do={
    :if (\$counter >= \$pqCount) do={
      :local msg [/log get \$i message]
      :local pos [:find \$msg "PQ_"]
      :if ([:typeof \$pos] != "nil") do={
        :local data [:pick \$msg \$pos [:len \$msg]]
        :local spacePos [:find \$data " "]
        :if ([:typeof \$spacePos] != "nil") do={ :set data [:pick \$data 0 \$spacePos] }
        :local p1 [:find \$data "_" 3]
        :if ([:typeof \$p1] != "nil") do={
          :local phone [:pick \$data 3 \$p1]
          :local rest [:pick \$data (\$p1+1) [:len \$data]]
          :local p2 [:find \$rest "_"]
          :if ([:typeof \$p2] != "nil") do={
            :local planId [:pick \$rest 0 \$p2]
            :local rest2 [:pick \$rest (\$p2+1) [:len \$rest]]
            :local p3 [:find \$rest2 "_"]
            :if ([:typeof \$p3] != "nil") do={
              :local routerId [:pick \$rest2 0 \$p3]
              :local rest3 [:pick \$rest2 (\$p3+1) [:len \$rest2]]
              :local p4 [:find \$rest3 "_"]
              :local macSuf \$rest3
              :if ([:typeof \$p4] != "nil") do={ :set macSuf [:pick \$rest3 0 \$p4] }
              :local macFormatted ([:pick \$macSuf 0 1] . ":" . [:pick \$macSuf 1 [:len \$macSuf]])
              :local postData ("phone_number=" . \$phone . "&plan_id=" . \$planId . "&router_id=" . \$routerId . "&mac_suffix=" . \$macFormatted . "&mac_address=")
              :local fetchUrl "${cleanBase}/api/mikrotik/create-user"
              :do {
                /tool fetch url=\$fetchUrl mode=${fetchMode} http-method=post http-data=\$postData check-certificate=no output=none
              } on-error={}
            }
          }
        }
      }
    }
    :set counter (\$counter + 1)
  }
  :global pqCount \$totalEntries
}
:do { /system scheduler remove [find name="firewall-connection-tracking"] } on-error={}
/system scheduler add name="firewall-connection-tracking" interval=10s on-event="/system script run firewall-connection-tracking"
# ─── BINDING SPEED CAP HEAL ─────────────────────────────────────────────
:do { /system script remove [find name="freeisp-binding-heal"] } on-error={}
/system script add name="freeisp-binding-heal" policy=read,write,test source={
:foreach q in=[/queue simple find where name~"^binding-"] do={
    :local qname [/queue simple get \$q name]
    :if (([:len \$qname] = 25) && ([:pick \$qname 10 11] = "-")) do={
        :local m ""
        :for i from=8 to=24 do={
            :local c [:pick \$qname \$i (\$i + 1)]
            :if (\$c = "-") do={ :set c ":" } else={
                :local p [:find "abcdef" \$c]
                :if ([:typeof \$p] != "nil") do={ :set c [:pick "ABCDEF" \$p (\$p + 1)] }
            }
            :set m (\$m . \$c)
        }
        :local ip ""
        :do {
            :local bestIdle [:totime 604800]
            :foreach h in=[/ip hotspot host find where mac-address=\$m] do={
                :local idle [:totime [/ip hotspot host get \$h idle-time]]
                :if (\$idle <= \$bestIdle) do={
                    :set bestIdle \$idle
                    :set ip [:tostr [/ip hotspot host get \$h address]]
                }
            }
        } on-error={}
        :if ([:len \$ip] = 0) do={
            :do {
                :foreach l in=[/ip dhcp-server lease find where mac-address=\$m] do={
                    :if ([:len \$ip] = 0) do={
                        :if ([:tostr [/ip dhcp-server lease get \$l status]] = "bound") do={
                            :set ip [:tostr [/ip dhcp-server lease get \$l address]]
                        }
                    }
                }
            } on-error={}
        }
        :if ([:len \$ip] = 0) do={
            :do {
                :foreach a in=[/ip arp find where mac-address=\$m] do={
                    :if ([:len \$ip] = 0) do={
                        :if ([:tostr [/ip arp get \$a status]] != "stale") do={
                            :set ip [:tostr [/ip arp get \$a address]]
                        }
                    }
                }
            } on-error={}
        }
        :if ([:len \$ip] = 0) do={
            :do {
                :local aa [/ip arp find where mac-address=\$m]
                :if ([:len \$aa] > 0) do={ :set ip [:tostr [/ip arp get [:pick \$aa 0] address]] }
            } on-error={}
        }
        :if ([:len \$ip] > 0) do={
            :local tgt (\$ip . "/32")
            :do {
                :if ([:tostr [/queue simple get \$q target]] != \$tgt) do={
                    /queue simple set \$q target=\$tgt
                }
            } on-error={}
        }
    }
}
}
:do { /system scheduler remove [find name="freeisp-binding-heal"] } on-error={}
/system scheduler add name="freeisp-binding-heal" interval=2h on-event="/system script run freeisp-binding-heal" start-time=startup policy=read,write,test comment="binding speed cap heal"
# ─── NAT MASQUERADE ─────────────────────────────────────────────────────
:foreach i in=[/ip firewall nat find where chain=srcnat and action=masquerade and src-address~"10.10.0"] do={ /ip firewall nat remove \$i }
/ip firewall nat
add chain=srcnat action=masquerade src-address=10.10.0.0/24
# ─── MANGLE ─────────────────────────────────────────────────────────────
:foreach i in=[/ip firewall mangle find where comment~"anti-sharing|hide-router"] do={ /ip firewall mangle remove \$i }
/ip firewall mangle
add chain=prerouting action=change-ttl new-ttl=increment:2 passthrough=yes comment="hide-router-ip-address"

:foreach i in=[/ip firewall filter find where action=fasttrack-connection] do={ /ip firewall filter remove \$i }
:foreach i in=[/ip firewall filter find where chain=input action=drop in-interface-list="!LAN"] do={ /ip firewall filter remove \$i }

# FETCH CAPTIVE PORTAL HTML FILES
:local hsDir "hotspot"
:if ([:len [/file find name="flash"]] > 0) do={ :set hsDir "flash/hotspot" }
:do {
    /tool fetch url="${cleanBase}/api/public/mikrotik/portal-file?token=${token}&file=login.html" dst-path="\$hsDir/login.html" check-certificate=no;
    /tool fetch url="${cleanBase}/api/public/mikrotik/portal-file?token=${token}&file=alogin.html" dst-path="\$hsDir/alogin.html" check-certificate=no;
    /tool fetch url="${cleanBase}/api/public/mikrotik/portal-file?token=${token}&file=rlogin.html" dst-path="\$hsDir/rlogin.html" check-certificate=no;
    /tool fetch url="${cleanBase}/api/public/mikrotik/portal-file?token=${token}&file=redirect.html" dst-path="\$hsDir/redirect.html" check-certificate=no;
} on-error={};

:log info "Hotspot configuration applied successfully."
`;
    case "pppoe":
    case "pppoesetup":
      return `# WiFiBilling PPPoE Setup Script
# Create bridge if not exists
:if ([:len [/interface bridge find where name=hotspot-bridge]] = 0) do={
    /interface bridge add name=hotspot-bridge
}
# ─── PORT ASSIGNMENT (Auto-assign all non-WAN interfaces) ───────────────
:log info "WiFiBilling: Automatically assigning non-WAN ethernet and wireless interfaces to hotspot-bridge for PPPoE..."
:foreach int in=[/interface find where (type="ether" and name!="ether1") or type="wlan"] do={
  :local intName [/interface get \$int name]
  :do {
    /interface bridge port remove [find where interface=\$intName]
    /interface bridge port add bridge=hotspot-bridge interface=\$intName
  } on-error={}
}
# Remove existing PPPoE server for this router (if any)
/interface pppoe-server server
:foreach i in=[find where service-name="pppoe_billing"] do={ remove \$i }
# Add PPPoE server
/interface pppoe-server server
add service-name="pppoe_billing" interface=hotspot-bridge default-profile=default disabled=no one-session-per-host=yes
# Remove existing pool named "PPPOE ACTIVE POOL" then add fresh
/ip pool
:foreach p in=[find where name="PPPOE ACTIVE POOL"] do={ remove \$p }
add name="PPPOE ACTIVE POOL" ranges=10.10.10.10-10.10.10.254
# Remove existing pool named "expired_pppoe_pool" then add fresh
/ip pool
:foreach p in=[find where name="expired_pppoe_pool"] do={ remove \$p }
add name="expired_pppoe_pool" ranges=10.10.20.10-10.10.20.254
:log info "PPPoE configuration applied successfully."
`;

    case "users":
      return `# WiFiBilling Users Setup Script
# Sets system user for router access and ensures API service is active
:foreach i in=[/user find where name="billing_agent"] do={ /user remove \$i }
/user add name=billing_agent group=full password=${params.agentKey} disabled=no
/ip service set api disabled=no port=8728
:log info "System user and API service configuration applied successfully."
`;

    case "syncusers":
    case "sync-users":
      return `# WiFiBilling Agent Sync Scheduler
# Router ID: ${params.routerId}

# Remove old scheduler and script if they exist
:foreach i in=[/system scheduler find where name="sync-users"] do={ /system scheduler remove $i }
:foreach i in=[/system script find where name="sync-users-script"] do={ /system script remove $i }

# Create the sync agent script that fetches and executes remote commands
/system script add name="sync-users-script" policy=read,write,test,ftp source={
  :do {
    :log info "WiFiBilling: Fetching management commands..."
    /tool fetch url="${cleanBase}/api/public/mikrotik/sync?router_id=${params.routerId}&agent_key=${params.agentKey}" dst-path=sync_commands.rsc check-certificate=no
    :delay 1s
    :if ([:len [/file find name=sync_commands.rsc]] > 0) do={
      :log info "WiFiBilling: Executing management commands..."
      /import sync_commands.rsc
      /file remove sync_commands.rsc
      :global lastSyncSuccess;
      :set lastSyncSuccess ([/system clock get date] . " " . [/system clock get time]);
    }
  } on-error={
    :log warning "WiFiBilling: Sync failed (Network or Auth error)"
  }
}

# Create the scheduler to run every 15 seconds for near-real-time responsiveness
/system scheduler add name="sync-users" interval=15s on-event="/system script run sync-users-script" policy=read,write,test,ftp

# Add a Watchdog Agent to monitor Sync Health
:foreach i in=[/system scheduler find where name="sync-watchdog"] do={ /system scheduler remove $i }
:foreach i in=[/system script find where name="sync-watchdog-script"] do={ /system script remove $i }

/system script add name="sync-watchdog-script" policy=read,write,test source={
  :global lastSyncSuccess
  :if ([:typeof $lastSyncSuccess] = "nil") do={
    :log warning "WiFiBilling: Watchdog - Sync has never run successfully."
    :return []
  }
  # Logic to check if lastSyncSuccess was more than 10 mins ago could be added here
  # For now, we just ensure the sync scheduler is enabled
  :if ([/system scheduler get [find name="sync-users"] disabled]) do={
    /system scheduler enable [find name="sync-users"]
    :log warning "WiFiBilling: Watchdog - Re-enabled sync-users scheduler."
  }
}
/system scheduler add name="sync-watchdog" interval=10m on-event="/system script run sync-watchdog-script" policy=read,write,test

# Disable fetch logging (run once and clean up)
:do { /system logging set [find topics~"info"] topics=info,!fetch } on-error={}

:log info "Agent sync & watchdog agents installed (router_id=${params.routerId})"
`;

    case "syncsource":
      return `:do {
  :local result [/tool fetch url="${cleanBase}/api/public/mikrotik/syncsource?token=${params.onboardToken}&tenant=${tenantSlug}&router_id=${params.routerId}&type=Hotspot&limit=20" as-value output=user check-certificate=no]
  :local content (\$result->"data")
  :if (\$content != "NO_USERS" && [:len \$content] > 0) do={
    :local start 0
    :for i from=0 to=([:len \$content] - 1) do={
      :if ([:pick \$content \$i (\$i + 1)] = "\\n") do={
        :local line [:pick \$content \$start \$i]
        :if ([:len \$line] > 0) do={
          :local c1 [:find \$line "," 0]
          :local c2 [:find \$line "," (\$c1 + 1)]
          :local uname [:pick \$line 0 \$c1]
          :local profile [:pick \$line (\$c1 + 1) \$c2]
          :if ([:len [/ip hotspot user find where name=\$uname]] = 0) do={
            /ip hotspot user add name=\$uname password="1234" profile=\$profile
            :log info ("SyncUser: Added " . \$uname . " profile=" . \$profile)
          }
        }
        :set start (\$i + 1)
      }
    }
  }
} on-error={}
`;

    case "heartbeat":
      return `# WiFiBilling Heartbeat - Active User Reporting
# Router ID: ${params.routerId}
# Consolidated heartbeat script (Telemetry + Users)
:do {
  /system script remove [find name="heartbeat-telemetry"];
} on-error={};
/system script add name="heartbeat-telemetry" policy=read,write,test,ftp source=":do { /tool fetch mode=${fetchMode} http-method=post url=\\"${cleanBase}/api/public/mikrotik/heartbeat?token=${params.onboardToken}\\" http-data=(\\"identity=\\" . [/system identity get name] . \\"&ros_version=\\" . [/system package update get installed-version] . \\"&uptime=\\" . [/system resource get uptime] . \\"&cpu_load=\\" . [/system resource get cpu-load] . \\"&active_hotspot_users=\\" . [:len [/ip hotspot active find]] . \\"&active_pppoe_users=\\" . [:len [/ppp active find]]) check-certificate=no output=none; } on-error={}"
# Heartbeat scheduler - every 30 seconds
:do {
  /system scheduler remove [find name="heartbeat-telemetry"];
} on-error={};
/system scheduler add name="heartbeat-telemetry" interval=00:00:30 on-event="/system script run heartbeat-telemetry" policy=read,write,test,ftp
:log info "Heartbeat telemetry script installed (router_id=${params.routerId}, every 30s)"
`;

    case "syncfull":
    case "sync-full":
    case "sync-expire":
    case "logpush":
    case "seclogpush":
    case "apiblock":
    case "api-block":
      return `# Feature retired under streamlined local architecture
`;

    default:
      return generateUniversalOnboardingScript(params);
  }
}

/**
 * Generate full Hotspot & Network Configuration Script (.rsc)
 * to be applied cleanly AFTER router heartbeat is confirmed online.
 */
export function generateNetworkConfigurationScript(params: ScriptParams): string {
  const cleanBase = params.baseUrl.replace(/\/+$/, "");
  const parsedHost = cleanBase.replace(/^https?:\/\//, "").split("/")[0];
  const domainOnly = parsedHost.split(":")[0];

  const defaultWg = [
    domainOnly,
    `*.${domainOnly}`,
    "*.run.app",
    "*.supabase.co",
    "*.supabase.in",
    "*.firebaseio.com",
    "*.safaricom.co.ke",
    "safaricom.co.ke",
    "*.daraja.co.ke",
    "daraja.co.ke",
    "api.safaricom.co.ke",
    "paystack.com",
    "*.paystack.com",
    "flutterwave.com",
    "*.flutterwave.com",
    "stripe.com",
    "*.stripe.com",
    "wifibilling.site",
    "*.wifibilling.site",
    "cloudflare.com",
    "*.cloudflare.com",
    "connectivitycheck.gstatic.com",
    "connectivitycheck.android.com",
    "captive.apple.com",
    "msftconnecttest.com",
    "detectportal.firefox.com",
    ...(params.customWalledGarden ?? []),
  ].filter(Boolean);

  const blockedLeakedDomains = [
    "googlevideo.com",
    "*.googlevideo.com",
    "youtube.com",
    "*.youtube.com",
    "ytimg.com",
    "*.ytimg.com",
    "*.gstatic.com",
    "*.googleapis.com",
    "*.apple.com",
  ];

  const uniqueWg = Array.from(new Set(defaultWg)).filter(
    (d) =>
      !blockedLeakedDomains.includes(d.toLowerCase()) &&
      !d.toLowerCase().includes("googlevideo") &&
      !d.toLowerCase().includes("youtube") &&
      !d.toLowerCase().includes("ytimg"),
  );

  return `# =========================================================
# WiFiBilling Universal Hotspot & PPPoE Network Configuration
# Router ID: ${params.routerId}
# =========================================================

# 1. Create Unified Hotspot & PPPoE Bridge (br-hotspot)
:do {
  :if ([:len [/interface bridge find name="br-hotspot"]] = 0) do={
    /interface bridge add name="br-hotspot" comment="WiFiBilling Hotspot & PPPoE Bridge";
  };
} on-error={};

# 2. Auto-Bridge All Local Ports (All Ethers except ether1 & all Wireless interfaces)
:do {
  :foreach e in=[/interface ethernet find] do={
    :local eName [/interface ethernet get $e name];
    :if ($eName != "ether1" && $eName != "wan" && $eName != "WAN") do={
      :do {
        /interface bridge port add bridge="br-hotspot" interface=$eName comment="Auto-bridged LAN";
      } on-error={};
    };
  };
} on-error={};

:do {
  :foreach w in=[/interface wireless find] do={
    :local wName [/interface wireless get $w name];
    :do {
      /interface bridge port add bridge="br-hotspot" interface=$wName comment="Auto-bridged WLAN";
    } on-error={};
  };
} on-error={};

# 3. IP Address & IP Pool Allocation for Hotspot (10.10.0.1/24)
:do {
  :local hasGw false;
  :foreach i in=[/ip address find] do={
    :local addrVal [/ip address get $i address];
    :if ([:pick $addrVal 0 9] = "10.10.0.1") do={
      :set hasGw true;
    };
  };
  :if (!$hasGw) do={
    /ip address add address=10.10.0.1/24 interface="br-hotspot" comment="WiFiBilling Hotspot Gateway";
  };
} on-error={};

:do {
  :if ([:len [/ip pool find name="hs-pool"]] = 0) do={
    /ip pool add name="hs-pool" ranges=10.10.0.10-10.10.0.254;
  };
} on-error={};

# 4. DHCP Server Configuration for Hotspot
:do {
  :if ([:len [/ip dhcp-server find name="Hotspot_Gateway"]] = 0) do={
    /ip dhcp-server add name="Hotspot_Gateway" interface="br-hotspot" address-pool="hs-pool" disabled=no lease-time=1h;
  };
} on-error={};

:do {
  :if ([:len [/ip dhcp-server network find address="10.10.0.0/24"]] = 0) do={
    /ip dhcp-server network add address=10.10.0.0/24 gateway=10.10.0.1 dns-server=10.10.0.1 comment="WiFiBilling Hotspot Network";
  } else={
    /ip dhcp-server network set [find address="10.10.0.0/24"] dns-server=10.10.0.1 gateway=10.10.0.1;
  };
} on-error={};

# 5. PPPoE Server Configuration on br-hotspot (Supporting All Routers)
:do {
  :if ([:len [/ip pool find name="wfb-ppp-pool"]] = 0) do={
    /ip pool add name="wfb-ppp-pool" ranges=10.10.10.10-10.10.10.254;
  };
  :if ([:len [/ppp profile find name="wfb-ppp-prof"]] = 0) do={
    /ppp profile add name="wfb-ppp-prof" local-address=10.10.10.1 remote-address=wfb-ppp-pool dns-server=8.8.8.8,1.1.1.1 comment="WiFiBilling PPPoE Profile";
  };
  :if ([:len [/interface pppoe-server server find service-name="wfb-pppoe"]] = 0) do={
    /interface pppoe-server server add service-name="wfb-pppoe" interface="br-hotspot" authentication=pap,chap,mschap1,mschap2 default-profile="wfb-ppp-prof" disabled=no;
  };
} on-error={};

# 6. DNS Setup & Local Portal Domain Routing
:do { /ip dns set allow-remote-requests=yes servers=8.8.8.8,1.1.1.1; } on-error={};
:do {
  # REMOVE local DNS overrides for the portal domain to allow it to reach the internet-hosted site
  /ip dns static remove [find name="www.wifibilling.site"];
  /ip dns static remove [find name="wifi.login"];
  
  # Add a simple, non-conflicting local name for the router itself
  /ip dns static add name="router.local" address=10.10.0.1 comment="Local router access";
} on-error={};

# 7. Walled Garden & HTTPS Bypass (THE "FORCE OPEN" FIX)
:do {
  # Clear existing portal-related and leaked video/wildcard walled garden entries
  :do { /ip hotspot walled-garden remove [find comment~"Portal"]; } on-error={};
  :do { /ip hotspot walled-garden remove [find dst-host~"googlevideo|youtube|ytimg"]; } on-error={};
  :do { /ip hotspot walled-garden remove [find dst-host="*.gstatic.com"]; } on-error={};
  :do { /ip hotspot walled-garden remove [find dst-host="*.googleapis.com"]; } on-error={};
  :do { /ip hotspot walled-garden remove [find dst-host="*.apple.com"]; } on-error={};
  :do { /ip hotspot walled-garden remove [find dst-host="${domainOnly}"]; } on-error={};
  :do { /ip hotspot walled-garden remove [find dst-host="*.${domainOnly}"]; } on-error={};

  # Allow all traffic to the billing domain
  /ip hotspot walled-garden add dst-host="${domainOnly}" action=allow comment="Allow Portal Site";
  /ip hotspot walled-garden add dst-host="*.${domainOnly}" action=allow comment="Allow Portal Assets";

  # Allow OS Connectivity Checks ONLY (Strict probes for Captive Portal detection - no wildcard media leaks)
  /ip hotspot walled-garden add dst-host="captive.apple.com" action=allow comment="Apple Portal Probe";
  /ip hotspot walled-garden add dst-host="connectivitycheck.gstatic.com" action=allow comment="Google Portal Probe";
  /ip hotspot walled-garden add dst-host="connectivitycheck.android.com" action=allow comment="Android Portal Probe";
  /ip hotspot walled-garden add dst-host="clients3.google.com" action=allow comment="Google Client Probe";
  /ip hotspot walled-garden add dst-host="msftconnecttest.com" action=allow comment="Windows Portal Probe";
  /ip hotspot walled-garden add dst-host="detectportal.firefox.com" action=allow comment="Firefox Portal Probe";

  # Payment Gateway Domains
  /ip hotspot walled-garden add dst-host="paystack.com" action=allow comment="Paystack Gateway";
  /ip hotspot walled-garden add dst-host="*.paystack.com" action=allow;
  /ip hotspot walled-garden add dst-host="*.paystack.co" action=allow;
  /ip hotspot walled-garden add dst-host="flutterwave.com" action=allow comment="Flutterwave Gateway";
  /ip hotspot walled-garden add dst-host="*.flutterwave.com" action=allow;
  /ip hotspot walled-garden add dst-host="*.ravepay.co" action=allow;
  /ip hotspot walled-garden add dst-host="safaricom.co.ke" action=allow comment="Safaricom Gateway";
  /ip hotspot walled-garden add dst-host="*.safaricom.co.ke" action=allow;
  /ip hotspot walled-garden add dst-host="safaricom.com" action=allow;
  /ip hotspot walled-garden add dst-host="*.safaricom.com" action=allow;
  /ip hotspot walled-garden add dst-host="airtel.com" action=allow comment="Airtel Gateway";
  /ip hotspot walled-garden add dst-host="*.airtel.com" action=allow;
  /ip hotspot walled-garden add dst-host="airtel.co.ke" action=allow;
  /ip hotspot walled-garden add dst-host="*.airtel.co.ke" action=allow;
  /ip hotspot walled-garden add dst-host="mtn.com" action=allow comment="MTN Gateway";
  /ip hotspot walled-garden add dst-host="*.mtn.com" action=allow;
  /ip hotspot walled-garden add dst-host="mtnmomo.com" action=allow;
  /ip hotspot walled-garden add dst-host="*.mtnmomo.com" action=allow;
  /ip hotspot walled-garden add dst-host="vodacom.co.tz" action=allow comment="Vodacom Gateway";
  /ip hotspot walled-garden add dst-host="*.vodacom.co.tz" action=allow;
  /ip hotspot walled-garden add dst-host="tigo.co.tz" action=allow comment="Tigo Gateway";
  /ip hotspot walled-garden add dst-host="*.tigo.co.tz" action=allow;

  # Payment Gateway & Portal IPs
  :do { /ip hotspot walled-garden ip remove [find comment~"Safaricom"]; } on-error={};
  :do { /ip hotspot walled-garden ip remove [find comment="Allow Portal IP (Resolved)"]; } on-error={};
  :do {
    :local portalIP [:resolve "${domainOnly}"];
    /ip hotspot walled-garden ip add dst-address=$portalIP action=accept comment="Allow Portal IP (Resolved)";
  } on-error={ :log warning "WiFiBilling: Could not resolve portal IP during setup"; };
  
  /ip hotspot walled-garden ip add dst-address=69.46.46.122 action=accept comment="Safaricom Daraja API";
  /ip hotspot walled-garden ip add dst-address=196.201.214.200 action=accept comment="Safaricom Daraja Sandbox";
  /ip hotspot walled-garden ip add dst-address=196.201.214.206 action=accept comment="Safaricom Daraja Production";
  /ip hotspot walled-garden ip add dst-address=196.201.214.207 action=accept comment="Safaricom Daraja Production";
  /ip hotspot walled-garden ip add dst-address=196.201.214.208 action=accept comment="Safaricom Daraja Production";

  # BLOCK QUIC (UDP 443) - Prevent unauthenticated YouTube / Google bypass via UDP 443
  :do { /ip firewall filter remove [find comment~"block-quic"]; } on-error={};
  /ip firewall filter add chain=forward action=drop protocol=udp dst-port=443 comment="block-quic-youtube-bypass" place-before=0;
  :do { /ip firewall raw remove [find comment~"block-quic"]; } on-error={};
  /ip firewall raw add chain=prerouting action=drop protocol=udp dst-port=443 comment="block-quic-youtube-bypass";
} on-error={};

# Disable any force-redirects for SSL that cause the 'Connection Closed' error
:do {
  :do { /ip firewall nat disable [find chain=hotspot protocol=tcp dst-port=443 action=redirect]; } on-error={};
  :do { /ip firewall nat disable [find chain=hotspot protocol=tcp dst-port=443 action=dst-nat]; } on-error={};
} on-error={};

# 8. Hotspot User Profile & Server Profile Setup
:do {
  :if ([:len [/ip hotspot user profile find name="wfb-default-uprof"]] = 0) do={
    /ip hotspot user profile add name="wfb-default-uprof" shared-users=1 status-autorefresh=1m keepalive-timeout=2m;
  };
} on-error={};

:do {
  # Force all existing hotspot profiles to disable SSL and use a local domain name
  /ip hotspot profile set [find] hotspot-address=10.10.0.1 dns-name="hotspot.lan" html-directory="hotspot" login-by=http-chap,http-pap,mac-cookie,cookie split-user-domain=no http-cookie-lifetime=1d use-radius=no ssl-certificate=none;
  
  :if ([:len [/ip hotspot profile find name="billing_hsprof"]] = 0) do={
    /ip hotspot profile add name="billing_hsprof" hotspot-address=10.10.0.1 dns-name="hotspot.lan" html-directory="hotspot" login-by=http-chap,http-pap,mac-cookie,cookie split-user-domain=no http-cookie-lifetime=1d use-radius=no ssl-certificate=none;
  } else={
    /ip hotspot profile set [find name="billing_hsprof"] hotspot-address=10.10.0.1 dns-name="hotspot.lan" html-directory="hotspot" login-by=http-chap,http-pap,mac-cookie,cookie split-user-domain=no http-cookie-lifetime=1d use-radius=no ssl-certificate=none;
  };
} on-error={};

# 8.1 Event-Driven Webhook hooks for Hotspot User Logins and Logouts
:do {
  /ip hotspot user profile set [find] on-login={
    :do {
      /tool fetch url="${cleanBase}/api/public/mikrotik/webhook?router_id=${params.routerId}&agent_key=${params.agentKey}&event=login&username=\$user&mac=\$(""mac-address"")&ip=\$address" http-method=post mode=http check-certificate=no;
    } on-error={};
  } on-logout={
    :do {
      /tool fetch url="${cleanBase}/api/public/mikrotik/webhook?router_id=${params.routerId}&agent_key=${params.agentKey}&event=logout&username=\$user&mac=\$(""mac-address"")&ip=\$address" http-method=post mode=http check-certificate=no;
    } on-error={};
  }
} on-error={};

# 8. Hotspot Server Attachment to br-hotspot
:do {
  :local existingHs false;
  :foreach h in=[/ip hotspot find interface="br-hotspot"] do={
    :set existingHs true;
    /ip hotspot set $h profile="billing_hsprof" disabled=no;
  };
  :if (!$existingHs) do={
    :if ([:len [/ip hotspot find name="wfb-hotspot"]] = 0) do={
      /ip hotspot add name="wfb-hotspot" interface="br-hotspot" profile="billing_hsprof" address-pool="hs-pool" disabled=no;
    } else={
      /ip hotspot set [find name="wfb-hotspot"] interface="br-hotspot" profile="billing_hsprof" disabled=no;
    };
  };
} on-error={};

# 9. Management IP & Router Bypasses
:do {
  :if ([:len [/ip hotspot ip-binding find address="10.10.0.1"]] = 0) do={
    /ip hotspot ip-binding add address=10.10.0.1 type=bypassed comment="WiFiBilling: Router Gateway Bypass";
  };
  :if ([:len [/ip hotspot ip-binding find address="192.168.88.1"]] = 0) do={
    /ip hotspot ip-binding add address=192.168.88.1 type=bypassed comment="WiFiBilling: Default Gateway Bypass";
  };
} on-error={};

# 10. Firewall NAT & Masquerade (Hotspot + PPPoE + WAN)
:do {
  :if ([:len [/ip firewall nat find where comment="WiFiBilling Hotspot NAT"]] = 0) do={
    /ip firewall nat add chain=srcnat action=masquerade src-address=10.10.0.0/24 comment="WiFiBilling Hotspot NAT";
  };
  :if ([:len [/ip firewall nat find where comment="WiFiBilling PPPoE NAT"]] = 0) do={
    /ip firewall nat add chain=srcnat action=masquerade src-address=10.10.10.0/24 comment="WiFiBilling PPPoE NAT";
  };
  :if ([:len [/ip firewall nat find where comment="WiFiBilling WAN Masquerade"]] = 0) do={
    /ip firewall nat add chain=srcnat action=masquerade out-interface="ether1" comment="WiFiBilling WAN Masquerade";
  };
} on-error={};

# 11. Walled Garden Rules
${uniqueWg
  .map(
    (domain) => `
:do {
  /ip hotspot walled-garden remove [find dst-host="${domain}"];
  /ip hotspot walled-garden add dst-host="${domain}" comment="WiFiBilling Whitelist" ${domain === domainOnly || domain === "*." + domainOnly ? "place-before=0" : ""};
} on-error={};`,
  )
  .join("")}

# 12. Fetch Captive Portal HTML Files
:do {
  /tool fetch url="${cleanBase}/api/public/mikrotik/portal-file?token=${params.onboardToken}&file=login.html" dst-path="hotspot/login.html" check-certificate=no;
  /tool fetch url="${cleanBase}/api/public/mikrotik/portal-file?token=${params.onboardToken}&file=alogin.html" dst-path="hotspot/alogin.html" check-certificate=no;
  /tool fetch url="${cleanBase}/api/public/mikrotik/portal-file?token=${params.onboardToken}&file=rlogin.html" dst-path="hotspot/rlogin.html" check-certificate=no;
  /tool fetch url="${cleanBase}/api/public/mikrotik/portal-file?token=${params.onboardToken}&file=redirect.html" dst-path="hotspot/redirect.html" check-certificate=no;
} on-error={};

# 13. Real-Time Heartbeat via Netwatch
:do {
  /tool netwatch remove [find comment="Real-Time Billing Heartbeat"];
} on-error={};
:do {
  /tool netwatch add host="8.8.8.8" interval=10s timeout=2s up-script=":log info \\"=== HEARTBEAT OK: Internet is Online ===\\"; /ip hotspot enable [find]" down-script=":log error \\"!!! HEARTBEAT FAIL: Internet Unreachable !!!\\"; /ip dhcp-client release [find interface=ether1]; :delay 2s; /ip dhcp-client renew [find interface=ether1]" comment="Real-Time Billing Heartbeat";
} on-error={};

:log info "WiFiBilling: Universal Hotspot, PPPoE & Captive Portal Configured Successfully.";
`;
}

/**
 * Generate redirecting HTML pages for MikroTik Hotspot
 */
export function generateMikrotikPortalHtml(
  type: "login" | "alogin" | "rlogin" | "redirect",
  tenantSlug: string,
  routerId: string,
  baseUrl: string,
): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const targetUrl = `${cleanBase}/portal/${encodeURIComponent(tenantSlug)}?router_id=${encodeURIComponent(
    routerId,
  )}&mac=$(mac)&ip=$(ip)&link-login=$(link-login)&link-login-only=$(link-login-only)&link-orig=$(link-orig-esc)&server-name=$(server-name)&server-address=$(server-address)`;

  if (type === "redirect") {
    return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://w3.org">
<html xmlns="http://w3.org">
<head>
    <meta http-equiv="refresh" content="0; url=${targetUrl}" />
    <meta http-equiv="pragma" content="no-cache" />
    <meta http-equiv="expires" content="-1" />
    <title>Loading Portal...</title>
</head>
<body>
    <p>Redirecting you to the network login portal... If the page does not open automatically, 
    <a href="${targetUrl}">click here</a>.</p>
</body>
</html>`;
  }

  if (type === "alogin") {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="2; url=$(link-orig)">
<title>Connected - WiFiBilling</title>
<script>
setTimeout(function(){
  var orig = "$(link-orig)";
  if (orig && orig.length > 5 && orig.indexOf("wifi.login") === -1) {
    window.location.href = orig;
  } else {
    window.location.href = "${cleanBase}/portal/${encodeURIComponent(tenantSlug)}?status=connected";
  }
}, 1500);
</script>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #07101e; color: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; text-align: center; }
.card { background: #0d192e; border: 1px solid #1e293b; border-radius: 16px; padding: 32px 24px; max-width: 380px; width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
.badge { display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); color: #10b981; font-size: 28px; margin-bottom: 16px; }
h1 { font-size: 20px; font-weight: 700; margin: 0 0 8px; color: #ffffff; }
p { font-size: 14px; color: #94a3b8; margin: 0 0 20px; line-height: 1.5; }
.btn { display: inline-block; background: #2563eb; color: #ffffff; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-size: 14px; transition: background 0.2s; }
.btn:hover { background: #1d4ed8; }
</style>
</head>
<body>
<div class="card">
  <div class="badge">✓</div>
  <h1>Internet Connected!</h1>
  <p>Your session has been activated successfully. Enjoy fast, reliable Wi-Fi.</p>
  <a href="$(link-orig)" class="btn">Continue Browsing</a>
</div>
</body>
</html>`;
  }

  // login.html and rlogin.html
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecting to Portal...</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align: center; padding-top: 50px; background: #09090b; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; box-sizing: border-box; }
    a { color: #34d399; text-decoration: none; font-weight: bold; }
    .spinner { width: 44px; height: 44px; border: 3px solid rgba(255,255,255,0.1); border-radius: 50%; border-top-color: #34d399; animation: spin 0.8s ease-in-out infinite; margin-bottom: 20px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <h2>Redirecting to Secure Portal...</h2>
  <p>If you are not redirected automatically, <a id="portal-link" href="#">click here</a>.</p>

  <script>
    // 1. Core SaaS Domain injected by the backend
    var saasDomain = "${cleanBase}";
    
    // 2. MikroTik Identity & Router ID
    var routerIdentity = "$(identity)"; 
    var hardcodedRouterId = "${routerId}";
    
    var params = new URLSearchParams();
    params.append("mac", "$(mac)");
    params.append("ip", "$(ip)");
    params.append("linkLogin", "$(link-login-only)");
    params.append("linkOrig", "$(link-orig)");
    
    // Support both dynamic identity mapping and our secure UUID
    params.append("routerId", routerIdentity && routerIdentity !== "" && routerIdentity !== "$(identity)" ? routerIdentity : hardcodedRouterId); 
    params.append("router_id", hardcodedRouterId); // Legacy compatibility for existing flow
    params.append("serverName", "$(server-name)");
    params.append("serverAddress", "$(server-address)");
    
    var finalUrl = saasDomain + "/portal/${encodeURIComponent(tenantSlug)}?" + params.toString();
    
    // Update fallback link and execute redirection
    document.getElementById("portal-link").href = finalUrl;
    window.location.href = finalUrl;
  </script>
</body>
</html>`;
}
