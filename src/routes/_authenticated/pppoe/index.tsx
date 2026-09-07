import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
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
} from "@/lib/pppoe.functions";
import { getPackages } from "@/lib/network.functions";
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
  const fetchCustomers = useServerFn(getPPPoECustomers);
  const fetchSessions = useServerFn(getPPPoEActiveSessions);
  const fetchPackages = useServerFn(getPackages);
  const saveCustomer = useServerFn(savePPPoECustomer);
  const suspendCustomer = useServerFn(suspendPPPoECustomer);
  const resetPassword = useServerFn(resetPPPoEPassword);
  const syncRouter = useServerFn(syncPPPoERouter);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  const context = useQuery({ queryKey: ["my-context"], queryFn: () => fetchContext() });
  const stats = useQuery({ queryKey: ["pppoe-stats"], queryFn: () => fetchStats() });
  const routers = useQuery({ queryKey: ["pppoe-routers"], queryFn: () => fetchRouters() });
  const customers = useQuery({ queryKey: ["pppoe-customers"], queryFn: () => fetchCustomers() });
  const sessions = useQuery({ queryKey: ["pppoe-sessions"], queryFn: () => fetchSessions() });
  const packages = useQuery({ queryKey: ["packages"], queryFn: () => fetchPackages() });

  const routerList = useMemo(() => {
    if (routers.data && routers.data.length > 0) return routers.data as RouterItem[];
    if (stats.data?.routers && stats.data.routers.length > 0)
      return stats.data.routers as RouterItem[];
    return [] as RouterItem[];
  }, [routers.data, stats.data?.routers]);

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
    const passwordVal =
      (formData.get("password") as string) ||
      generatedPassword ||
      editingCustomer?.password ||
      null;
    const data = {
      id: editingCustomer?.id,
      full_name: String(formData.get("full_name") || ""),
      phone: String(formData.get("phone") || ""),
      username: String(formData.get("username") || ""),
      password: passwordVal,
      package_id: (formData.get("package_id") as string) || null,
      router_id: (formData.get("router_id") as string) || null,
      status: editingCustomer?.status || "active",
    };

    try {
      await saveCustomer(data);
      toast.success(
        editingCustomer ? "Customer updated" : "Customer added & provisioned on MikroTik",
      );
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
      await suspendCustomer({ id, status: newStatus });
      toast.success(`Customer ${newStatus === "active" ? "activated" : "suspended"}`);
      queryClient.invalidateQueries({ queryKey: ["pppoe-customers"] });
      queryClient.invalidateQueries({ queryKey: ["pppoe-stats"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  const handleResetPassword = async (id: string) => {
    try {
      const res = await resetPassword({ id });
      toast.success(`Password reset successfully. New password: ${res.password}`);
      queryClient.invalidateQueries({ queryKey: ["pppoe-customers"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reset password");
    }
  };

  const handleSync = async (routerId: string) => {
    setIsSyncing(routerId);
    try {
      const res = await syncRouter({ routerId });
      toast.success(`Successfully queued ${res.synced} synchronization commands`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setIsSyncing(null);
    }
  };

  if (context.isPending) return null;
  const tenant = context.data.tenant;
  if (!tenant) return null;

  const pppPackages =
    (packages.data as PackageItem[] | undefined)?.filter((p) => p.kind === "pppoe") || [];

  const portalUrl =
    typeof window !== "undefined"
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
              Manage PPPoE fiber/wireless subscribers, provision secrets, and manage customer
              renewals.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-9"
              onClick={copyPortalLink}
            >
              {copiedLink ? (
                <Check className="size-4 text-emerald-500" />
              ) : (
                <Copy className="size-4" />
              )}
              PPPoE Portal URL
            </Button>
            <Button
              className="gap-2"
              onClick={() => {
                setEditingCustomer(null);
                setGeneratedPassword("");
                setIsModalOpen(true);
              }}
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
                  Expired PPPoE users can visit this link to enter their username/phone, pay via
                  M-Pesa, and restore their connection instantly.
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
                {copiedLink ? (
                  <Check className="size-3.5 text-emerald-600" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                Copy Link
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" asChild>
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
                                  r.status === "online"
                                    ? "bg-emerald-500 animate-pulse"
                                    : "bg-muted-foreground/50",
                                )}
                              />
                            </div>
                            <div>
                              <p className="font-semibold text-sm leading-none">{r.name}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {r.public_ip || "MikroTik Agent"}{" "}
                                {r.ros_version ? `• v${r.ros_version}` : ""}
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
                      <p className="text-xs text-muted-foreground font-medium">
                        Active Subscribers
                      </p>
                      <p className="text-xl font-bold text-emerald-500 mt-1">
                        {stats.data?.active || 0}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Secrets enabled on MikroTik
                      </p>
                    </div>
                    <div className="p-3 rounded-lg border bg-background/30">
                      <p className="text-xs text-muted-foreground font-medium">Expired / Pending</p>
                      <p className="text-xl font-bold text-rose-500 mt-1">
                        {stats.data?.expired || 0}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Redirected to payment
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                    <p className="font-semibold text-foreground flex items-center gap-1.5">
                      <Zap className="size-3.5 text-primary" /> Instant Activation
                    </p>
                    <p>
                      When a PPPoE customer pays their renewal on M-Pesa, their account expiration
                      date updates automatically and the router is instructed to activate the secret
                      immediately.
                    </p>
                  </div>
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
                            {searchTerm
                              ? "No customers found matching your search."
                              : "No PPPoE customers yet. Click 'Add PPPoE Customer' above to create one."}
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
                            <td className="p-3 text-xs font-medium">
                              {c.routers?.name || "Any Router"}
                            </td>
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
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setEditingCustomer(c);
                                      setGeneratedPassword("");
                                      setIsModalOpen(true);
                                    }}
                                  >
                                    <Pencil className="mr-2 size-3.5" /> Edit Details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleResetPassword(c.id)}>
                                    <KeyRound className="mr-2 size-3.5" /> Reset Password
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className={
                                      c.status === "active"
                                        ? "text-destructive"
                                        : "text-emerald-600"
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
                              <p className="font-semibold text-foreground">
                                {s.customers?.full_name || "Unknown"}
                              </p>
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
                      Connect your MikroTik router to enable automated PPPoE client creation, rate
                      limiting, and session disconnection.
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
                              <span className="font-semibold text-foreground">
                                {r.active_pppoe_users ?? 0}
                              </span>
                            </div>
                            {r.ros_version && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">RouterOS:</span>
                                <span className="font-medium text-foreground">
                                  v{r.ros_version}
                                </span>
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
                  Enter customer credentials. The secret and speed profiles are instantly sent to
                  your MikroTik router.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input
                    id="full_name"
                    name="full_name"
                    defaultValue={editingCustomer?.full_name}
                    required
                    placeholder="e.g. John Doe"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone Number (M-Pesa)</Label>
                  <Input
                    id="phone"
                    name="phone"
                    defaultValue={editingCustomer?.phone}
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
                      defaultValue={editingCustomer?.username}
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
                      value={generatedPassword || undefined}
                      defaultValue={
                        generatedPassword ? undefined : editingCustomer?.password || undefined
                      }
                      onChange={(e) => setGeneratedPassword(e.target.value)}
                      placeholder={editingCustomer ? "Leave blank to keep" : "••••••••"}
                      required={!editingCustomer && !generatedPassword}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="package_id">Assigned PPPoE Package</Label>
                  <Select
                    name="package_id"
                    defaultValue={editingCustomer?.package_id || pppPackages[0]?.id || undefined}
                  >
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
                    defaultValue={
                      editingCustomer?.router_id ||
                      (routerList.length === 1 ? routerList[0].id : undefined)
                    }
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
