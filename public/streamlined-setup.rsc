# ==============================================================================
#                 WiFiBilling Streamlined Setup Script (streamlined-setup.rsc)
# ==============================================================================
# This script configures a fresh MikroTik device for local-only Hotspot & PPPoE billing.
# All VPN dependencies and SSL certificate validation imports have been completely removed.
#
# INSTRUCTIONS:
# 1. Edit the "CONFIGURATION VARIABLES" section below to match your deployment.
# 2. Upload this script to your MikroTik router (using WinBox Files or WebFig).
# 3. Open Terminal in your MikroTik device and run:
#    /import streamlined-setup.rsc
# ==============================================================================

# ─── 0. CONFIGURATION VARIABLES ───
# Adjust these variables to match your server domain, token, and router credentials
:global wfbServerBase "https://ais-dev-7jc47wisq7qgezbepjpnmj-296303536462.europe-west3.run.app"
:global wfbOnboardToken "YOUR_ONBOARD_TOKEN"
:global wfbRouterId "YOUR_ROUTER_ID"
:global wfbAgentKey "YOUR_AGENT_KEY"
:global wfbTenantSlug "YOUR_TENANT_SLUG"

:log info "WiFiBilling: Starting streamlined-setup.rsc installation..."

# ─── 1. CREATE UNIFIED HOTSPOT & PPPOE BRIDGE (br-hotspot) ───
:do {
  :if ([:len [/interface bridge find name="br-hotspot"]] = 0) do={
    /interface bridge add name="br-hotspot" comment="WiFiBilling Hotspot & PPPoE Bridge"
  }
} on-error={ :log warning "WiFiBilling: Bridge creation failed or already exists." }

# ─── 2. AUTO-BRIDGE ALL LOCAL PORTS ───
# Excludes WAN port (ether1) to ensure we do not loop the uplink connection
:do {
  :foreach e in=[/interface ethernet find] do={
    :local eName [/interface ethernet get $e name]
    :if ($eName != "ether1" && $eName != "wan" && $eName != "WAN") do={
      :do {
        /interface bridge port remove [find where interface=$eName]
        /interface bridge port add bridge="br-hotspot" interface=$eName comment="Auto-bridged LAN"
      } on-error={}
    }
  }
} on-error={}

:do {
  :foreach w in=[/interface wireless find] do={
    :local wName [/interface wireless get $w name]
    :do {
      /interface bridge port remove [find where interface=$wName]
      /interface bridge port add bridge="br-hotspot" interface=$wName comment="Auto-bridged WLAN"
    } on-error={}
  }
} on-error={}

# ─── 3. IP ADDRESS & IP POOL ALLOCATION FOR HOTSPOT (10.10.0.1/24) ───
:do {
  :local hasGw false
  :foreach i in=[/ip address find] do={
    :local addrVal [/ip address get $i address]
    :if ([:pick $addrVal 0 9] = "10.10.0.1") do={
      :set hasGw true
    }
  }
  :if (!$hasGw) do={
    /ip address add address=10.10.0.1/24 interface="br-hotspot" comment="WiFiBilling Hotspot Gateway"
  }
} on-error={}

:do {
  :if ([:len [/ip pool find name="hs-pool"]] = 0) do={
    /ip pool add name="hs-pool" ranges=10.10.0.10-10.10.0.254
  }
} on-error={}

# ─── 4. DHCP SERVER CONFIGURATION FOR HOTSPOT ───
:do {
  :if ([:len [/ip dhcp-server find name="Hotspot_Gateway"]] = 0) do={
    /ip dhcp-server add name="Hotspot_Gateway" interface="br-hotspot" address-pool="hs-pool" disabled=no lease-time=1h
  }
} on-error={}

:do {
  :if ([:len [/ip dhcp-server network find address="10.10.0.0/24"]] = 0) do={
    /ip dhcp-server network add address=10.10.0.0/24 gateway=10.10.0.1 dns-server=8.8.8.8,1.1.1.1 comment="WiFiBilling Hotspot Network"
  } else={
    /ip dhcp-server network set [find address="10.10.0.0/24"] dns-server=8.8.8.8,1.1.1.1 gateway=10.10.0.1
  }
} on-error={}

# ─── 5. PPPOE SERVER CONFIGURATION ON br-hotspot ───
:do {
  :if ([:len [/ip pool find name="wfb-ppp-pool"]] = 0) do={
    /ip pool add name="wfb-ppp-pool" ranges=10.10.10.10-10.10.10.254
  }
  :if ([:len [/ppp profile find name="wfb-ppp-prof"]] = 0) do={
    /ppp profile add name="wfb-ppp-prof" local-address=10.10.10.1 remote-address=wfb-ppp-pool dns-server=8.8.8.8,1.1.1.1 comment="WiFiBilling PPPoE Profile"
  }
  :if ([:len [/interface pppoe-server server find service-name="wfb-pppoe"]] = 0) do={
    /interface pppoe-server server add service-name="wfb-pppoe" interface="br-hotspot" authentication=pap,chap,mschap1,mschap2 default-profile="wfb-ppp-prof" disabled=no
  }
} on-error={ :log warning "WiFiBilling: PPPoE Server Setup failed." }

