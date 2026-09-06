import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listScannedMacs,
  listNearbyMacs,
  triggerLiveRouterScan,
  triggerNearbyWirelessScan,
  quickBindScannedMac,
  kickScannedMac,
  type DiscoveredMacDevice,
  type NearbyWirelessMacDevice,
} from "@/lib/mac-scanner.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Search,
  RefreshCw,
  Tv,
  Smartphone,
  Laptop,
  Wifi,
  Radio,
  Copy,
  Check,
  Ban,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Terminal,
  Download,
  MoreVertical,
  Activity,
  Layers,
  Signal,
  SignalHigh,
  SignalMedium,
  SignalLow,
  Server,
  Network,
  Lock,
  Unlock,
  Cpu,
  Antenna,
} from "lucide-react";
import { toast } from "sonner";

interface MacScannerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRouterId?: string | null;
}

export function MacScannerModal({
  open,
  onOpenChange,
  initialRouterId = null,
}: MacScannerModalProps) {
  const queryClient = useQueryClient();
  const fetchScanned = useServerFn(listScannedMacs);
  const fetchNearby = useServerFn(listNearbyMacs);
  const callTriggerScan = useServerFn(triggerLiveRouterScan);
  const callTriggerNearbyScan = useServerFn(triggerNearbyWirelessScan);
  const callQuickBind = useServerFn(quickBindScannedMac);
  const callKick = useServerFn(kickScannedMac);

  const [activeTab, setActiveTab] = useState<"connected" | "nearby" | "cli">("connected");
  const [selectedRouterId, setSelectedRouterId] = useState<string>(initialRouterId || "all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [nearbyTypeFilter, setNearbyTypeFilter] = useState<string>("all");
  const [nearbyBandFilter, setNearbyBandFilter] = useState<string>("all");
  const [copiedMac, setCopiedMac] = useState<string | null>(null);
  const [showCliSnippet, setShowCliSnippet] = useState(false);

  // Binding dialog state
  const [bindDeviceTarget, setBindDeviceTarget] = useState<{
    mac: string;
    routerId?: string | null;
    defaultName?: string;
  } | null>(null);
  const [bindDeviceName, setBindDeviceName] = useState("");
  const [isBinding, setIsBinding] = useState(false);

  // Query filter
  const queryFilterRouterId =
    selectedRouterId && selectedRouterId !== "all" ? selectedRouterId : null;

  // 1. Connected hosts query
  const {
    data: connectedData,
    isLoading: isConnectedLoading,
    isFetching: isConnectedFetching,
    refetch: refetchConnected,
  } = useQuery({
    queryKey: ["scanned-macs", queryFilterRouterId],
    queryFn: () => fetchScanned({ data: { routerId: queryFilterRouterId } }),
    enabled: open && (activeTab === "connected" || activeTab === "cli"),
    refetchInterval: open ? 15000 : false,
  });

  // 2. Nearby Over-The-Air & Neighbors query
  const {
    data: nearbyData,
    isLoading: isNearbyLoading,
    isFetching: isNearbyFetching,
    refetch: refetchNearby,
  } = useQuery({
    queryKey: ["nearby-macs", queryFilterRouterId],
    queryFn: () => fetchNearby({ data: { routerId: queryFilterRouterId } }),
    enabled: open && activeTab === "nearby",
    refetchInterval: open ? 20000 : false,
  });

  // Live scan mutation (Hotspot host / DHCP)
  const triggerScanMutation = useMutation({
    mutationFn: async (rId: string) => {
      return callTriggerScan({ data: { routerId: rId } });
    },
    onSuccess: (res) => {
      toast.success(res.message || "Live scan triggered");
      refetchConnected();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to trigger scan");
    },
  });

  // Nearby wireless & neighbor scan mutation
  const triggerNearbyScanMutation = useMutation({
    mutationFn: async (rId: string | null) => {
      return callTriggerNearbyScan({ data: { routerId: rId } });
    },
    onSuccess: (res) => {
      toast.success(res.message || "Nearby wireless scan dispatched");
      refetchNearby();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to scan nearby wireless");
    },
  });

  // Kick mutation
  const kickMutation = useMutation({
    mutationFn: async ({ mac, routerId }: { mac: string; routerId: string }) => {
      return callKick({ data: { mac, routerId } });
    },
    onSuccess: (res) => {
      toast.success(res.message || "Disconnect command sent");
      refetchConnected();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to kick device");
    },
  });

  const routers = connectedData?.routers || nearbyData?.routers || [];
  const rawConnectedDevices = connectedData?.devices ?? [];
  const rawNearbyDevices = nearbyData?.devices ?? [];

  // Filtered connected devices
  const filteredConnectedDevices = useMemo(() => {
    return rawConnectedDevices.filter((d) => {
      if (statusFilter === "authorized" && d.status !== "authorized") return false;
      if (
        statusFilter === "unauthenticated" &&
        d.status !== "unauthenticated" &&
        d.status !== "expired"
      )
        return false;
      if (statusFilter === "bypassed" && d.status !== "bypassed") return false;
      if (statusFilter === "randomized" && !d.isRandomized) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          d.mac.toLowerCase().includes(q) ||
          d.vendor.toLowerCase().includes(q) ||
          (d.hostname || "").toLowerCase().includes(q) ||
          (d.customerName || "").toLowerCase().includes(q) ||
          (d.phone || "").toLowerCase().includes(q) ||
          d.routerName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rawConnectedDevices, statusFilter, searchQuery]);

  // Filtered nearby devices
  const filteredNearbyDevices = useMemo(() => {
    return rawNearbyDevices.filter((d) => {
      if (nearbyTypeFilter !== "all" && d.deviceType !== nearbyTypeFilter) return false;
      if (nearbyBandFilter !== "all" && d.band !== nearbyBandFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          d.mac.toLowerCase().includes(q) ||
          (d.ssid || "").toLowerCase().includes(q) ||
          d.vendor.toLowerCase().includes(q) ||
          (d.neighborIdentity || "").toLowerCase().includes(q) ||
          (d.neighborBoard || "").toLowerCase().includes(q) ||
          (d.interfaceName || "").toLowerCase().includes(q) ||
          d.routerName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rawNearbyDevices, nearbyTypeFilter, nearbyBandFilter, searchQuery]);

  function handleCopy(mac: string) {
    navigator.clipboard.writeText(mac);
    setCopiedMac(mac);
    toast.success(`Copied MAC ${mac} to clipboard`);
    setTimeout(() => setCopiedMac(null), 2500);
  }

  async function handleConfirmBind() {
    if (!bindDeviceTarget || !bindDeviceName.trim()) return;
    setIsBinding(true);
    try {
      await callQuickBind({
        data: {
          mac: bindDeviceTarget.mac,
          deviceName: bindDeviceName.trim(),
          routerId: bindDeviceTarget.routerId || (queryFilterRouterId ?? null),
        },
      });
      toast.success(`Device "${bindDeviceName}" bound to bypass portal`);
      queryClient.invalidateQueries({ queryKey: ["scanned-macs"] });
      queryClient.invalidateQueries({ queryKey: ["nearby-macs"] });
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      setBindDeviceTarget(null);
      setBindDeviceName("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to bind device");
    } finally {
      setIsBinding(false);
    }
  }

  function handleExportConnectedCsv() {
    if (filteredConnectedDevices.length === 0) {
      toast.info("No MAC devices to export");
      return;
    }
    const headers = [
      "MAC Address",
      "Vendor / Brand",
      "Randomized MAC",
      "Status",
      "Router",
      "Customer / Hostname",
      "Phone",
      "Package",
      "Last Seen",
    ];
    const rows = filteredConnectedDevices.map((d) => [
      `"${d.mac}"`,
      `"${d.vendor.replace(/"/g, '""')}"`,
      d.isRandomized ? "Yes" : "No",
      `"${d.status}"`,
      `"${d.routerName.replace(/"/g, '""')}"`,
      `"${(d.customerName || d.hostname || "").replace(/"/g, '""')}"`,
      `"${d.phone || ""}"`,
      `"${d.packageName || ""}"`,
      `"${d.lastSeen ? new Date(d.lastSeen).toLocaleString() : ""}"`,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `connected-macs-${selectedRouterId}-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Connected MAC list exported to CSV");
  }

  function handleExportNearbyCsv() {
    if (filteredNearbyDevices.length === 0) {
      toast.info("No nearby devices to export");
      return;
    }
    const headers = [
      "BSSID / MAC Address",
      "Device Type",
      "SSID / Network Name",
      "Signal (dBm)",
      "Channel & Band",
      "Security",
      "Hardware Vendor",
      "Interface / Identity",
      "Router",
      "Last Seen",
    ];
    const rows = filteredNearbyDevices.map((d) => [
      `"${d.mac}"`,
      `"${d.deviceType}"`,
      `"${(d.ssid || "").replace(/"/g, '""')}"`,
      `"${d.signalDbm} dBm"`,
      `"${d.channelText}"`,
      `"${d.security}"`,
      `"${d.vendor.replace(/"/g, '""')}"`,
      `"${(d.neighborIdentity || d.interfaceName || "").replace(/"/g, '""')}"`,
      `"${d.routerName.replace(/"/g, '""')}"`,
      `"${d.lastSeen ? new Date(d.lastSeen).toLocaleString() : ""}"`,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `nearby-wireless-macs-${selectedRouterId}-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Nearby wireless MAC list exported to CSV");
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[94vh] flex flex-col p-0 gap-0 overflow-hidden">
          {/* Header */}
          <div className="p-5 border-b bg-card space-y-3 shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <DialogTitle className="text-xl font-bold flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
                    <Activity className="size-5" />
                  </span>
                  MikroTik MAC & Wireless Scanner
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Discover connected host MACs, nearby wireless APs (BSSIDs), layer-2 network
                  neighbors, and over-the-air device probes.
                </DialogDescription>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCliSnippet(!showCliSnippet)}
                  className="h-8 text-xs gap-1.5"
                >
                  <Terminal className="size-3.5" />
                  CLI Commands
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={
                    activeTab === "nearby" ? handleExportNearbyCsv : handleExportConnectedCsv
                  }
                  className="h-8 text-xs gap-1.5"
                >
                  <Download className="size-3.5" />
                  Export CSV
                </Button>
                {activeTab === "nearby" ? (
                  <Button
                    variant="default"
                    size="sm"
                    disabled={isNearbyFetching || triggerNearbyScanMutation.isPending}
                    onClick={() => triggerNearbyScanMutation.mutate(queryFilterRouterId)}
                    className="h-8 text-xs gap-1.5 shadow-sm"
                  >
                    <RefreshCw
                      className={`size-3.5 ${
                        isNearbyFetching || triggerNearbyScanMutation.isPending
                          ? "animate-spin"
                          : ""
                      }`}
                    />
                    Scan Nearby Over-The-Air
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    size="sm"
                    disabled={isConnectedFetching || triggerScanMutation.isPending}
                    onClick={() => {
                      if (queryFilterRouterId) {
                        triggerScanMutation.mutate(queryFilterRouterId);
                      } else if (routers.length > 0) {
                        triggerScanMutation.mutate(routers[0].id);
                      } else {
                        refetchConnected();
                      }
                    }}
                    className="h-8 text-xs gap-1.5 shadow-sm"
                  >
                    <RefreshCw
                      className={`size-3.5 ${
                        isConnectedFetching || triggerScanMutation.isPending ? "animate-spin" : ""
                      }`}
                    />
                    Scan Live Hosts
                  </Button>
                )}
              </div>
            </div>

            {/* Router Select & Search */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-1">
              {/* Router Selector */}
              <div className="sm:col-span-4">
                <Select value={selectedRouterId} onValueChange={(val) => setSelectedRouterId(val)}>
                  <SelectTrigger className="h-9 text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <Layers className="size-3.5 text-muted-foreground shrink-0" />
                      <SelectValue placeholder="Select MikroTik Router" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <span className="font-semibold">All MikroTik Routers</span>
                    </SelectItem>
                    {routers.map((r: { id: string; name: string; location?: string | null }) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name} {r.location ? `(${r.location})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Dynamic Filter based on Tab */}
              {activeTab === "connected" ? (
                <div className="sm:col-span-3">
                  <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val)}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All States ({rawConnectedDevices.length})</SelectItem>
                      <SelectItem value="authorized">
                        🟢 Authorized ({connectedData?.authorizedCount ?? 0})
                      </SelectItem>
                      <SelectItem value="unauthenticated">
                        🟡 Portal Guests ({connectedData?.unauthCount ?? 0})
                      </SelectItem>
                      <SelectItem value="bypassed">
                        🔵 Smart TV Bypass ({connectedData?.bypassedCount ?? 0})
                      </SelectItem>
                      <SelectItem value="randomized">
                        🛡️ Randomized MACs ({connectedData?.randomizedCount ?? 0})
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="sm:col-span-3 flex gap-1.5">
                  <Select
                    value={nearbyTypeFilter}
                    onValueChange={(val) => setNearbyTypeFilter(val)}
                  >
                    <SelectTrigger className="h-9 text-xs flex-1">
                      <SelectValue placeholder="Device Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types ({rawNearbyDevices.length})</SelectItem>
                      <SelectItem value="access_point">
                        📡 Wi-Fi APs ({nearbyData?.accessPointsCount ?? 0})
                      </SelectItem>
                      <SelectItem value="mndp_neighbor">
                        🖥️ Layer-2 Neighbors ({nearbyData?.neighborsCount ?? 0})
                      </SelectItem>
                      <SelectItem value="snooped_client">
                        📱 Snooped Probes ({nearbyData?.snoopedClientsCount ?? 0})
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={nearbyBandFilter}
                    onValueChange={(val) => setNearbyBandFilter(val)}
                  >
                    <SelectTrigger className="h-9 text-xs w-[105px]">
                      <SelectValue placeholder="Band" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Bands</SelectItem>
                      <SelectItem value="2.4 GHz">2.4 GHz</SelectItem>
                      <SelectItem value="5 GHz">5 GHz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Search Box */}
              <div className="sm:col-span-5 relative">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder={
                    activeTab === "nearby"
                      ? "Search SSID, BSSID MAC, Vendor, Channel..."
                      : "Search MAC, Vendor, Hostname, Phone..."
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-xs"
                />
              </div>
            </div>

            {/* Collapsible CLI Snippet */}
            {showCliSnippet && (
              <div className="p-3 bg-muted/70 rounded-lg border text-xs space-y-1.5 font-mono">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <Terminal className="size-3.5 text-primary" />
                    MikroTik RouterOS Live Scanner Commands:
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] px-2"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `# 1. Scan nearby Wireless Access Points & BSSIDs:\n/interface wireless scan [find default-name=wlan1] duration=10\n\n# 2. Snoop over-the-air nearby client MACs & probe requests:\n/interface wireless snooper snoop [find default-name=wlan1] duration=10\n\n# 3. Discover layer-2 MNDP / CDP / LLDP neighboring routers & switches:\n/ip neighbor print detail\n\n# 4. View active & unauthenticated Hotspot client hosts:\n/ip hotspot host print detail`,
                      );
                      toast.success("RouterOS diagnostic commands copied");
                    }}
                  >
                    Copy All CLI
                  </Button>
                </div>
                <pre className="bg-background/90 p-2.5 rounded text-[11px] text-muted-foreground overflow-x-auto whitespace-pre leading-relaxed">
                  {`# 1. Scan nearby Wi-Fi Access Points & BSSID MACs:
/interface wireless scan [find default-name=wlan1] duration=10

# 2. Over-the-air sniffer for nearby phones & client probes:
/interface wireless snooper snoop [find default-name=wlan1] duration=10

# 3. Layer-2 MNDP / LLDP Neighbor hardware discovery:
/ip neighbor print detail

# 4. Active & Unauthenticated Hotspot hosts:
/ip hotspot host print detail`}
                </pre>
              </div>
            )}
          </div>

          {/* Tab Navigation */}
          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as "connected" | "nearby" | "cli")}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div className="px-5 pt-3 border-b bg-muted/20 flex items-center justify-between">
              <TabsList className="bg-muted/60 p-1">
                <TabsTrigger value="connected" className="text-xs gap-2 py-1.5">
                  <Wifi className="size-3.5 text-primary" />
                  Connected Hosts & Guests
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                    {rawConnectedDevices.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="nearby" className="text-xs gap-2 py-1.5">
                  <Radio className="size-3.5 text-sky-500" />
                  Nearby Over-The-Air & Neighbors
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 h-4 border-sky-500/30 text-sky-600 dark:text-sky-400 bg-sky-500/10"
                  >
                    {rawNearbyDevices.length}
                  </Badge>
                </TabsTrigger>
              </TabsList>

              <div className="text-[11px] text-muted-foreground hidden md:flex items-center gap-3">
                {activeTab === "nearby" ? (
                  <>
                    <span className="flex items-center gap-1">
                      <Antenna className="size-3 text-sky-400" /> APs:{" "}
                      {nearbyData?.accessPointsCount ?? 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <Network className="size-3 text-emerald-400" /> MNDP:{" "}
                      {nearbyData?.neighborsCount ?? 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <Smartphone className="size-3 text-purple-400" /> Probes:{" "}
                      {nearbyData?.snoopedClientsCount ?? 0}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1">
                      <Check className="size-3 text-emerald-500" /> Auth:{" "}
                      {connectedData?.authorizedCount ?? 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <Radio className="size-3 text-amber-500" /> Guests:{" "}
                      {connectedData?.unauthCount ?? 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <Tv className="size-3 text-blue-500" /> TVs:{" "}
                      {connectedData?.bypassedCount ?? 0}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* TAB 1: Connected Hosts & Guests */}
            <TabsContent value="connected" className="flex-1 overflow-y-auto p-4 m-0">
              {isConnectedLoading ? (
                <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                  <RefreshCw className="size-8 text-primary animate-spin" />
                  <p className="text-sm font-medium">Scanning MikroTik network hosts...</p>
                </div>
              ) : filteredConnectedDevices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                  <Wifi className="size-12 text-muted-foreground/40 stroke-[1.2]" />
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold">No connected MAC addresses found</h4>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      {searchQuery || statusFilter !== "all"
                        ? "No devices match your current search and filter criteria."
                        : "No active hosts or customer MACs registered on this router yet. Connect a phone or click 'Scan Live Hosts'."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="hidden sm:grid sm:grid-cols-12 gap-3 px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b">
                    <div className="col-span-4">Device & MAC Address</div>
                    <div className="col-span-3">Vendor / Hardware</div>
                    <div className="col-span-2">Router & Status</div>
                    <div className="col-span-3 text-right">Actions</div>
                  </div>

                  <div className="divide-y divide-border/60">
                    {filteredConnectedDevices.map((device) => {
                      const isRandom = device.isRandomized;
                      let VendorIcon = Smartphone;
                      if (device.vendorCategory === "tv") VendorIcon = Tv;
                      else if (device.vendorCategory === "pc") VendorIcon = Laptop;
                      else if (device.vendorCategory === "ap") VendorIcon = Radio;

                      return (
                        <div
                          key={device.id}
                          className="py-3 px-3 rounded-lg hover:bg-muted/40 transition-colors flex flex-col sm:grid sm:grid-cols-12 gap-3 items-start sm:items-center text-xs"
                        >
                          {/* Col 1: MAC & Hostname */}
                          <div className="sm:col-span-4 flex items-start gap-2.5 min-w-0 w-full">
                            <div className="p-2 rounded-md bg-muted text-muted-foreground shrink-0 mt-0.5 sm:mt-0">
                              <VendorIcon className="size-4 text-foreground" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono font-bold text-foreground tracking-wider select-all">
                                  {device.mac}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-5 text-muted-foreground hover:text-foreground"
                                  onClick={() => handleCopy(device.mac)}
                                  title="Copy MAC Address"
                                >
                                  {copiedMac === device.mac ? (
                                    <Check className="size-3 text-emerald-500" />
                                  ) : (
                                    <Copy className="size-3" />
                                  )}
                                </Button>
                              </div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {device.customerName ||
                                  device.hostname ||
                                  (device.phone && !device.phone.startsWith("DEVICE-")
                                    ? `Phone: ${device.phone}`
                                    : "Unregistered Guest")}
                              </div>
                            </div>
                          </div>

                          {/* Col 2: Vendor */}
                          <div className="sm:col-span-3 min-w-0 w-full">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-foreground truncate">
                                {device.vendor}
                              </span>
                            </div>
                            {isRandom ? (
                              <div className="flex items-center gap-1 text-[11px] text-purple-600 dark:text-purple-400 font-medium">
                                <Shield className="size-3 shrink-0" />
                                <span>Private / MAC Randomized</span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">
                                Hardware MAC (Fixed OUI)
                              </span>
                            )}
                          </div>

                          {/* Col 3: Router & Status */}
                          <div className="sm:col-span-2 min-w-0 w-full space-y-1">
                            <div className="text-muted-foreground text-[11px] truncate flex items-center gap-1">
                              <Layers className="size-3 shrink-0" />
                              {device.routerName}
                            </div>
                            <div>
                              {device.status === "authorized" && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 font-medium"
                                >
                                  Authorized
                                </Badge>
                              )}
                              {device.status === "unauthenticated" && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 font-medium"
                                >
                                  Portal Guest
                                </Badge>
                              )}
                              {device.status === "bypassed" && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-500/10 font-medium"
                                >
                                  Bypassed TV
                                </Badge>
                              )}
                              {device.status === "expired" && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 border-red-500/40 text-red-600 dark:text-red-400 bg-red-500/10 font-medium"
                                >
                                  Expired
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Col 4: Actions */}
                          <div className="sm:col-span-3 flex items-center justify-end gap-1.5 w-full">
                            {!device.isBound && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setBindDeviceTarget(device);
                                  setBindDeviceName(
                                    device.hostname ||
                                      `${device.vendor.split(" ")[0]} Device (${device.mac.slice(-5)})`,
                                  );
                                }}
                                className="h-7 text-[11px] gap-1 px-2 border-primary/30 text-primary hover:bg-primary/10 font-semibold"
                              >
                                <Tv className="size-3" />
                                Bind Bypass
                              </Button>
                            )}

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-muted-foreground"
                                >
                                  <MoreVertical className="size-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="text-xs">
                                <DropdownMenuItem
                                  onClick={() => handleCopy(device.mac)}
                                  className="gap-2"
                                >
                                  <Copy className="size-3.5" /> Copy MAC Address
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setBindDeviceTarget(device);
                                    setBindDeviceName(
                                      device.hostname || `${device.vendor.split(" ")[0]} Device`,
                                    );
                                  }}
                                  className="gap-2 text-primary"
                                >
                                  <Tv className="size-3.5" /> Bind to Bypass Portal
                                </DropdownMenuItem>
                                {device.routerId && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      kickMutation.mutate({
                                        mac: device.mac,
                                        routerId: device.routerId,
                                      })
                                    }
                                    className="gap-2 text-destructive focus:text-destructive"
                                  >
                                    <Ban className="size-3.5" /> Kick / Disconnect Host
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* TAB 2: Nearby Over-The-Air & Neighbors */}
            <TabsContent value="nearby" className="flex-1 overflow-y-auto p-4 m-0">
              {isNearbyLoading ? (
                <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                  <RefreshCw className="size-8 text-sky-500 animate-spin" />
                  <p className="text-sm font-medium">
                    Scanning nearby wireless spectrum and layer-2 neighbors...
                  </p>
                </div>
              ) : filteredNearbyDevices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                  <Radio className="size-12 text-muted-foreground/40 stroke-[1.2]" />
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold">No nearby wireless devices detected</h4>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      {searchQuery || nearbyTypeFilter !== "all" || nearbyBandFilter !== "all"
                        ? "No devices match your current filters."
                        : "Click 'Scan Nearby Over-The-Air' to dispatch wireless scanning to your MikroTik radios."}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => triggerNearbyScanMutation.mutate(queryFilterRouterId)}
                    className="gap-1.5 text-xs"
                  >
                    <RefreshCw className="size-3.5" /> Scan Nearby Wireless Now
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="hidden sm:grid sm:grid-cols-12 gap-3 px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b">
                    <div className="col-span-4">SSID / Nearby MAC (BSSID)</div>
                    <div className="col-span-3">Signal & Quality</div>
                    <div className="col-span-3">Channel, Band & Vendor</div>
                    <div className="col-span-2 text-right">Actions</div>
                  </div>

                  <div className="divide-y divide-border/60">
                    {filteredNearbyDevices.map((device) => {
                      const isAp = device.deviceType === "access_point";
                      const isMndp = device.deviceType === "mndp_neighbor";
                      const isSnoop = device.deviceType === "snooped_client";

                      return (
                        <div
                          key={device.id}
                          className="py-3 px-3 rounded-lg hover:bg-muted/40 transition-colors flex flex-col sm:grid sm:grid-cols-12 gap-3 items-start sm:items-center text-xs"
                        >
                          {/* Col 1: SSID / MAC / Identity */}
                          <div className="sm:col-span-4 flex items-start gap-2.5 min-w-0 w-full">
                            <div
                              className={`p-2 rounded-md shrink-0 mt-0.5 sm:mt-0 ${
                                isAp
                                  ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                                  : isMndp
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    : "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                              }`}
                            >
                              {isAp && <Antenna className="size-4" />}
                              {isMndp && <Server className="size-4" />}
                              {isSnoop && <Smartphone className="size-4" />}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-semibold text-foreground truncate">
                                  {device.ssid ||
                                    device.neighborIdentity ||
                                    (isSnoop ? "Nearby Probe Request" : "Direct Link")}
                                </span>
                                {isAp && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-1 py-0 border-sky-500/30 text-sky-500"
                                  >
                                    AP BSSID
                                  </Badge>
                                )}
                                {isMndp && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-1 py-0 border-emerald-500/30 text-emerald-500"
                                  >
                                    MNDP
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <span className="font-mono font-medium tracking-wide">
                                  {device.mac}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-4 text-muted-foreground hover:text-foreground"
                                  onClick={() => handleCopy(device.mac)}
                                  title="Copy MAC / BSSID"
                                >
                                  {copiedMac === device.mac ? (
                                    <Check className="size-2.5 text-emerald-500" />
                                  ) : (
                                    <Copy className="size-2.5" />
                                  )}
                                </Button>
                              </div>
                              {device.neighborIp && (
                                <span className="text-[10px] font-mono text-muted-foreground">
                                  IP: {device.neighborIp}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Col 2: Signal Strength & Meter */}
                          <div className="sm:col-span-3 min-w-0 w-full space-y-1.5">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-mono font-bold text-foreground">
                                {device.signalDbm !== 0
                                  ? `${device.signalDbm} dBm`
                                  : "Ethernet Link"}
                              </span>
                              <span className={`font-semibold ${device.signalQuality.color}`}>
                                {device.signalQuality.rating}
                              </span>
                            </div>
                            {/* Visual Signal Bar */}
                            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 ${
                                  device.signalQuality.percentage >= 75
                                    ? "bg-emerald-500"
                                    : device.signalQuality.percentage >= 50
                                      ? "bg-amber-500"
                                      : "bg-red-500"
                                }`}
                                style={{ width: `${device.signalQuality.percentage}%` }}
                              />
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                              {device.security === "Open" ? (
                                <span className="flex items-center gap-1 text-amber-500 font-medium">
                                  <Unlock className="size-2.5" /> Open (Unsecured)
                                </span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <Lock className="size-2.5" /> {device.security}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Col 3: Channel, Band & Hardware */}
                          <div className="sm:col-span-3 min-w-0 w-full space-y-0.5">
                            <div className="font-medium text-foreground truncate">
                              {device.vendor}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                                {device.channelText}
                              </Badge>
                              {device.neighborBoard && (
                                <span className="text-[10px] font-mono">
                                  {device.neighborBoard}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              Discovered on: {device.routerName} ({device.interfaceName || "wlan1"})
                            </div>
                          </div>

                          {/* Col 4: Actions */}
                          <div className="sm:col-span-2 flex items-center justify-end gap-1.5 w-full">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setBindDeviceTarget({
                                  mac: device.mac,
                                  routerId: device.routerId,
                                  defaultName:
                                    device.ssid ||
                                    device.neighborIdentity ||
                                    `${device.vendor.split(" ")[0]} AP`,
                                });
                                setBindDeviceName(
                                  device.ssid ||
                                    device.neighborIdentity ||
                                    `${device.vendor.split(" ")[0]} AP`,
                                );
                              }}
                              className="h-7 text-[11px] gap-1 px-2 border-primary/25 text-primary hover:bg-primary/10 font-semibold"
                            >
                              <Tv className="size-3" />
                              Bypass
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground"
                              onClick={() => handleCopy(device.mac)}
                              title="Copy MAC Address"
                            >
                              {copiedMac === device.mac ? (
                                <Check className="size-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="size-3.5" />
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Quick Bind Dialog */}
      <Dialog open={!!bindDeviceTarget} onOpenChange={(open) => !open && setBindDeviceTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tv className="size-5 text-primary" />
              Bind MAC to Bypass Captive Portal
            </DialogTitle>
            <DialogDescription className="text-xs">
              Grant this device direct internet access on your MikroTik hotspot without requiring it
              to login through the captive portal.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Target MAC Address
              </label>
              <div className="p-2.5 rounded-lg bg-muted font-mono text-sm font-bold text-foreground">
                {bindDeviceTarget?.mac}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Device Name / Description
              </label>
              <Input
                placeholder="e.g. Living Room Samsung TV, Outdoor UniFi AP, Guest Console"
                value={bindDeviceName}
                onChange={(e) => setBindDeviceName(e.target.value)}
                className="h-9 text-xs"
                autoFocus
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBindDeviceTarget(null)}
              disabled={isBinding}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmBind}
              disabled={isBinding || !bindDeviceName.trim()}
              className="gap-1.5 font-semibold"
            >
              {isBinding ? (
                <RefreshCw className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              Confirm Bypass
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
