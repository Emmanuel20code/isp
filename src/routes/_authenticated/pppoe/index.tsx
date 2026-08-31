import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { getMyContext } from "@/lib/tenancy.functions";
import {
  getPPPoEStats,
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
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  active_pppoe_users: number;
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
  const fetchCustomers = useServerFn(getPPPoECustomers);
  const fetchSessions = useServerFn(getPPPoEActiveSessions);
  const fetchPackages = useServerFn(getPackages);
  const saveCustomer = useServerFn(savePPPoECustomer);
  const suspendCustomer = useServerFn(suspendPPPoECustomer);
  const resetPassword = useServerFn(resetPPPoEPassword);
  const syncRouter = useServerFn(syncPPPoERouter);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const context = useQuery({ queryKey: ["my-context"], queryFn: () => fetchContext() });
  const stats = useQuery({ queryKey: ["pppoe-stats"], queryFn: () => fetchStats() });
  const customers = useQuery({ queryKey: ["pppoe-customers"], queryFn: () => fetchCustomers() });
  const sessions = useQuery({ queryKey: ["pppoe-sessions"], queryFn: () => fetchSessions() });
  const packages = useQuery({ queryKey: ["packages"], queryFn: () => fetchPackages() });

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

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    const formData = new FormData(e.currentTarget);
    const data = {
      id: editingCustomer?.id,
      full_name: String(formData.get("full_name") || ""),
      phone: String(formData.get("phone") || ""),
      username: String(formData.get("username") || ""),
      password: (formData.get("password") as string) || editingCustomer?.password || null,
      package_id: (formData.get("package_id") as string) || null,
      router_id: (formData.get("router_id") as string) || null,
      status: editingCustomer?.status || "active",
    };

    try {
      await saveCustomer(data);
      toast.success(editingCustomer ? "Customer updated" : "Customer added");
      queryClient.invalidateQueries({ queryKey: ["pppoe-customers"] });
      queryClient.invalidateQueries({ queryKey: ["pppoe-stats"] });
      setIsModalOpen(false);
      setEditingCustomer(null);
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

  return (
    <AppShell isSuperAdmin={context.data.isSuperAdmin} title="PPPoE Manager">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">PPPoE Manager</h1>
            <p className="text-sm text-muted-foreground">
              Manage your PPPoE subscribers and network nodes.
            </p>
          </div>
          <Button
            className="gap-2"
            onClick={() => {
              setEditingCustomer(null);
              setIsModalOpen(true);
            }}
          >
            <Plus className="size-4" /> Add PPPoE Customer
          </Button>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="overview" className="gap-2">
              <Activity className="size-3.5" /> Overview
            </TabsTrigger>
            <TabsTrigger value="customers" className="gap-2">
              <Users className="size-3.5" /> Customers
            </TabsTrigger>
            <TabsTrigger value="online" className="gap-2">
              <Zap className="size-3.5" /> Online Users
            </TabsTrigger>
            <TabsTrigger value="routers" className="gap-2">
              <Router className="size-3.5" /> Routers
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                title="Total Customers"
                value={stats.data?.total?.toLocaleString()}
                icon={Users}
              />
              <StatCard
                title="Active PPPoE"
                value={stats.data?.active?.toLocaleString()}
                icon={ShieldCheck}
                color="text-primary-foreground"
                bg="bg-tile-2 border-primary/20"
              />
              <StatCard
                title="Expired PPPoE"
                value={stats.data?.expired?.toLocaleString()}
                icon={ShieldAlert}
                color="text-destructive-foreground"
                bg="bg-destructive/20 border-destructive/30"
              />
              <StatCard
                title="PPPoE Online"
                value={stats.data?.online?.toLocaleString()}
                icon={Activity}
                color="text-primary-foreground"
                bg="bg-primary/20 border-primary/30"
              />
              <StatCard
                title="Income Today"
                value={`KES ${stats.data?.incomeToday?.toLocaleString()}`}
                icon={Banknote}
                color="text-success-foreground"
                bg="bg-success/20 border-success/30"
              />
              <StatCard
                title="Income Month"
                value={`KES ${stats.data?.incomeMonth?.toLocaleString()}`}
                icon={CalendarDays}
                color="text-primary-foreground"
                bg="bg-tile-5 border-primary/20"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="bg-card/50">
                <CardHeader>
                  <CardTitle className="text-base">Network Nodes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {stats.data?.routers.map((r: RouterItem) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
                      >
                        <div>
                          <p className="font-medium">{r.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.active_pppoe_users} online sessions
                          </p>
                        </div>
                        <Badge variant={r.status === "online" ? "success" : "destructive"}>
                          {r.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/50">
                <CardHeader>
                  <CardTitle className="text-base">Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-center py-8 text-sm text-muted-foreground">
                    No recent synchronization errors.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="customers">
            <Card className="bg-card/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div className="relative w-full max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search customers..."
                    className="pl-9"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left font-medium">
                        <th className="p-3">Customer</th>
                        <th className="p-3">Username</th>
                        <th className="p-3">Package</th>
                        <th className="p-3">Router</th>
                        <th className="p-3">Expiry</th>
                        <th className="p-3">Status</th>
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
                            No PPPoE customers found.
                          </td>
                        </tr>
                      ) : (
                        filteredCustomers.map((c: CustomerItem) => (
                          <tr key={c.id} className="hover:bg-muted/30">
                            <td className="p-3">
                              <p className="font-medium">{c.full_name}</p>
                              <p className="text-xs text-muted-foreground">{c.phone}</p>
                            </td>
                            <td className="p-3 font-mono text-xs">{c.username}</td>
                            <td className="p-3">{c.packages?.name || "None"}</td>
                            <td className="p-3">{c.routers?.name || "N/A"}</td>
                            <td className="p-3">
                              {c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "Never"}
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
                              >
                                {c.status}
                              </Badge>
                            </td>
                            <td className="p-3 text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-8">
                                    <MoreVertical className="size-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setEditingCustomer(c);
                                      setIsModalOpen(true);
                                    }}
                                  >
                                    <Pencil className="mr-2 size-4" /> Edit Details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleResetPassword(c.id)}>
                                    <KeyRound className="mr-2 size-4" /> Reset Password
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className={
                                      c.status === "active" ? "text-destructive" : "text-success"
                                    }
                                    onClick={() => handleSuspend(c.id, c.status)}
                                  >
                                    {c.status === "active" ? (
                                      <>
                                        <Ban className="mr-2 size-4" /> Suspend Access
                                      </>
                                    ) : (
                                      <>
                                        <ShieldCheck className="mr-2 size-4" /> Reactivate
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
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base font-display font-bold">
                  Active PPPoE Sessions
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => sessions.refetch()}
                  disabled={sessions.isPending}
                  className="gap-2"
                >
                  {sessions.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  Refresh Sessions
                </Button>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left font-medium">
                        <th className="p-3">Customer</th>
                        <th className="p-3">Username</th>
                        <th className="p-3">IP Address</th>
                        <th className="p-3">Connected At</th>
                        <th className="p-3">Uptime</th>
                        <th className="p-3">Usage (Up/Down)</th>
                        <th className="p-3 text-right">Actions</th>
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
                      ) : sessions.data?.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-12 text-center text-muted-foreground">
                            <Zap className="size-8 mx-auto mb-2 text-muted-foreground/20" />
                            No active PPPoE sessions found.
                            <p className="text-xs mt-1">
                              Sessions are matched automatically when customers connect.
                            </p>
                          </td>
                        </tr>
                      ) : (
                        (sessions.data as SessionItem[] | undefined)?.map((s) => (
                          <tr key={s.id} className="hover:bg-muted/30">
                            <td className="p-3">
                              <p className="font-medium">{s.customers?.full_name || "Unknown"}</p>
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
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive h-8 hover:bg-destructive/10"
                              >
                                Disconnect
                              </Button>
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
                <CardTitle className="text-base font-display font-bold">
                  Router Management
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  {stats.data?.routers.map((r: RouterItem) => (
                    <Card key={r.id} className="bg-background/50 border-sidebar-border shadow-sm">
                      <CardHeader className="p-4 pb-2">
                        <div className="flex items-center justify-between">
                          <div className="rounded-full bg-primary/10 p-2">
                            <Router className="size-4 text-primary" />
                          </div>
                          <Badge
                            variant={r.status === "online" ? "success" : "destructive"}
                            className="text-[10px]"
                          >
                            {r.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        <h3 className="font-bold truncate text-sm mt-2">{r.name}</h3>
                        <p className="text-[11px] text-muted-foreground mb-4">
                          Active PPPoE Sessions:{" "}
                          <span className="text-foreground font-semibold">
                            {r.active_pppoe_users}
                          </span>
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px]"
                            onClick={() => navigate({ to: `/routers` })}
                          >
                            Manage
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px] gap-1"
                            onClick={() => handleSync(r.id)}
                            disabled={isSyncing === r.id}
                          >
                            {isSyncing === r.id ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <RefreshCw className="size-3" />
                            )}
                            Sync
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-w-md">
            <form onSubmit={handleSave}>
              <DialogHeader>
                <DialogTitle>
                  {editingCustomer ? "Edit PPPoE Customer" : "Add New PPPoE Customer"}
                </DialogTitle>
                <DialogDescription>
                  Enter the customer details. Credentials will be pushed to the selected router.
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
                <div className="grid grid-cols-2 gap-4">
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
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      name="password"
                      defaultValue={editingCustomer?.password || undefined}
                      type="password"
                      placeholder={editingCustomer ? "Leave blank to keep current" : "••••••••"}
                      required={!editingCustomer}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="package_id">Assigned Package</Label>
                  <Select name="package_id" defaultValue={editingCustomer?.package_id || undefined}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a package" />
                    </SelectTrigger>
                    <SelectContent>
                      {pppPackages.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} — KES {p.price_kes}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="router_id">Target Router</Label>
                  <Select name="router_id" defaultValue={editingCustomer?.router_id || undefined}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a router" />
                    </SelectTrigger>
                    <SelectContent>
                      {stats.data?.routers.map((r: RouterItem) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name} ({r.status})
                        </SelectItem>
                      ))}
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
                  {editingCustomer ? "Update Customer" : "Create Customer"}
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