# ─── 6. DNS SETUP & LOCAL PORTAL DOMAIN ROUTING ───
:do {
  /ip dns set allow-remote-requests=yes servers=8.8.8.8,1.1.1.1
} on-error={}

:do {
  :if ([:len [/ip dns static find name="wifi.login"]] = 0) do={
    /ip dns static add name="wifi.login" address=10.10.0.1 comment="WiFiBilling Portal Local DNS"
  }
} on-error={}

# ─── 7. COMPULSORY NTP / TIME SYNCHRONIZATION & CLOCK SETUP ───
:do {
  :do {
    /system ntp client set enabled=yes mode=unicast primary-ntp=162.159.200.123 secondary-ntp=129.6.15.28 servers=pool.ntp.org,time.google.com,time.cloudflare.com
  } on-error={
    :do { /system ntp client set enabled=yes mode=unicast servers=pool.ntp.org,time.google.com } on-error={
      :do { /system ntp client set enabled=yes } on-error={}
      :do { /system ntp client servers add address=pool.ntp.org } on-error={}
      :do { /system ntp client servers add address=time.google.com } on-error={}
    }
  }
} on-error={}

:do {
  /system clock set time-zone-autodetect=yes time-zone-name=UTC
} on-error={
  :do { /system clock set time-zone-autodetect=yes } on-error={}
}

# ─── 8. HOTSPOT USER PROFILE & SERVER PROFILE SETUP ───
:do {
  :if ([:len [/ip hotspot user profile find name="wfb-default-uprof"]] = 0) do={
    /ip hotspot user profile add name="wfb-default-uprof" shared-users=1 status-autorefresh=1m keepalive-timeout=2m
  }
} on-error={}

:do {
  :local hsDir "hotspot"
  :if ([:len [/file find name="flash"]] > 0) do={ :set hsDir "flash/hotspot" }
  :if ([:len [/ip hotspot profile find name="billing_hsprof"]] = 0) do={
    /ip hotspot profile add name="billing_hsprof" hotspot-address=10.10.0.1 dns-name="wifi.login" html-directory=$hsDir login-by=http-chap,http-pap,mac-cookie,cookie split-user-domain=no http-cookie-lifetime=1d use-radius=no
  } else={
    /ip hotspot profile set [find name="billing_hsprof"] hotspot-address=10.10.0.1 dns-name="wifi.login" html-directory=$hsDir login-by=http-chap,http-pap,mac-cookie,cookie split-user-domain=no http-cookie-lifetime=1d use-radius=no
  }
} on-error={}

# ─── 9. HOTSPOT SERVER ATTACHMENT TO br-hotspot ───
:do {
  :local existingHs false
  :foreach h in=[/ip hotspot find interface="br-hotspot"] do={
    :set existingHs true
    /ip hotspot set $h profile="billing_hsprof" disabled=no
  }
  :if (!$existingHs) do={
    :if ([:len [/ip hotspot find name="wfb-hotspot"]] = 0) do={
      /ip hotspot add name="wfb-hotspot" interface="br-hotspot" profile="billing_hsprof" address-pool="hs-pool" disabled=no
    } else={
      /ip hotspot set [find name="wfb-hotspot"] interface="br-hotspot" profile="billing_hsprof" disabled=no
    }
  }
} on-error={}

# ─── 10. MANAGEMENT IP & ROUTER BYPASSES ───
:do {
  :if ([:len [/ip hotspot ip-binding find address="10.10.0.1"]] = 0) do={
    /ip hotspot ip-binding add address=10.10.0.1 type=bypassed comment="WiFiBilling: Router Gateway Bypass"
  }
  :if ([:len [/ip hotspot ip-binding find address="192.168.88.1"]] = 0) do={
    /ip hotspot ip-binding add address=192.168.88.1 type=bypassed comment="WiFiBilling: Default Gateway Bypass"
  }
} on-error={}

# ─── 11. FIREWALL NAT & MASQUERADE (HOTSPOT + PPPOE + WAN) ───
:do {
  :if ([:len [/ip firewall nat find where comment="WiFiBilling Hotspot NAT"]] = 0) do={
    /ip firewall nat add chain=srcnat action=masquerade src-address=10.10.0.0/24 comment="WiFiBilling Hotspot NAT"
  }
  :if ([:len [/ip firewall nat find where comment="WiFiBilling PPPoE NAT"]] = 0) do={
    /ip firewall nat add chain=srcnat action=masquerade src-address=10.10.10.0/24 comment="WiFiBilling PPPoE NAT"
  }
  :if ([:len [/ip firewall nat find where comment="WiFiBilling WAN Masquerade"]] = 0) do={
    /ip firewall nat add chain=srcnat action=masquerade out-interface="ether1" comment="WiFiBilling WAN Masquerade"
  }
} on-error={}

