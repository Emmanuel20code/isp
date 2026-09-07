import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import {
  listCustomers,
  createCustomer,
  setCustomerStatus,
  deleteCustomer,
  deleteCustomers,
  renewCustomer,
  disconnectCustomer,
} from "@/lib/customers.functions";
import { getMyContext } from "@/lib/tenancy.functions";
import { formatPackageDuration } from "@/lib/billing-helpers";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Loader2,
  Trash2,
  Search,
  Wifi,
  Radio,
  Clock,
  Zap,
  PowerOff,
  RefreshCw,
  Plus,
  Copy,
  Check,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  Users,
  Ticket,
  ArrowUpDown,
  Filter,
  MessageSquare,
  PhoneCall,
  Activity,
  ShieldAlert,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({
    meta: [
      { title: "Online Customers & Sessions · Wifi Billing" },
      {
        name: "description",
        content: "Real-time visibility into currently online customers, active sessions, Wi-Fi packages, and router connections.",
      },
      { property: "og:title", content: "Online Customers & Sessions · Wifi Billing" },
      {
        property: "og:description",
        content: "Track which users are currently online, manage session renewals, and monitor hotspot clients.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CustomersPage,
});

export function CustomersPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listCustomers);
  const fetchContext = useServerFn(getMyContext);
  const add = useServerFn(createCustomer);
  const setStatus = useServerFn(setCustomerStatus);
  const remove = useServerFn(deleteCustomer);
  const bulkDeleteFn = useServerFn(deleteCustomers);
  const renewFn = useServerFn(renewCustomer);
  const disconnectFn = useServerFn(disconnectCustomer);

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Read initial filter from URL if present
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const f = p.get("filter");
      if (f) return f;
    }
    return "online";
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [routerFilter, setRouterFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"online-first" | "expiring-soon" | "recent" | "name">("online-first");

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Renewal Modal State
  const [renewModalCustomer, setRenewModalCustomer] = useState<any | null>(null);
  const [renewSelectedPkgId, setRenewSelectedPkgId] = useState("");
  const [renewCustomHours, setRenewCustomHours] = useState<number | "">("");

  // Disconnect Confirmation State
  const [disconnectModalCustomer, setDisconnectModalCustomer] = useState<any | null>(null);
  const [disconnectExpireCheck, setDisconnectExpireCheck] = useState(false);

  // Add Customer Modal State
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    kind: "hotspot" as const,
    packageId: "",
    routerId: "",
    username: "",
  });

  const ctx = useQuery({ queryKey: ["my-context"], queryFn: () => fetchContext() });

  const { data, isPending, isFetching, refetch } = useQuery({
    queryKey: ["customers"],
    queryFn: () => fetchList(),
    refetchInterval: autoRefresh ? 10000 : false, // 10s live session polling
  });

  const createMutation = useMutation({
    mutationFn: () =>
      add({
        data: {
          fullName: form.fullName,
          phone: form.phone,
          kind: form.kind,
          packageId: form.packageId || null,
          routerId: form.routerId || null,
          username: form.username || undefined,
        },
      }),
    onSuccess: async () => {
      setForm({ fullName: "", phone: "", kind: "hotspot", packageId: "", routerId: "", username: "" });
      setIsAddCustomerOpen(false);
      toast.success("Customer added and session initialized");
      await qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add customer"),
  });

  const statusMutation = useMutation({
    mutationFn: (v: { id: string; status: "active" | "expired" | "disabled" }) =>
      setStatus({ data: v }),
    onSuccess: () => {
      toast.success("Customer status updated");
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update status"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: async () => {
      toast.success("Customer removed");
      await qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove"),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => bulkDeleteFn({ data: { ids } }),
    onSuccess: async () => {
      toast.success("Selected customers removed");
      setSelectedIds([]);
      await qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not remove selected customers"),
  });

  const renewMutation = useMutation({
    mutationFn: (payload: { id: string; packageId?: string; durationHours?: number }) =>
      renewFn({ data: payload }),
    onSuccess: async () => {
      toast.success("Customer session renewed successfully!");
      setRenewModalCustomer(null);
      await qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to renew session"),
  });

  const disconnectMutation = useMutation({
    mutationFn: (payload: { id: string; markExpired?: boolean }) =>
      disconnectFn({ data: payload }),
    onSuccess: async () => {
      toast.success("Disconnect command dispatched to router");
      setDisconnectModalCustomer(null);
      await qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not disconnect customer"),
  });

  const handleCopy = (text: string, label: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedText(text);
      toast.success(`${label} copied to clipboard`);
      setTimeout(() => setCopiedText(null), 2000);
    }
  };

  const stats = data?.stats ?? {
    totalCustomers: 0,
    onlineCustomersCount: 0,
    onlineVouchersCount: 0,
    totalOnlineNow: 0,
    activePlansCount: 0,
    expiredCount: 0,
    disabledCount: 0,
    expiringSoonCount: 0,
  };

  // Filter and sort customers
  const filteredCustomers = useMemo(() => {
    let list = data?.customers ?? [];

    // Tab filter
    if (activeTab === "online") {
      list = list.filter((c: any) => c.is_online);
    } else if (activeTab === "active") {
      list = list.filter((c: any) => c.status === "active");
    } else if (activeTab === "expiring_soon") {
      list = list.filter((c: any) => c.is_online && c.is_expiring_soon);
    } else if (activeTab === "expired") {
      list = list.filter((c: any) => c.status === "expired" || (!c.is_online && c.status === "active"));
    } else if (activeTab === "disabled") {
      list = list.filter((c: any) => c.status === "disabled");
    }

    // Router filter
    if (routerFilter !== "all") {
      list = list.filter((c: any) => c.router_id === routerFilter);
    }

    // Search term
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter((c: any) => {
        const name = (c.full_name || "").toLowerCase();
        const phone = (c.phone || "").toLowerCase();
        const user = (c.username || "").toLowerCase();
        const mac = (c.mac_address || "").toLowerCase();
        const ip = (c.live_telemetry?.ip || "").toLowerCase();
        const pkg = (c.packages?.name || "").toLowerCase();
        return (
          name.includes(q) ||
          phone.includes(q) ||
          user.includes(q) ||
          mac.includes(q) ||
          ip.includes(q) ||
          pkg.includes(q)
        );
      });
    }

    // Sorting
    return [...list].sort((a: any, b: any) => {
      if (sortBy === "online-first") {
        if (a.is_online !== b.is_online) return a.is_online ? -1 : 1;
        if (a.time_left_seconds !== null && b.time_left_seconds !== null) {
          return a.time_left_seconds - b.time_left_seconds;
        }
        return 0;
      }
      if (sortBy === "expiring-soon") {
        const aSec = a.time_left_seconds ?? 999999999;
        const bSec = b.time_left_seconds ?? 999999999;
        return aSec - bSec;
      }
      if (sortBy === "name") {
        return (a.full_name || "").localeCompare(b.full_name || "");
      }
      // "recent"
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [data?.customers, activeTab, routerFilter, searchTerm, sortBy]);

  // Filter online vouchers for the vouchers tab
  const filteredOnlineVouchers = useMemo(() => {
    let list = data?.onlineVouchers ?? [];
    if (routerFilter !== "all") {
      list = list.filter((v: any) => v.router_id === routerFilter);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter((v: any) => {
        const code = (v.code || "").toLowerCase();
        const phone = (v.phone || "").toLowerCase();
        const pkg = (v.packages?.name || "").toLowerCase();
        const ip = (v.live_telemetry?.ip || "").toLowerCase();
        return code.includes(q) || phone.includes(q) || pkg.includes(q) || ip.includes(q);
      });
    }
    return list;
  }, [data?.onlineVouchers, routerFilter, searchTerm]);

  const allSelected =
    filteredCustomers.length > 0 && selectedIds.length === filteredCustomers.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredCustomers.map((c: any) => c.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  return (
    <AppShell isSuperAdmin={ctx.data?.isSuperAdmin ?? false}>
      {/* Page Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Hotspot Customers & Live Sessions
            </h1>
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor which users are currently online in real time, renew subscriptions, and kick/disconnect devices.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`gap-1.5 text-xs ${autoRefresh ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5" : ""}`}
            title="Auto-refreshes every 10 seconds with live router sessions"
          >
            <Activity className={`size-3.5 ${autoRefresh ? "animate-pulse text-emerald-500" : ""}`} />
            {autoRefresh ? "Auto-Refresh: ON (10s)" : "Auto-Refresh: Paused"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin text-primary" : ""}`} />
            Sync Now
          </Button>

          <Button
            size="sm"
            onClick={() => setIsAddCustomerOpen(true)}
            className="gap-1.5 text-xs font-semibold shadow-sm"
          >
            <Plus className="size-3.5" />
            Add Subscriber
          </Button>
        </div>
      </div>

      {/* Top Telemetry Metric Cards */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Currently Online Card (Highlighted) */}
        <Card
          onClick={() => setActiveTab("online")}
          className={`cursor-pointer transition-all hover:shadow-md ${
            activeTab === "online"
              ? "border-emerald-500 bg-emerald-500/10 dark:bg-emerald-950/30 ring-1 ring-emerald-500/50"
              : "hover:border-emerald-500/50"
          }`}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                🟢 Currently Online Now
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-black tracking-tight text-emerald-800 dark:text-emerald-200">
                  {isPending ? "..." : stats.totalOnlineNow}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  ({stats.onlineCustomersCount} subs + {stats.onlineVouchersCount} vouchers)
                </span>
              </div>
            </div>
            <div className="rounded-xl bg-emerald-500/20 p-2.5 text-emerald-600 dark:text-emerald-400">
              <Wifi className="size-5" />
            </div>
          </CardContent>
        </Card>

        {/* Registered Subscribers */}
        <Card
          onClick={() => setActiveTab("all")}
          className={`cursor-pointer transition-all hover:shadow-md ${
            activeTab === "all" ? "border-primary bg-primary/5 ring-1 ring-primary/40" : ""
          }`}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Hotspot Subscribers</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-foreground">
                  {isPending ? "..." : stats.totalCustomers}
                </span>
                <span className="text-[11px] text-muted-foreground font-normal">
                  ({stats.activePlansCount} active plans)
                </span>
              </div>
            </div>
            <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
              <Users className="size-5" />
            </div>
          </CardContent>
        </Card>

        {/* Active Voucher Guests */}
        <Card
          onClick={() => setActiveTab("vouchers_online")}
          className={`cursor-pointer transition-all hover:shadow-md ${
            activeTab === "vouchers_online"
              ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/50"
              : ""
          }`}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                🎟️ Active Voucher Guests
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-amber-800 dark:text-amber-200">
                  {isPending ? "..." : stats.onlineVouchersCount}
                </span>
                <span className="text-[11px] text-muted-foreground">live guest sessions</span>
              </div>
            </div>
            <div className="rounded-xl bg-amber-500/20 p-2.5 text-amber-600 dark:text-amber-400">
              <Ticket className="size-5" />
            </div>
          </CardContent>
        </Card>

        {/* Expiring Soon */}
        <Card
          onClick={() => setActiveTab("expiring_soon")}
          className={`cursor-pointer transition-all hover:shadow-md ${
            activeTab === "expiring_soon"
              ? "border-rose-500 bg-rose-500/10 ring-1 ring-rose-500/50"
              : ""
          }`}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-rose-700 dark:text-rose-400">
                ⏳ Expiring Soon (&lt;1h)
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-rose-800 dark:text-rose-200">
                  {isPending ? "..." : stats.expiringSoonCount}
                </span>
                <span className="text-[11px] text-muted-foreground">needs renewal soon</span>
              </div>
            </div>
            <div className="rounded-xl bg-rose-500/20 p-2.5 text-rose-600 dark:text-rose-400">
              <Clock className="size-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Filter Tabs and Action Toolbar */}
      <div className="mt-6 space-y-4">
        {/* Navigation Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 border-b pb-2">
          <Button
            variant={activeTab === "online" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("online")}
            className={`h-8 gap-1.5 text-xs font-semibold rounded-full px-3 ${
              activeTab === "online" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""
            }`}
          >
            <span className="size-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
            🟢 Online Now ({stats.onlineCustomersCount})
          </Button>

          <Button
            variant={activeTab === "all" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("all")}
            className="h-8 gap-1 text-xs rounded-full px-3"
          >
            All Subscribers ({stats.totalCustomers})
          </Button>

          <Button
            variant={activeTab === "active" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("active")}
            className="h-8 gap-1 text-xs rounded-full px-3"
          >
            Active Plans ({stats.activePlansCount})
          </Button>

          <Button
            variant={activeTab === "vouchers_online" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("vouchers_online")}
            className={`h-8 gap-1.5 text-xs rounded-full px-3 ${
              activeTab === "vouchers_online" ? "bg-amber-600 hover:bg-amber-700 text-white font-semibold" : ""
            }`}
          >
            🎟️ Voucher Guests Online ({stats.onlineVouchersCount})
          </Button>

          <Button
            variant={activeTab === "expiring_soon" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("expiring_soon")}
            className="h-8 gap-1 text-xs rounded-full px-3 text-rose-600 dark:text-rose-400"
          >
            ⏳ Expiring Soon ({stats.expiringSoonCount})
          </Button>

          <Button
            variant={activeTab === "expired" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("expired")}
            className="h-8 gap-1 text-xs rounded-full px-3 text-muted-foreground"
          >
            Expired ({stats.expiredCount})
          </Button>

          <Button
            variant={activeTab === "disabled" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("disabled")}
            className="h-8 gap-1 text-xs rounded-full px-3 text-muted-foreground"
          >
            Disabled ({stats.disabledCount})
          </Button>
        </div>

        {/* Filter / Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-xs">
          <div className="flex flex-1 flex-wrap items-center gap-2.5 min-w-[280px]">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone, username, IP, MAC address..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            {/* Router Filter */}
            <select
              value={routerFilter}
              onChange={(e) => setRouterFilter(e.target.value)}
              aria-label="Filter by router"
              className="h-9 rounded-md border border-input bg-background px-2.5 text-xs font-medium focus:ring-1 focus:ring-primary"
            >
              <option value="all">🌐 All Routers (MikroTik)</option>
              {data?.routers.map((r: any) => (
                <option key={r.id} value={r.id}>
                  📡 {r.name}
                </option>
              ))}
            </select>

            {/* Sort Dropdown */}
            {activeTab !== "vouchers_online" && (
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                aria-label="Sort customers"
                className="h-9 rounded-md border border-input bg-background px-2.5 text-xs font-medium focus:ring-1 focus:ring-primary"
              >
                <option value="online-first">🟢 Online First</option>
                <option value="expiring-soon">⏳ Expiring Soon First</option>
                <option value="recent">⏱️ Recently Added</option>
                <option value="name">🔤 Name (A-Z)</option>
              </select>
            )}
          </div>

          {/* Bulk Actions */}
          {selectedIds.length > 0 && activeTab !== "vouchers_online" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">
                {selectedIds.length} selected
              </span>
              <Button
                variant="destructive"
                size="sm"
                className="h-8 gap-1 text-xs"
                disabled={bulkDeleteMutation.isPending}
                onClick={() => {
                  if (confirm(`Delete ${selectedIds.length} selected customer(s)?`)) {
                    bulkDeleteMutation.mutate(selectedIds);
                  }
                }}
              >
                {bulkDeleteMutation.isPending && <Loader2 className="size-3 animate-spin" />}
                <Trash2 className="size-3.5" />
                Delete Selected
              </Button>
            </div>
          )}
        </div>

        {/* Content View: Voucher Guests Online */}
        {activeTab === "vouchers_online" ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Ticket className="size-4 text-amber-600" />
                These are guest users who logged in using a voucher PIN code on the captive portal and are currently online.
              </span>
              <Badge variant="outline" className="bg-amber-500/20 text-amber-800 dark:text-amber-200 border-none font-bold">
                {filteredOnlineVouchers.length} Online Guests
              </Badge>
            </div>

            {isPending ? (
              <div className="space-y-2">
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
              </div>
            ) : filteredOnlineVouchers.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Ticket className="mx-auto size-10 text-muted-foreground/40 mb-2" />
                  <p className="font-semibold text-foreground">No Voucher Guests Currently Online</p>
                  <p className="text-xs mt-1">When users purchase or activate vouchers on your hotspot portal, they will appear here in real time.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {filteredOnlineVouchers.map((v: any) => (
                  <Card key={v.id} className="border-amber-500/30 bg-card hover:border-amber-500 transition-all shadow-xs">
                    <CardContent className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="rounded-xl bg-amber-500/15 p-2.5 text-amber-600 dark:text-amber-400 mt-0.5">
                          <Ticket className="size-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm tracking-wider text-foreground">
                              {v.code}
                            </span>
                            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-bold">
                              🟢 Online Now
                            </Badge>
                            <Badge variant="outline" className="text-[10px] font-medium">
                              ⏳ {v.time_left_formatted}
                            </Badge>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {v.phone && <span>📱 {v.phone}</span>}
                            <span>📦 {v.packages?.name || "Standard Hotspot"}</span>
                            <span>📡 Router: {v.routers?.name || "Default"}</span>
                            {v.live_telemetry?.ip && (
                              <span className="font-mono text-[11px] bg-muted/60 px-1.5 py-0.5 rounded">
                                IP: {v.live_telemetry.ip}
                              </span>
                            )}
                            {v.live_telemetry?.uptime && (
                              <span>⏱️ Uptime: {v.live_telemetry.uptime}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end md:self-center">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1"
                          onClick={() => handleCopy(v.code, "Voucher code")}
                        >
                          {copiedText === v.code ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                          Copy Code
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Content View: Hotspot Subscribers List */
          <div className="space-y-3">
            {/* Select All Bar */}
            {filteredCustomers.length > 0 && (
              <div className="flex items-center justify-between rounded-lg border bg-card/60 px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="select-all-customers"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="size-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <label htmlFor="select-all-customers" className="font-medium cursor-pointer">
                    Select All ({filteredCustomers.length} displayed)
                  </label>
                </div>
                <span className="text-muted-foreground">
                  Showing {filteredCustomers.length} of {data?.customers.length ?? 0} customers
                </span>
              </div>
            )}

            {isPending ? (
              <div className="space-y-2.5">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            ) : filteredCustomers.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Users className="mx-auto size-10 text-muted-foreground/40 mb-2" />
                  <p className="font-semibold text-foreground text-base">No Customers Found</p>
                  <p className="text-xs mt-1 max-w-sm mx-auto">
                    {searchTerm
                      ? `No results matching "${searchTerm}". Try a different name, phone, or clear your filters.`
                      : activeTab === "online"
                      ? "No hotspot customers are currently online. When subscribers log in, their live session info will show here."
                      : "No customers in this category yet. Click 'Add Subscriber' above to register one."}
                  </p>
                  {searchTerm && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSearchTerm("")}
                      className="mt-4 text-xs"
                    >
                      Clear Search
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {filteredCustomers.map((c: any) => {
                  const isSelected = selectedIds.includes(c.id);
                  const isOnline = c.is_online;
                  const isExpiringSoon = c.is_expiring_soon;

                  return (
                    <Card
                      key={c.id}
                      className={`transition-all shadow-xs ${
                        isSelected
                          ? "border-primary/50 bg-primary/5"
                          : isOnline
                          ? "border-emerald-500/40 dark:border-emerald-500/30 hover:border-emerald-500"
                          : "hover:border-border/80"
                      }`}
                    >
                      <CardContent className="p-4">
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5">
                          {/* Left: Customer Info & Status */}
                          <div className="flex items-start gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectOne(c.id)}
                              aria-label={`Select ${c.full_name}`}
                              className="size-4 rounded border-gray-300 text-primary focus:ring-primary mt-1"
                            />

                            <div className="min-w-0 flex-1 space-y-1">
                              {/* Name, Status Beacon & Expiry Pill */}
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-foreground text-sm truncate">
                                  {c.full_name}
                                </span>

                                {/* Online / Offline Badge */}
                                {isOnline ? (
                                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-bold text-[11px] gap-1 px-2 py-0.5">
                                    <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                                    🟢 Online Now
                                  </Badge>
                                ) : c.status === "active" ? (
                                  <Badge variant="outline" className="text-muted-foreground text-[10px]">
                                    ⚪ Active (Not connected)
                                  </Badge>
                                ) : c.status === "expired" ? (
                                  <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 text-[10px]">
                                    🔴 Expired
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[10px]">
                                    Disabled
                                  </Badge>
                                )}

                                {/* Remaining Time Pill */}
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] font-mono font-medium ${
                                    isExpiringSoon
                                      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 animate-pulse"
                                      : isOnline
                                      ? "bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  ⏳ {c.time_left_formatted}
                                </Badge>

                                {c.packages?.name && (
                                  <Badge variant="secondary" className="text-[10px] font-medium">
                                    📦 {c.packages.name} (KES {c.packages.price_kes})
                                  </Badge>
                                )}
                              </div>

                              {/* Details row: Phone, MAC, Router, IP */}
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                {/* Phone with 1-click call and WhatsApp */}
                                <span className="flex items-center gap-1 font-mono">
                                  <Smartphone className="size-3 text-muted-foreground" />
                                  {c.phone}
                                  <a
                                    href={`tel:${c.phone}`}
                                    className="text-primary hover:underline ml-1"
                                    title="Call customer"
                                  >
                                    <PhoneCall className="size-3 inline" />
                                  </a>
                                  <a
                                    href={`https://wa.me/${c.phone.replace(/\D/g, "")}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-emerald-600 dark:text-emerald-400 hover:underline ml-1"
                                    title="WhatsApp customer"
                                  >
                                    <MessageSquare className="size-3 inline" />
                                  </a>
                                </span>

                                {c.username && (
                                  <span>👤 User: <strong className="text-foreground">{c.username}</strong></span>
                                )}

                                {/* Connected Router */}
                                <span>
                                  📡 Router:{" "}
                                  <strong className="text-foreground">
                                    {c.routers?.name || "All Routers"}
                                  </strong>
                                </span>

                                {/* MAC Address with copy button */}
                                {c.mac_address && (
                                  <span className="flex items-center gap-1 font-mono text-[11px] bg-muted/60 px-1.5 py-0.5 rounded">
                                    MAC: {c.mac_address}
                                    <button
                                      onClick={() => handleCopy(c.mac_address, "MAC Address")}
                                      className="hover:text-foreground"
                                      title="Copy MAC address"
                                    >
                                      {copiedText === c.mac_address ? (
                                        <Check className="size-3 text-emerald-500" />
                                      ) : (
                                        <Copy className="size-3" />
                                      )}
                                    </button>
                                  </span>
                                )}
                              </div>

                              {/* Live Router Telemetry (if available from heartbeat) */}
                              {c.live_telemetry && (
                                <div className="mt-1 flex flex-wrap items-center gap-2 pt-1 border-t border-dashed text-[11px] text-emerald-700 dark:text-emerald-300">
                                  <span className="font-semibold flex items-center gap-1">
                                    <Activity className="size-3" /> Live Telemetry:
                                  </span>
                                  {c.live_telemetry.ip && (
                                    <span className="font-mono bg-emerald-500/10 px-1 rounded">
                                      IP: {c.live_telemetry.ip}
                                    </span>
                                  )}
                                  {c.live_telemetry.uptime && (
                                    <span>⏱️ Active: {c.live_telemetry.uptime}</span>
                                  )}
                                  {c.live_telemetry.hostname && (
                                    <span>📱 Host: {c.live_telemetry.hostname}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Right: Quick Action Controls */}
                          <div className="flex flex-wrap items-center gap-2 self-end lg:self-center pl-7 lg:pl-0">
                            {/* ⚡ Renew / Extend Time Button */}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 text-xs border-primary/40 text-primary hover:bg-primary/10"
                              onClick={() => {
                                setRenewModalCustomer(c);
                                setRenewSelectedPkgId(c.package_id || "");
                                setRenewCustomHours("");
                              }}
                            >
                              <Zap className="size-3.5 text-amber-500" />
                              Renew Plan
                            </Button>

                            {/* 🛑 Disconnect / Kick Button (Visible if active or online) */}
                            {isOnline && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1 text-xs border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                                onClick={() => {
                                  setDisconnectModalCustomer(c);
                                  setDisconnectExpireCheck(false);
                                }}
                              >
                                <PowerOff className="size-3.5" />
                                Disconnect
                              </Button>
                            )}

                            {/* Status Selector */}
                            <select
                              value={c.status}
                              onChange={(e) =>
                                statusMutation.mutate({
                                  id: c.id,
                                  status: e.target.value as "active" | "expired" | "disabled",
                                })
                              }
                              aria-label={`Status for ${c.full_name}`}
                              className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium focus:ring-1 focus:ring-primary"
                            >
                              <option value="active">🟢 Active</option>
                              <option value="expired">🔴 Expired</option>
                              <option value="disabled">⚪ Disabled</option>
                            </select>

                            {/* Delete Button */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-destructive"
                              aria-label={`Remove ${c.full_name}`}
                              onClick={() => {
                                if (confirm(`Remove customer ${c.full_name}?`)) {
                                  deleteMutation.mutate(c.id);
                                }
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Customer Modal */}
      <Dialog open={isAddCustomerOpen} onOpenChange={setIsAddCustomerOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="size-5 text-primary" />
              Add Hotspot Customer
            </DialogTitle>
            <DialogDescription>
              Register a subscriber. Expiry date is automatically calculated from their selected plan.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="add-name">Full Name *</Label>
              <Input
                id="add-name"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                required
                minLength={2}
                placeholder="e.g. Jane Wanjiru"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-phone">Phone Number (M-Pesa) *</Label>
              <Input
                id="add-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                required
                placeholder="e.g. 0712345678 or 254712345678"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-username">Hotspot Login Username (Optional)</Label>
              <Input
                id="add-username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="Defaults to phone number if empty"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-pkg">Subscription Plan *</Label>
              <select
                id="add-pkg"
                value={form.packageId}
                onChange={(e) => setForm({ ...form, packageId: e.target.value })}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select a package...</option>
                {data?.packages.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({formatPackageDuration(p.duration_hours)}) · KES {p.price_kes}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-router">Assigned MikroTik Router</Label>
              <select
                id="add-router"
                value={form.routerId}
                onChange={(e) => setForm({ ...form, routerId: e.target.value })}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All Routers / Unassigned</option>
                {data?.routers.map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <DialogFooter className="mt-4 pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddCustomerOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Save & Initialize Session
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Renew Session Modal */}
      {renewModalCustomer && (
        <Dialog open={!!renewModalCustomer} onOpenChange={(open) => !open && setRenewModalCustomer(null)}>
          <DialogContent className="sm:max-w-[460px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="size-5 text-amber-500" />
                Renew Hotspot Session
              </DialogTitle>
              <DialogDescription>
                Extend or activate internet access for{" "}
                <strong className="text-foreground">{renewModalCustomer.full_name}</strong> ({renewModalCustomer.phone}).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                <p>
                  Current Status:{" "}
                  <strong className={renewModalCustomer.is_online ? "text-emerald-600" : "text-rose-600"}>
                    {renewModalCustomer.time_left_formatted}
                  </strong>
                </p>
                <p>
                  Router: <strong>{renewModalCustomer.routers?.name || "Default Router"}</strong>
                </p>
              </div>

              <div className="space-y-2">
                <Label>Choose Plan</Label>
                <select
                  value={renewSelectedPkgId}
                  onChange={(e) => {
                    setRenewSelectedPkgId(e.target.value);
                    setRenewCustomHours("");
                  }}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select Package...</option>
                  {data?.packages.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({formatPackageDuration(p.duration_hours)}) · KES {p.price_kes}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-muted"></div>
                <span className="flex-shrink mx-2 text-xs text-muted-foreground uppercase">or custom duration</span>
                <div className="flex-grow border-t border-muted"></div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="custom-hours">Custom Duration (Hours)</Label>
                <Input
                  id="custom-hours"
                  type="number"
                  min={1}
                  placeholder="e.g. 24 for 1 day, 720 for 1 month"
                  value={renewCustomHours}
                  onChange={(e) => {
                    setRenewCustomHours(e.target.value ? Number(e.target.value) : "");
                    if (e.target.value) setRenewSelectedPkgId("");
                  }}
                />
              </div>
            </div>

            <DialogFooter className="border-t pt-3">
              <Button variant="outline" onClick={() => setRenewModalCustomer(null)}>
                Cancel
              </Button>
              <Button
                disabled={renewMutation.isPending || (!renewSelectedPkgId && !renewCustomHours)}
                onClick={() => {
                  renewMutation.mutate({
                    id: renewModalCustomer.id,
                    packageId: renewSelectedPkgId || undefined,
                    durationHours: renewCustomHours ? Number(renewCustomHours) : undefined,
                  });
                }}
              >
                {renewMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Confirm Renewal
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Disconnect Confirmation Modal */}
      {disconnectModalCustomer && (
        <Dialog
          open={!!disconnectModalCustomer}
          onOpenChange={(open) => !open && setDisconnectModalCustomer(null)}
        >
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-rose-600">
                <PowerOff className="size-5" />
                Disconnect Customer Session?
              </DialogTitle>
              <DialogDescription>
                This will send a real-time disconnect command to MikroTik router{" "}
                <strong>{disconnectModalCustomer.routers?.name || "Router"}</strong> to terminate{" "}
                <strong className="text-foreground">{disconnectModalCustomer.full_name}</strong>'s current connection.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-700 dark:text-rose-300">
                User Phone: <strong>{disconnectModalCustomer.phone}</strong>
                {disconnectModalCustomer.mac_address && (
                  <div>MAC Address: <strong>{disconnectModalCustomer.mac_address}</strong></div>
                )}
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="mark-expired-check"
                  checked={disconnectExpireCheck}
                  onChange={(e) => setDisconnectExpireCheck(e.target.checked)}
                  className="size-4 rounded border-gray-300 text-destructive focus:ring-destructive"
                />
                <label htmlFor="mark-expired-check" className="text-xs font-medium cursor-pointer">
                  Also mark subscription plan as <strong>Expired</strong>
                </label>
              </div>
            </div>

            <DialogFooter className="border-t pt-3">
              <Button variant="outline" onClick={() => setDisconnectModalCustomer(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={disconnectMutation.isPending}
                onClick={() => {
                  disconnectMutation.mutate({
                    id: disconnectModalCustomer.id,
                    markExpired: disconnectExpireCheck,
                  });
                }}
              >
                {disconnectMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Disconnect Now
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AppShell>
  );
}
