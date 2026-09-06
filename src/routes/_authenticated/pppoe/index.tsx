import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { getMyContext } from "@/lib/tenancy.functions";
import {
  getPPPoEStats,
  getPPPoERouters,
  getPPPoECustomers,
  getPPPoEActiveSessions,
  savePPPoECustomer,
  suspendPPPoECustomer,
  resetPPPoEPassword,
  syncPPPoERouter,
  deployMillionPPPoEPool,
} from "@/lib/pppoe.functions";
import { getPackages, listNetwork, deployHighCapacityHotspotPool } from "@/lib/network.functions";
import {
  Users,
  Activity,
  Plus,
  Search,
  MoreVertical,
  ShieldAlert,
  ShieldCheck,
  Router,
  Zap,
  Loader2,
  KeyRound,
  RefreshCw,
  Ban,
  Pencil,
  Banknote,
  CalendarDays,
  ExternalLink,
  Copy,
  Check,
  Globe,
  Dices,
  Layers,
  Server,
  Terminal,
  Network,
  Database,
  Cpu,
  Wifi,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/pppoe/")({
  component: PPPoEManager,
});

type CustomerItem = {
  id: string;
  full_name: string;
  phone: string;
  username: string;
  password?: string | null;
  package_id?: string | null;
  router_id?: string | null;
  status: string;
  expires_at?: string | null;
  packages?: { name: string; price_kes: number; duration_hours: number } | null;
  routers?: { name: string } | null;
};

type SessionItem = {
  id: string;
  username: string;
  ip_address: string;
  connected_at?: string | null;
  uptime?: string | null;
  bytes_in_formatted?: string | null;
  bytes_out_formatted?: string | null;
  customers?: { full_name?: string | null; phone?: string | null } | null;
};

type RouterItem = {
  id: string;
  name: string;
  status: string;
  active_pppoe_users?: number;
  last_seen_at?: string | null;
  public_ip?: string | null;
  ros_version?: string | null;
};

type PackageItem = {
  id: string;
  name: string;
  price_kes: number;
  kind?: string | null;
};