# ─── 12. FETCH CAPTIVE PORTAL HTML FILES ───
# Pulls the responsive portal framework from the centralized server
:do {
  :local hsDir "hotspot"
  :if ([:len [/file find name="flash"]] > 0) do={ :set hsDir "flash/hotspot" }
  :log info "WiFiBilling: Downloading captive portal files..."
  /tool fetch url=($wfbServerBase . "/api/public/mikrotik/portal-file?token=" . $wfbOnboardToken . "&file=login.html") dst-path=($hsDir . "/login.html") check-certificate=no
  /tool fetch url=($wfbServerBase . "/api/public/mikrotik/portal-file?token=" . $wfbOnboardToken . "&file=alogin.html") dst-path=($hsDir . "/alogin.html") check-certificate=no
  /tool fetch url=($wfbServerBase . "/api/public/mikrotik/portal-file?token=" . $wfbOnboardToken . "&file=rlogin.html") dst-path=($hsDir . "/rlogin.html") check-certificate=no
  /tool fetch url=($wfbServerBase . "/api/public/mikrotik/portal-file?token=" . $wfbOnboardToken . "&file=redirect.html") dst-path=($hsDir . "/redirect.html") check-certificate=no
} on-error={ :log warning "WiFiBilling: Portal files fetch failed (Make sure router has internet access)" }

# ─── 13. CORE CLIENT SYNCHRONIZATION ENGINE & HEARTBEAT ───
# Merged script to fetch commands (sync) & report metrics (heartbeat) every 15 seconds
:do {
  :foreach s in=[/system script find where name="wfb-sync"] do={ /system script remove $s }
  :foreach t in=[/system scheduler find where name="wfb-sync-schedule"] do={ /system scheduler remove $t }
} on-error={}

/system script add name="wfb-sync" policy=read,write,test,ftp source="
  :global wfbServerBase
  :global wfbOnboardToken
  :global wfbRouterId
  :global wfbAgentKey

  :local hActive [:len [/ip hotspot active find]]
  :local pActive [:len [/ppp active find]]
  :local identity [/system identity get name]
  :local version [/system resource get version]
  :local uptime [/system resource get uptime]

  :local postData (\"identity=\" . \$identity . \"&version=\" . \$version . \"&uptime=\" . \$uptime . \"&hotspot_users=\" . \$hActive . \"&pppoe_users=\" . \$pActive)

  :do {
    /tool fetch url=(\$wfbServerBase . \"/api/public/mikrotik/sync?token=\" . \$wfbOnboardToken . \"&router_id=\" . \$wfbRouterId . \"&agent_key=\" . \$wfbAgentKey) http-method=post http-data=\$postData dst-path=\"wfb-commands.rsc\" check-certificate=no
    :delay 1s
    :if ([:len [/file find name=\"wfb-commands.rsc\"]] > 0) do={
      :local sz [/file get wfb-commands.rsc size]
      # Execution threshold to skip empty response files
      :if (\$sz > 45) do={
        :log info \"WiFiBilling: Executing active commands...\"
        /import wfb-commands.rsc
      }
      /file remove wfb-commands.rsc
    }
  } on-error={
    :log warning \"WiFiBilling: Synchronizer failed to fetch commands from the server.\"
  }
"

# Set scheduler to trigger client synchronization and telemetry heartbeat every 15 seconds
/system scheduler add name="wfb-sync-schedule" interval=15s on-event="/system script run wfb-sync" policy=read,write,test,ftp

# ─── 14. API & DEVICE SECURE LOCKDOWN ───
# Secures standard unencrypted or vulnerable MikroTik entry points
:do {
  /ip service disable ftp
  /ip service disable telnet
  /ip service disable api
  /ip service disable api-ssl
  /ip service set winbox address=10.10.0.0/16,192.168.0.0/16
  :log info "WiFiBilling: Non-secure RouterOS services locked down."
} on-error={}

# ─── 15. LIVENESS NETWATCH ALIVE MONITOR ───
:do {
  /tool netwatch remove [find comment="Real-Time Billing Heartbeat"]
} on-error={}
:do {
  /tool netwatch add host="8.8.8.8" interval=15s timeout=2s up-script=":log info \"=== WiFiBilling: Internet is Online ===\"" down-script=":log error \"!!! WiFiBilling: Internet Connection Lost !!!\"" comment="Real-Time Billing Heartbeat"
} on-error={}

# Run initial synchronization immediately to notify the server and update dashboard sync status
:log info "WiFiBilling: Initiating initial synchronization heartbeat..."
:do { /system script run wfb-sync; } on-error={ :log warning "WiFiBilling: Initial sync run failed. Scheduler will retry." }

:log info "WiFiBilling: Streamlined Setup completed successfully. Your device is online!"