function PPPoEManager() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchContext = useServerFn(getMyContext);
  const fetchStats = useServerFn(getPPPoEStats);
  const fetchRouters = useServerFn(getPPPoERouters);
  const fetchNetwork = useServerFn(listNetwork);
  const fetchCustomers = useServerFn(getPPPoECustomers);
  const fetchSessions = useServerFn(getPPPoEActiveSessions);
  const fetchPackages = useServerFn(getPackages);
  const saveCustomer = useServerFn(savePPPoECustomer);
  const suspendCustomer = useServerFn(suspendPPPoECustomer);
  const resetPassword = useServerFn(resetPPPoEPassword);
  const syncRouter = useServerFn(syncPPPoERouter);
  const deployPoolFn = useServerFn(deployMillionPPPoEPool);
  const deployHotspotPoolFn = useServerFn(deployHighCapacityHotspotPool);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [selectedPackage, setSelectedPackage] = useState<string>("");
  const [selectedRouter, setSelectedRouter] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [isDeployingPool, setIsDeployingPool] = useState<string | null>(null);
  const [isDeployingHotspotPool, setIsDeployingHotspotPool] = useState<string | null>(null);
  const [selectedPoolRouter, setSelectedPoolRouter] = useState<string>("");
  const [copiedPoolScript, setCopiedPoolScript] = useState(false);
  const [copiedHotspotScript, setCopiedHotspotScript] = useState(false);
  const [poolScriptMode, setPoolScriptMode] = useState<"hotspot" | "pppoe" | "dual">("hotspot");
  const [searchTerm, setSearchTerm] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  const context = useQuery({ queryKey: ["my-context"], queryFn: () => fetchContext() });
  const stats = useQuery({ queryKey: ["pppoe-stats"], queryFn: () => fetchStats() });
  const network = useQuery({ queryKey: ["network"], queryFn: () => fetchNetwork() });
  const routers = useQuery({ queryKey: ["pppoe-routers"], queryFn: () => fetchRouters() });
  const customers = useQuery({ queryKey: ["pppoe-customers"], queryFn: () => fetchCustomers() });
  const sessions = useQuery({ queryKey: ["pppoe-sessions"], queryFn: () => fetchSessions() });
  const packages = useQuery({ queryKey: ["packages"], queryFn: () => fetchPackages() });

  const routerList = useMemo(() => {
    if (network.data?.routers && network.data.routers.length > 0) {
      return network.data.routers as RouterItem[];
    }
    if (routers.data && routers.data.length > 0) return routers.data as RouterItem[];
    if (stats.data?.routers && stats.data.routers.length > 0) return stats.data.routers as RouterItem[];
    return [] as RouterItem[];
  }, [network.data?.routers, routers.data, stats.data?.routers]);

  const pppPackages = useMemo(() => {
    if (!packages.data) return [];
    return (packages.data as { id: string; name: string; price_kes: number; type?: string }[]).filter(
      (p) => !p.type || p.type === "pppoe" || p.type === "both",
    );
  }, [packages.data]);

  useEffect(() => {
    if (!selectedPackage && pppPackages.length > 0) {
      setSelectedPackage(pppPackages[0].id);
    }
  }, [pppPackages, selectedPackage]);

  useEffect(() => {
    if (!selectedRouter && routerList.length > 0) {
      setSelectedRouter(routerList[0].id);
    }
  }, [routerList, selectedRouter]);

  useEffect(() => {
    if (!selectedPoolRouter && routerList.length > 0) {
      setSelectedPoolRouter(routerList[0].id);
    }
  }, [routerList, selectedPoolRouter]);

  const openAddModal = () => {
    setEditingCustomer(null);
    setGeneratedPassword("");
    setSelectedPackage(pppPackages[0]?.id || "");
    setSelectedRouter(routerList[0]?.id || "");
    setIsModalOpen(true);
  };

  const openEditModal = (customer: CustomerItem) => {
    setEditingCustomer(customer);
    setGeneratedPassword("");
    setSelectedPackage(customer.package_id || pppPackages[0]?.id || "");
    setSelectedRouter(customer.router_id || routerList[0]?.id || "");
    setIsModalOpen(true);
  };

  const filteredCustomers = useMemo(() => {
    if (!customers.data) return [];
    if (!searchTerm) return customers.data as CustomerItem[];
    const lower = searchTerm.toLowerCase();
    return (customers.data as CustomerItem[]).filter(
      (c) =>
        c.full_name?.toLowerCase().includes(lower) ||
        c.username?.toLowerCase().includes(lower) ||
        c.phone?.includes(lower),
    );
  }, [customers.data, searchTerm]);

  const handleGeneratePassword = () => {
    const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
    let pwd = "";
    for (let i = 0; i < 8; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setGeneratedPassword(pwd);
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    const formData = new FormData(e.currentTarget);
    const passwordVal = (formData.get("password") as string) || generatedPassword || editingCustomer?.password || null;
    const formRouterId = (formData.get("router_id") as string) || selectedRouter;
    const formPackageId = (formData.get("package_id") as string) || selectedPackage;

    const router_id = formRouterId && formRouterId !== "none" ? formRouterId : "";
    if (!router_id) {
      toast.error("Please select an onboarded router to manage this PPPoE customer.");
      setIsSaving(false);
      return;
    }

    const data = {
      id: editingCustomer?.id,
      full_name: String(formData.get("full_name") || ""),
      phone: String(formData.get("phone") || ""),
      username: String(formData.get("username") || ""),
      password: passwordVal,
      package_id: formPackageId && formPackageId !== "none" ? formPackageId : null,
      router_id,
      status: editingCustomer?.status || "active",
    };

    try {
      await saveCustomer({ data });
      toast.success(editingCustomer ? "Customer updated" : "Customer added & provisioned on MikroTik");
      queryClient.invalidateQueries({ queryKey: ["pppoe-customers"] });
      queryClient.invalidateQueries({ queryKey: ["pppoe-stats"] });
      queryClient.invalidateQueries({ queryKey: ["pppoe-routers"] });
      setIsModalOpen(false);
      setEditingCustomer(null);
      setGeneratedPassword("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save customer");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSuspend = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "suspended" : "active";
    try {
      await suspendCustomer({ data: { id, status: newStatus } });
      toast.success(`Customer ${newStatus === "active" ? "activated" : "suspended"}`);
      queryClient.invalidateQueries({ queryKey: ["pppoe-customers"] });
      queryClient.invalidateQueries({ queryKey: ["pppoe-stats"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  const handleResetPassword = async (id: string) => {
    try {
      const res = await resetPassword({ data: { id } });
      toast.success(`Password reset successfully. New password: ${res.password}`);
      queryClient.invalidateQueries({ queryKey: ["pppoe-customers"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reset password");
    }
  };

  const handleSync = async (routerId: string) => {
    setIsSyncing(routerId);
    try {
      const res = await syncRouter({ data: { routerId } });
      toast.success(`Successfully queued ${res.synced} synchronization commands`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setIsSyncing(null);
    }
  };

  const handleDeployPool = async (routerId: string) => {
    if (!routerId) {
      toast.error("Please select a target MikroTik router.");
      return;
    }
    setIsDeployingPool(routerId);
    try {
      const res = await deployPoolFn({ data: { routerId } });
      toast.success(res?.message || "16M+ PPPoE IP Pool deployed successfully!");
      queryClient.invalidateQueries({ queryKey: ["pppoe-routers"] });
      queryClient.invalidateQueries({ queryKey: ["pppoe-stats"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to deploy PPPoE IP pool to router.");
    } finally {
      setIsDeployingPool(null);
    }
  };

  const handleDeployHotspotPool = async (routerId: string) => {
    if (!routerId) {
      toast.error("Please select a target MikroTik router.");
      return;
    }
    setIsDeployingHotspotPool(routerId);
    try {
      const res = await deployHotspotPoolFn({ data: { routerId } });
      toast.success(res?.message || "65K+ Hotspot IP Pool deployed successfully!");
      queryClient.invalidateQueries({ queryKey: ["pppoe-routers"] });
      queryClient.invalidateQueries({ queryKey: ["network"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to deploy Hotspot IP pool to router.");
    } finally {
      setIsDeployingHotspotPool(null);
    }
  };

  const handleDeployBothPools = async (routerId: string) => {
    if (!routerId) {
      toast.error("Please select a target MikroTik router.");
      return;
    }
    setIsDeployingPool(routerId);
    setIsDeployingHotspotPool(routerId);
    try {
      await deployHotspotPoolFn({ data: { routerId } });
      await deployPoolFn({ data: { routerId } });
      toast.success("Complete Carrier Stack (65K+ Hotspot + 16.7M+ PPPoE) deployed successfully!");
      queryClient.invalidateQueries({ queryKey: ["pppoe-routers"] });
      queryClient.invalidateQueries({ queryKey: ["network"] });
      queryClient.invalidateQueries({ queryKey: ["pppoe-stats"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to deploy full carrier stack.");
    } finally {
      setIsDeployingPool(null);
      setIsDeployingHotspotPool(null);
    }
  };

  const poolTerminalScript = `# MikroTik High-Capacity PPPoE Pool Setup (16,711,676 Active + 1,048,574 Expired Subscribers)
:log info "WiFiBilling: Configuring High-Capacity PPPoE Pool (16M+ connections)...";
/ip pool add name="PPPOE ACTIVE POOL" ranges=10.0.0.2-10.9.255.255,10.11.0.1-10.255.255.254 comment="WiFiBilling 16M+ Active Subscribers Pool";
/ip pool add name="expired_pppoe_pool" ranges=172.16.0.2-172.31.255.254 comment="WiFiBilling 1M+ Expired Subscribers Pool";
/ppp profile set [find name="default"] local-address=10.0.0.1 remote-address="PPPOE ACTIVE POOL" dns-server=8.8.8.8,1.1.1.1;
/ip firewall nat add chain=srcnat action=masquerade src-address=10.0.0.0/8 comment="PPPOE NAT";
/ip firewall nat add chain=srcnat action=masquerade src-address=172.16.0.0/12 comment="EXPIRED PPPOE NAT";
:log info "WiFiBilling: High-Capacity PPPoE Pool (16M+ active & 1M+ expired) successfully configured.";`;

  const hotspotTerminalScript = `# MikroTik High-Capacity Hotspot Pool Setup (65,525 Concurrent Devices on 10.10.0.0/16)
:log info "WiFiBilling: Configuring High-Capacity Hotspot Pool (65K+ hosts)...";
:do {
  :local hasGw false;
  :foreach i in=[/ip address find] do={
    :local addrVal [/ip address get $i address];
    :if ([:pick $addrVal 0 9] = "10.10.0.1") do={
      /ip address set $i address=10.10.0.1/16;
      :set hasGw true;
    };
  };
  :if (!$hasGw) do={
    /ip address add address=10.10.0.1/16 interface="br-hotspot" comment="WiFiBilling Hotspot Gateway";
  };
} on-error={};
:do {
  :if ([:len [/ip pool find name="hs-pool"]] = 0) do={
    /ip pool add name="hs-pool" ranges=10.10.0.10-10.10.255.254 comment="WiFiBilling 65K+ Hotspot Pool";
  } else={
    /ip pool set [find name="hs-pool"] ranges=10.10.0.10-10.10.255.254;
  };
  :if ([:len [/ip pool find name="hotspot"]] > 0) do={
    /ip pool set [find name="hotspot"] ranges=10.10.0.10-10.10.255.254;
  };
} on-error={};
:do {
  :if ([:len [/ip dhcp-server network find address="10.10.0.0/16"]] = 0) do={
    /ip dhcp-server network add address=10.10.0.0/16 gateway=10.10.0.1 netmask=16 dns-server=10.10.0.1 comment="WiFiBilling Hotspot Network (65K+)";
  } else={
    /ip dhcp-server network set [find address="10.10.0.0/16"] gateway=10.10.0.1 netmask=16 dns-server=10.10.0.1;
  };
} on-error={};
:do {
  /ip dhcp-server set [find address-pool="hs-pool"] lease-time=30m;
  /ip dhcp-server set [find address-pool="hotspot"] lease-time=30m;
} on-error={};
:do {
  :if ([:len [/ip firewall nat find where comment="WiFiBilling Hotspot NAT"]] = 0) do={
    /ip firewall nat add chain=srcnat action=masquerade src-address=10.10.0.0/16 comment="WiFiBilling Hotspot NAT";
  } else={
    /ip firewall nat set [find comment="WiFiBilling Hotspot NAT"] src-address=10.10.0.0/16;
  };
} on-error={};
:log info "WiFiBilling: High-Capacity Hotspot Pool (65,525 hosts on 10.10.0.0/16) successfully configured.";`;

  const dualTerminalScript = `# ==============================================================================
# Complete Carrier Stack: 65K+ Hotspot (10.10.0.0/16) + 16.7M+ PPPoE (10.0.0.0/8)
# Zero subnet conflicts: PPPoE safely bypasses 10.10.0.0/16 reserved for Hotspot
# ==============================================================================
` + hotspotTerminalScript + `\n\n` + poolTerminalScript;

  const copyScriptByMode = (mode: "hotspot" | "pppoe" | "dual") => {
    const text =
      mode === "hotspot"
        ? hotspotTerminalScript
        : mode === "pppoe"
          ? poolTerminalScript
          : dualTerminalScript;
    navigator.clipboard.writeText(text);
    if (mode === "hotspot") {
      setCopiedHotspotScript(true);
      setTimeout(() => setCopiedHotspotScript(false), 2500);
    } else {
      setCopiedPoolScript(true);
      setTimeout(() => setCopiedPoolScript(false), 2500);
    }
    toast.success(`RouterOS ${mode.toUpperCase()} commands copied to clipboard!`);
  };

  const copyPoolScript = () => copyScriptByMode("pppoe");
  const copyHotspotScript = () => copyScriptByMode("hotspot");

  if (context.isPending) return null;
  const tenant = context.data.tenant;
  if (!tenant) return null;

  const portalUrl = typeof window !== "undefined"
    ? `${window.location.origin}/portal/${tenant.slug}?tab=pppoe`
    : `/portal/${tenant.slug}?tab=pppoe`;

  const copyPortalLink = () => {
    navigator.clipboard.writeText(portalUrl);
    setCopiedLink(true);
    toast.success("PPPoE Renewal Portal URL copied!");
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <AppShell isSuperAdmin={context.data.isSuperAdmin} title="PPPoE Manager">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">PPPoE Manager</h1>
            <p className="text-sm text-muted-foreground">
              Manage PPPoE fiber/wireless subscribers, provision secrets, and manage customer renewals.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-9"
              onClick={copyPortalLink}
            >
              {copiedLink ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
              PPPoE Portal URL
            </Button>
            <Button
              className="gap-2"
              onClick={openAddModal}
            >
              <Plus className="size-4" /> Add PPPoE Customer
            </Button>
          </div>
        </div>

        {/* PPPoE Captive Portal Info Banner */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary mt-0.5">
                <Globe className="size-5" />
              </div>
              <div>
                <p className="font-semibold text-sm">Subscriber Self-Service & Renewal Portal</p>
                <p className="text-xs text-muted-foreground">
                  Expired PPPoE users can visit this link to enter their username/phone, pay via M-Pesa, and restore their connection instantly.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5 text-xs h-8"
                onClick={copyPortalLink}
              >
                {copiedLink ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                Copy Link
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-8"
                asChild
              >
                <a href={portalUrl} target="_blank" rel="noreferrer">
                  Open Portal <ExternalLink className="size-3.5" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="overview" className="gap-2">
              <Activity className="size-3.5" /> Overview
            </TabsTrigger>
            <TabsTrigger value="customers" className="gap-2">
              <Users className="size-3.5" /> Customers ({customers.data?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="online" className="gap-2">
              <Zap className="size-3.5" /> Online Users ({stats.data?.online || 0})
            </TabsTrigger>
            <TabsTrigger value="routers" className="gap-2">
              <Router className="size-3.5" /> Routers ({routerList.length})
            </TabsTrigger>
            <TabsTrigger value="pools" className="gap-2">
              <Layers className="size-3.5" /> IP Pools (16M+)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                title="Total PPPoE Customers"
                value={stats.data?.total?.toLocaleString()}
                icon={Users}
              />
              <StatCard
                title="Active PPPoE"
                value={stats.data?.active?.toLocaleString()}
                icon={ShieldCheck}
                color="text-emerald-500"
                bg="bg-emerald-500/10 border-emerald-500/20"
              />
              <StatCard
                title="Expired PPPoE"
                value={stats.data?.expired?.toLocaleString()}
                icon={ShieldAlert}
                color="text-rose-500"
                bg="bg-rose-500/10 border-rose-500/20"
              />
              <StatCard
                title="PPPoE Sessions Online"
                value={stats.data?.online?.toLocaleString()}
                icon={Activity}
                color="text-primary"
                bg="bg-primary/10 border-primary/20"
              />
              <StatCard
                title="Income Today"
                value={`KES ${stats.data?.incomeToday?.toLocaleString()}`}
                icon={Banknote}
                color="text-emerald-500"
                bg="bg-emerald-500/10 border-emerald-500/20"
              />
              <StatCard
                title="Income Month"
                value={`KES ${stats.data?.incomeMonth?.toLocaleString()}`}
                icon={CalendarDays}
                color="text-primary"
                bg="bg-primary/10 border-primary/20"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="bg-card/50">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base">Network Routers</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 gap-1"
                    onClick={() => navigate({ to: "/routers" })}
                  >
                    View All <ExternalLink className="size-3" />
                  </Button>
                </CardHeader>
                <CardContent>
                  {routerList.length === 0 ? (
                    <div className="text-center py-6 text-sm text-muted-foreground">
                      <Router className="size-8 mx-auto mb-2 opacity-40" />
                      <p>No routers connected yet.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 text-xs"
                        onClick={() => navigate({ to: "/routers" })}
                      >
                        Onboard MikroTik Router
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {routerList.map((r: RouterItem) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between border rounded-lg p-3 bg-background/40"
                        >
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <Router className="size-5 text-primary" />
                              <span
                                className={cn(
                                  "absolute -top-1 -right-1 size-2 rounded-full",
                                  r.status === "online" ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/50",
                                )}
                              />
                            </div>
                            <div>
                              <p className="font-semibold text-sm leading-none">{r.name}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {r.public_ip || "MikroTik Agent"} {r.ros_version ? `• v${r.ros_version}` : ""}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={r.status === "online" ? "success" : "secondary"}
                              className="text-[11px] capitalize"
                            >
                              {r.status}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => handleSync(r.id)}
                              disabled={isSyncing === r.id}
                              title="Sync PPPoE Users"
                            >
                              {isSyncing === r.id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="size-3.5" />
                              )}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-card/50">
                <CardHeader>
                  <CardTitle className="text-base">PPPoE Status Overview</CardTitle>
                  <CardDescription className="text-xs">
                    Automated secret provisioning & expiration state
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 rounded-lg border bg-background/30">
                      <p className="text-xs text-muted-foreground font-medium">Active Subscribers</p>
                      <p className="text-xl font-bold text-emerald-500 mt-1">{stats.data?.active || 0}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Secrets enabled on MikroTik</p>
                    </div>
                    <div className="p-3 rounded-lg border bg-background/30">
                      <p className="text-xs text-muted-foreground font-medium">Expired / Pending</p>
                      <p className="text-xl font-bold text-rose-500 mt-1">{stats.data?.expired || 0}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Redirected to payment</p>
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                    <p className="font-semibold text-foreground flex items-center gap-1.5">
                      <Zap className="size-3.5 text-primary" /> Instant Activation
                    </p>
                    <p>
                      When a PPPoE customer pays their renewal on M-Pesa, their account expiration date updates automatically and the router is instructed to activate the secret immediately.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* High-Capacity PPPoE IP Pool (16M+ Scale) Card */}
              <Card className="md:col-span-2 border-primary/20 bg-gradient-to-r from-primary/5 via-background to-background">
                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-2 gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary">
                      <Layers className="size-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-display font-bold flex items-center gap-2">
                        High-Capacity PPPoE IP Pool (16 Million+ Connections)
                        <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                          Carrier Grade Scale
                        </Badge>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Class A Subnet allocation enabling up to 16,711,676 active subscriber connections with zero IP exhaustion
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-8 gap-1.5"
                      onClick={copyPoolScript}
                    >
                      {copiedPoolScript ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                      Copy Script
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg border bg-background/60 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground font-medium">Active Subscribers Pool</span>
                        <Badge variant="success" className="text-[10px]">16.7M Hosts</Badge>
                      </div>
                      <p className="font-mono text-xs font-semibold text-foreground">10.0.0.2 - 10.255.255.254</p>
                      <p className="text-[11px] text-muted-foreground">Gateway: 10.0.0.1 (/32 point-to-point)</p>
                    </div>

                    <div className="p-3 rounded-lg border bg-background/60 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground font-medium">Expired Subscribers Pool</span>
                        <Badge variant="secondary" className="text-[10px]">1.05M Hosts</Badge>
                      </div>
                      <p className="font-mono text-xs font-semibold text-foreground">172.16.0.2 - 172.31.255.254</p>
                      <p className="text-[11px] text-muted-foreground">Walled-Garden Redirect Subnet</p>
                    </div>

                    <div className="p-3 rounded-lg border bg-background/60 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground font-medium">Firewall NAT</span>
                        <Badge variant="outline" className="text-[10px]">Masquerade</Badge>
                      </div>
                      <p className="font-mono text-xs font-semibold text-foreground">10.0.0.0/8 & 172.16.0.0/12</p>
                      <p className="text-[11px] text-muted-foreground">Protected 10.10.0.0/16 hotspot space</p>
                    </div>
                  </div>

                  {routerList.length > 0 && (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Target Router:</span>
                        <Select value={selectedPoolRouter} onValueChange={setSelectedPoolRouter}>
                          <SelectTrigger className="h-8 text-xs w-[200px]">
                            <SelectValue placeholder="Select router" />
                          </SelectTrigger>
                          <SelectContent>
                            {routerList.map((r: RouterItem) => (
                              <SelectItem key={r.id} value={r.id}>
                                {r.name} ({r.public_ip || "Agent"})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        size="sm"
                        className="h-8 text-xs gap-1.5 font-medium"
                        onClick={() => handleDeployPool(selectedPoolRouter)}
                        disabled={!selectedPoolRouter || isDeployingPool === selectedPoolRouter}
                      >
                        {isDeployingPool === selectedPoolRouter ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Zap className="size-3.5" />
                        )}
                        Deploy 16M+ Pool to Router
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="customers">
            <Card className="bg-card/50">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 space-y-0">
                <div className="relative w-full max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, username, or phone..."
                    className="pl-9 text-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  className="gap-2 shrink-0"
                  onClick={() => {
                    setEditingCustomer(null);
                    setGeneratedPassword("");
                    setIsModalOpen(true);
                  }}
                >
                  <Plus className="size-4" /> Add PPPoE Customer
                </Button>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left font-medium text-muted-foreground">
                        <th className="p-3">Customer</th>
                        <th className="p-3">PPPoE Username</th>
                        <th className="p-3">Package</th>
                        <th className="p-3">Router</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Expires</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {customers.isPending ? (
                        [...Array(5)].map((_, i) => (
                          <tr key={i}>
                            <td colSpan={7} className="p-3">
                              <Skeleton className="h-6 w-full" />
                            </td>
                          </tr>
                        ))
                      ) : filteredCustomers.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-muted-foreground">
                            {searchTerm ? "No customers found matching your search." : "No PPPoE customers yet. Click 'Add PPPoE Customer' above to create one."}
                          </td>
                        </tr>
                      ) : (
                        filteredCustomers.map((c: CustomerItem) => (
                          <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                            <td className="p-3">
                              <p className="font-semibold text-foreground">{c.full_name}</p>
                              <p className="text-xs text-muted-foreground">{c.phone}</p>
                            </td>
                            <td className="p-3 font-mono text-xs">
                              <code className="px-1.5 py-0.5 rounded bg-muted font-mono font-medium">
                                {c.username}
                              </code>
                            </td>
                            <td className="p-3">
                              {c.packages ? (
                                <div>
                                  <p className="font-medium text-xs">{c.packages.name}</p>
                                  <p className="text-[11px] text-muted-foreground">
                                    KES {c.packages.price_kes}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                            <td className="p-3 text-xs font-medium">{c.routers?.name || "Any Router"}</td>
                            <td className="p-3">
                              <Badge
                                variant={
                                  c.status === "active"
                                    ? "success"
                                    : c.status === "expired"
                                      ? "destructive"
                                      : "secondary"
                                }
                                className="text-[11px] capitalize"
                              >
                                {c.status}
                              </Badge>
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">
                              {c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "Never"}
                            </td>
                            <td className="p-3 text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-8">
                                    <MoreVertical className="size-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                  <DropdownMenuItem onClick={() => openEditModal(c)}>
                                    <Pencil className="mr-2 size-3.5" /> Edit Details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleResetPassword(c.id)}>
                                    <KeyRound className="mr-2 size-3.5" /> Reset Password
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className={
                                      c.status === "active" ? "text-destructive" : "text-emerald-600"
                                    }
                                    onClick={() => handleSuspend(c.id, c.status)}
                                  >
                                    {c.status === "active" ? (
                                      <>
                                        <Ban className="mr-2 size-3.5" /> Suspend Access
                                      </>
                                    ) : (
                                      <>
                                        <ShieldCheck className="mr-2 size-3.5" /> Reactivate
                                      </>
                                    )}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="online">
            <Card className="bg-card/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-base font-display font-bold">
                    Active PPPoE Sessions
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Real-time active tunnel connections reported from MikroTik
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => sessions.refetch()}
                  disabled={sessions.isPending}
                  className="gap-1.5 text-xs h-8"
                >
                  {sessions.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  Refresh
                </Button>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left font-medium text-muted-foreground">
                        <th className="p-3">Customer</th>
                        <th className="p-3">Username</th>
                        <th className="p-3">IP Address</th>
                        <th className="p-3">Connected At</th>
                        <th className="p-3">Uptime</th>
                        <th className="p-3">Traffic (Up/Down)</th>
                        <th className="p-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {sessions.isPending ? (
                        [...Array(3)].map((_, i) => (
                          <tr key={i}>
                            <td colSpan={7} className="p-3">
                              <Skeleton className="h-6 w-full" />
                            </td>
                          </tr>
                        ))
                      ) : (sessions.data as SessionItem[] | undefined)?.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-12 text-center text-muted-foreground">
                            <Zap className="size-8 mx-auto mb-2 text-muted-foreground/30" />
                            No active PPPoE sessions online right now.
                          </td>
                        </tr>
                      ) : (
                        (sessions.data as SessionItem[] | undefined)?.map((s) => (
                          <tr key={s.id} className="hover:bg-muted/30">
                            <td className="p-3">
                              <p className="font-semibold text-foreground">{s.customers?.full_name || "Unknown"}</p>
                              <p className="text-xs text-muted-foreground">
                                {s.customers?.phone || "—"}
                              </p>
                            </td>
                            <td className="p-3 font-mono text-xs">{s.username}</td>
                            <td className="p-3 font-mono text-xs text-primary">{s.ip_address}</td>
                            <td className="p-3 text-xs">
                              {s.connected_at ? new Date(s.connected_at).toLocaleString() : "—"}
                            </td>
                            <td className="p-3 text-xs">{s.uptime || "—"}</td>
                            <td className="p-3 text-[10px]">
                              <span className="text-rose-500 font-mono">
                                ↑ {s.bytes_in_formatted || "0 B"}
                              </span>
                              <br />
                              <span className="text-emerald-500 font-mono">
                                ↓ {s.bytes_out_formatted || "0 B"}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <Badge variant="success" className="text-[10px]">
                                Online
                              </Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="routers">
            <Card className="bg-card/50">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-display font-bold">
                    Router Management & PPPoE Sync
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Connected MikroTik routers handling PPPoE client tunnels
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1.5"
                  onClick={() => navigate({ to: "/routers" })}
                >
                  <Plus className="size-3.5" /> Add Router
                </Button>
              </CardHeader>
              <CardContent>
                {routerList.length === 0 ? (
                  <div className="text-center py-12 border rounded-lg bg-background/30">
                    <Router className="size-10 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="font-semibold text-foreground">No Routers Configured</p>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 mb-4">
                      Connect your MikroTik router to enable automated PPPoE client creation, rate limiting, and session disconnection.
                    </p>
                    <Button onClick={() => navigate({ to: "/routers" })}>
                      Add MikroTik Router
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {routerList.map((r: RouterItem) => (
                      <Card key={r.id} className="bg-background/60 border shadow-sm">
                        <CardHeader className="p-4 pb-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                                <Router className="size-4" />
                              </div>
                              <div>
                                <h3 className="font-bold text-sm leading-none">{r.name}</h3>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  {r.public_ip || "MikroTik Agent"}
                                </p>
                              </div>
                            </div>
                            <Badge
                              variant={r.status === "online" ? "success" : "secondary"}
                              className="text-[10px] capitalize"
                            >
                              {r.status}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-2">
                          <div className="rounded-md bg-muted/30 p-2 text-xs space-y-1 mb-3">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">PPPoE Sessions:</span>
                              <span className="font-semibold text-foreground">{r.active_pppoe_users ?? 0}</span>
                            </div>
                            {r.ros_version && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">RouterOS:</span>
                                <span className="font-medium text-foreground">v{r.ros_version}</span>
                              </div>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => navigate({ to: `/routers` })}
                            >
                              Manage
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              className="h-8 text-xs gap-1.5"
                              onClick={() => handleSync(r.id)}
                              disabled={isSyncing === r.id}
                            >
                              {isSyncing === r.id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="size-3.5" />
                              )}
                              Sync Secrets
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pools" className="space-y-6">
            {/* Header / Intro */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-xl font-display font-bold">Carrier-Scale IP Pool Architecture</h2>
                <p className="text-xs text-muted-foreground">
                  Unified high-capacity provisioning for 65K+ Hotspot guest clients and 16.7M+ PPPoE fiber/wireless subscribers.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-8"
                  onClick={() => copyScriptByMode(poolScriptMode)}
                >
                  {(poolScriptMode === "hotspot" ? copiedHotspotScript : copiedPoolScript) ? (
                    <Check className="size-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  Copy {poolScriptMode.toUpperCase()} Commands
                </Button>
              </div>
            </div>

            {/* Spec Cards Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {/* Hotspot Card */}
              <Card className="border-sky-500/30 bg-sky-500/5">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px] bg-sky-500/10 text-sky-600 border-sky-500/30">
                      Hotspot Guest WiFi
                    </Badge>
                    <Wifi className="size-4 text-sky-500" />
                  </div>
                  <CardTitle className="text-lg font-bold mt-2">65,525 Devices</CardTitle>
                  <CardDescription className="text-xs">Class B Subnet (10.10.0.0/16)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-xs pt-0">
                  <div className="rounded bg-background/80 p-2.5 space-y-1 font-mono text-[11px] border">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pool Name:</span>
                      <span className="font-semibold text-foreground">hs-pool</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pool Range:</span>
                      <span className="font-semibold text-sky-600">10.10.0.10 - 10.10.255.254</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Gateway:</span>
                      <span className="font-semibold text-foreground">10.10.0.1/16</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">DHCP Lease:</span>
                      <span className="font-semibold text-foreground">30m (Fast Recycle)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Isolation:</span>
                      <span className="text-emerald-500 font-semibold">Horizon 1 (Anti-Storm)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">NAT:</span>
                      <span className="text-foreground">10.10.0.0/16 masquerade</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* PPPoE Active Card */}
              <Card className="border-emerald-500/30 bg-emerald-500/5">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="success" className="text-[10px]">Active PPPoE</Badge>
                    <Network className="size-4 text-emerald-500" />
                  </div>
                  <CardTitle className="text-lg font-bold mt-2">16,711,676 IPs</CardTitle>
                  <CardDescription className="text-xs">Class A Subnet (10.0.0.0/8)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-xs pt-0">
                  <div className="rounded bg-background/80 p-2.5 space-y-1 font-mono text-[11px] border">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pool Name:</span>
                      <span className="font-semibold text-foreground">PPPOE ACTIVE POOL</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Block A:</span>
                      <span className="font-semibold text-emerald-600">10.0.0.2 - 10.9.255.255</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Block B:</span>
                      <span className="font-semibold text-emerald-600">10.11.0.1 - 10.255.255.254</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Gateway:</span>
                      <span className="font-semibold text-foreground">10.0.0.1</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Addressing:</span>
                      <span className="font-semibold text-emerald-600">/32 Point-to-Point</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Hotspot Safe:</span>
                      <span className="text-sky-500 font-semibold">10.10.0.0/16 skipped</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* PPPoE Expired Card */}
              <Card className="border-rose-500/30 bg-rose-500/5">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="destructive" className="text-[10px]">Expired PPPoE</Badge>
                    <ShieldAlert className="size-4 text-rose-500" />
                  </div>
                  <CardTitle className="text-lg font-bold mt-2">1,048,574 IPs</CardTitle>
                  <CardDescription className="text-xs">Class B Subnet (172.16.0.0/12)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-xs pt-0">
                  <div className="rounded bg-background/80 p-2.5 space-y-1 font-mono text-[11px] border">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pool Name:</span>
                      <span className="font-semibold text-foreground">expired_pppoe_pool</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ranges:</span>
                      <span className="font-semibold text-rose-600">172.16.0.2 - 172.31.255.254</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Gateway:</span>
                      <span className="font-semibold text-foreground">172.16.0.1</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Action:</span>
                      <span className="font-semibold text-foreground">Walled Garden Portal</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">M-Pesa:</span>
                      <span className="text-emerald-500 font-semibold">Always Allowed</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">NAT:</span>
                      <span className="text-foreground">172.16.0.0/12 masquerade</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Total Carrier Scale & Zero Storms Card */}
              <Card className="border-primary/30 bg-primary/5">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                      Total Coexistence
                    </Badge>
                    <Database className="size-4 text-primary" />
                  </div>
                  <CardTitle className="text-lg font-bold mt-2">17.8 Million+</CardTitle>
                  <CardDescription className="text-xs">Hotspot + PPPoE Combined</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-xs pt-0">
                  <div className="rounded bg-background/80 p-2.5 space-y-1 font-mono text-[11px] border">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Hotspot Cap:</span>
                      <span className="font-semibold text-sky-500">65,525 Hosts</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Active PPPoE:</span>
                      <span className="font-semibold text-emerald-500">16,711,676 Hosts</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Expired PPPoE:</span>
                      <span className="font-semibold text-rose-500">1,048,574 Hosts</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subnet Clash:</span>
                      <span className="font-semibold text-emerald-600">0% (100% Segregated)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">DNS Forward:</span>
                      <span className="font-semibold text-foreground">8.8.8.8, 1.1.1.1</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">RouterOS:</span>
                      <span className="font-semibold text-foreground">v6.x & v7.x Ready</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Architecture Explainer Card */}
            <Card className="border-border bg-card/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-display font-bold flex items-center gap-2">
                  <Cpu className="size-4 text-primary" />
                  Network Topology: Why Hotspot is /16 (65K) and PPPoE is /8 (16.7M)
                </CardTitle>
                <CardDescription className="text-xs">
                  Engineering justification behind subnet sizing, broadcast isolation, and zero-conflict IP routing
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-xs text-muted-foreground">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg border bg-background/50 space-y-1.5">
                    <div className="flex items-center gap-1.5 font-semibold text-foreground text-sm">
                      <Wifi className="size-4 text-sky-500" />
                      Hotspot Layer-2 Broadcast Boundary (10.10.0.0/16)
                    </div>
                    <p>
                      Guest Hotspots operate over Ethernet and Wi-Fi where broadcast packets (ARP, DHCP discoveries, mDNS) are flooded to all wireless radios. Placing a full <code className="font-mono text-foreground">/8</code> on a wireless bridge causes severe <strong>broadcast storms</strong> that overwhelm access point CPUs and degrade radio airtime.
                    </p>
                    <p>
                      A <code className="font-mono text-foreground">/16</code> network provides an immense capacity of <strong>65,525 simultaneous guest devices</strong> with a <strong>30-minute DHCP lease</strong> for rapid recycling, while keeping broadcast domain bounds strictly managed.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg border bg-background/50 space-y-1.5">
                    <div className="flex items-center gap-1.5 font-semibold text-foreground text-sm">
                      <Layers className="size-4 text-emerald-500" />
                      PPPoE Layer-3 Point-to-Point Virtual Tunnels (10.0.0.0/8)
                    </div>
                    <p>
                      PPPoE encapsulates subscriber traffic into virtual point-to-point tunnels with dedicated <code className="font-mono text-foreground">/32</code> host routes. Because no Layer-2 broadcast packet can leak across separate PPP interfaces, there is <strong>zero broadcast storm risk</strong> regardless of subnet size.
                    </p>
                    <p>
                      The carrier pool spans <strong>16,711,676 active subscriber addresses</strong> while systematically omitting the <code className="font-mono text-foreground">10.10.0.0/16</code> range, guaranteeing that Hotspot and PPPoE run harmoniously on the same MikroTik router.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Router Deployment Card */}
            <Card className="bg-card/50">
              <CardHeader>
                <CardTitle className="text-base font-display font-bold flex items-center gap-2">
                  <Server className="size-4 text-primary" />
                  Deploy High-Capacity IP Pools to MikroTik Router
                </CardTitle>
                <CardDescription className="text-xs">
                  Provisions IP pools, DHCP networks, PPP profiles, and firewall NAT rules directly via API or sync queue.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {routerList.length === 0 ? (
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    <p>No routers connected yet. Onboard a MikroTik router first to deploy high-capacity pools.</p>
                  </div>
                ) : (
                  <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 p-4 rounded-lg border bg-background/40">
                    <div className="space-y-1">
                      <p className="font-semibold text-sm">Select Target Router</p>
                      <p className="text-xs text-muted-foreground">
                        Pool will be deployed to <code className="text-xs font-mono">/ip pool</code>, <code className="text-xs font-mono">/ip dhcp-server</code>, <code className="text-xs font-mono">/ppp profile</code>, and <code className="text-xs font-mono">/ip firewall nat</code>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Select value={selectedPoolRouter} onValueChange={setSelectedPoolRouter}>
                        <SelectTrigger className="h-9 text-xs w-[200px]">
                          <SelectValue placeholder="Choose router" />
                        </SelectTrigger>
                        <SelectContent>
                          {routerList.map((r: RouterItem) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name} ({r.public_ip || "Agent"})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 text-xs gap-1.5 font-medium border-sky-500/30 hover:bg-sky-500/10 text-sky-600 dark:text-sky-400"
                        onClick={() => handleDeployHotspotPool(selectedPoolRouter)}
                        disabled={!selectedPoolRouter || isDeployingHotspotPool === selectedPoolRouter}
                      >
                        {isDeployingHotspotPool === selectedPoolRouter ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Wifi className="size-3.5" />
                        )}
                        Deploy 65K+ Hotspot
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 text-xs gap-1.5 font-medium border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        onClick={() => handleDeployPool(selectedPoolRouter)}
                        disabled={!selectedPoolRouter || isDeployingPool === selectedPoolRouter}
                      >
                        {isDeployingPool === selectedPoolRouter ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Network className="size-3.5" />
                        )}
                        Deploy 16M+ PPPoE
                      </Button>

                      <Button
                        size="sm"
                        className="h-9 text-xs gap-1.5 font-medium bg-primary text-primary-foreground"
                        onClick={() => handleDeployBothPools(selectedPoolRouter)}
                        disabled={
                          !selectedPoolRouter ||
                          isDeployingPool === selectedPoolRouter ||
                          isDeployingHotspotPool === selectedPoolRouter
                        }
                      >
                        {isDeployingPool === selectedPoolRouter || isDeployingHotspotPool === selectedPoolRouter ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Zap className="size-3.5" />
                        )}
                        Deploy Both (Full Carrier Stack)
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Terminal Script & Manual Configuration */}
            <Card className="bg-card/50">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 gap-3">
                <div>
                  <CardTitle className="text-base font-display font-bold flex items-center gap-2">
                    <Terminal className="size-4 text-primary" />
                    MikroTik Terminal / WinBox Commands
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Paste these commands directly into WinBox Terminal or SSH session if configuring manually
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg border bg-muted/30 p-0.5 text-xs">
                    <button
                      type="button"
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                        poolScriptMode === "hotspot" ? "bg-background shadow-xs text-foreground" : "text-muted-foreground"
                      }`}
                      onClick={() => setPoolScriptMode("hotspot")}
                    >
                      Hotspot (65K+)
                    </button>
                    <button
                      type="button"
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                        poolScriptMode === "pppoe" ? "bg-background shadow-xs text-foreground" : "text-muted-foreground"
                      }`}
                      onClick={() => setPoolScriptMode("pppoe")}
                    >
                      PPPoE (16.7M+)
                    </button>
                    <button
                      type="button"
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                        poolScriptMode === "dual" ? "bg-background shadow-xs text-foreground" : "text-muted-foreground"
                      }`}
                      onClick={() => setPoolScriptMode("dual")}
                    >
                      Dual Carrier Stack
                    </button>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 gap-1.5"
                    onClick={() => copyScriptByMode(poolScriptMode)}
                  >
                    {(poolScriptMode === "hotspot" ? copiedHotspotScript : copiedPoolScript) ? (
                      <Check className="size-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    Copy Commands
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative rounded-lg bg-zinc-950 p-4 font-mono text-xs text-emerald-400 overflow-x-auto border border-zinc-800 max-h-96">
                  <pre className="whitespace-pre">
                    {poolScriptMode === "hotspot"
                      ? hotspotTerminalScript
                      : poolScriptMode === "pppoe"
                        ? poolTerminalScript
                        : dualTerminalScript}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal: Add or Edit PPPoE Customer */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-w-md">
            <form onSubmit={handleSave}>
              <DialogHeader>
                <DialogTitle>
                  {editingCustomer ? "Edit PPPoE Customer" : "Add New PPPoE Customer"}
                </DialogTitle>
                <DialogDescription>
                  Enter customer credentials. The secret and speed profiles are instantly sent to your MikroTik router.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input
                    id="full_name"
                    name="full_name"
                    defaultValue={editingCustomer?.full_name || ""}
                    required
                    placeholder="e.g. John Doe"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone Number (M-Pesa)</Label>
                  <Input
                    id="phone"
                    name="phone"
                    defaultValue={editingCustomer?.phone || ""}
                    required
                    placeholder="0712345678"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="username">PPPoE Username</Label>
                    <Input
                      id="username"
                      name="username"
                      defaultValue={editingCustomer?.username || ""}
                      required
                      placeholder="john.doe"
                    />
                  </div>
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      <button
                        type="button"
                        onClick={handleGeneratePassword}
                        className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                      >
                        <Dices className="size-3" /> Auto
                      </button>
                    </div>
                    <Input
                      id="password"
                      name="password"
                      value={generatedPassword}
                      onChange={(e) => setGeneratedPassword(e.target.value)}
                      placeholder={editingCustomer ? "Leave blank to keep" : "••••••••"}
                      required={!editingCustomer && !generatedPassword}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="package_id">Assigned PPPoE Package</Label>
                  <Select name="package_id" value={selectedPackage} onValueChange={setSelectedPackage}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a PPPoE package" />
                    </SelectTrigger>
                    <SelectContent>
                      {pppPackages.length === 0 ? (
                        <SelectItem value="none" disabled>
                          No PPPoE packages created yet (Create one in Packages)
                        </SelectItem>
                      ) : (
                        pppPackages.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} — KES {p.price_kes}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="router_id">Target Router</Label>
                  <Select
                    name="router_id"
                    value={selectedRouter}
                    onValueChange={setSelectedRouter}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a router" />
                    </SelectTrigger>
                    <SelectContent>
                      {routerList.length === 0 ? (
                        <SelectItem value="none" disabled>
                          No routers found (Connect one in Routers)
                        </SelectItem>
                      ) : (
                        routerList.map((r: RouterItem) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name} ({r.status})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving} className="gap-2">
                  {isSaving && <Loader2 className="size-4 animate-spin" />}
                  {editingCustomer ? "Update Customer" : "Create & Push to Router"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}

type StatCardProps = {
  title: string;
  value?: string | number | null;
  icon: React.ComponentType<{ className?: string }>;
  color?: string;
  bg?: string;
};

function StatCard({ title, value, icon: Icon, color, bg }: StatCardProps) {
  return (
    <Card className={cn("shadow-none border-border/50", bg || "bg-card/50")}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-80">
              {title}
            </p>
            <p className={cn("mt-1 text-2xl font-bold font-display tracking-tight", color)}>
              {value === undefined || value === null ? "—" : value}
            </p>
          </div>
          <div className="rounded-full bg-white/10 p-2">
            <Icon className="size-5 text-current opacity-60" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
