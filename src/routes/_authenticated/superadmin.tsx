import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getMyContext } from "@/lib/tenancy.functions";
import {
  getPlatformMpesaConfig,
  savePlatformMpesaConfig,
  savePlatformSettings,
  testPlatformMpesaConfig,
  sendTestStkPush,
  getAllTenants,
  updateTenantByAdmin,
  deleteTenantByAdmin,
  getSuperAdminStats,
} from "@/lib/platform.functions";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  ShieldCheck,
  Smartphone,
  Users,
  Building2,
  Wifi,
  CreditCard,
  TrendingUp,
  BarChart3,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Ban,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/superadmin")({
  head: () => ({
    meta: [
      { title: "Super admin · M-Pesa Daraja setup" },
      {
        name: "description",
        content:
          "Platform owner controls: the master Safaricom Daraja API credentials that initiate every STK push, plus SaaS pricing and trial rules.",
      },
      { property: "og:title", content: "Super admin · M-Pesa Daraja setup" },
      {
        property: "og:description",
        content: "Master Daraja credentials and SaaS billing rules for the platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SuperAdminPage,
});

function SuperAdminPage() {
  const fetchContext = useServerFn(getMyContext);
  const fetchConfig = useServerFn(getPlatformMpesaConfig);
  const saveConfig = useServerFn(savePlatformMpesaConfig);
  const testConfig = useServerFn(testPlatformMpesaConfig);
  const triggerTestStk = useServerFn(sendTestStkPush);
  const saveSettings = useServerFn(savePlatformSettings);
  const fetchTenants = useServerFn(getAllTenants);
  const updateTenant = useServerFn(updateTenantByAdmin);
  const deleteTenant = useServerFn(deleteTenantByAdmin);
  const fetchStats = useServerFn(getSuperAdminStats);

  const ctx = useQuery({ queryKey: ["my-context"], queryFn: () => fetchContext() });
  const isSuper = ctx.data?.isSuperAdmin === true;

  const config = useQuery({
    queryKey: ["platform-mpesa-config"],
    queryFn: () => fetchConfig(),
    enabled: isSuper,
    retry: false,
  });

  const tenants = useQuery({
    queryKey: ["all-tenants"],
    queryFn: () => fetchTenants(),
    enabled: isSuper,
  });

  const stats = useQuery({
    queryKey: ["super-admin-stats"],
    queryFn: () => fetchStats(),
    enabled: isSuper,
  });

  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [tenantToDelete, setTenantToDelete] = useState<string | null>(null);

  const [environment, setEnvironment] = useState<"production" | "sandbox">("production");
  const [shortcode, setShortcode] = useState("");
  const [transactionType] = useState<"CustomerBuyGoodsOnline">("CustomerBuyGoodsOnline");
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [passkey, setPasskey] = useState("");
  const [callbackBaseUrl, setCallbackBaseUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [sendingStk, setSendingStk] = useState(false);

  const [price, setPrice] = useState("1500");
  const [days, setDays] = useState("30");
  const [trial, setTrial] = useState("3");
  const [warn, setWarn] = useState("5");
  const [saasTill, setSaasTill] = useState("");
  const [supportPhone, setSupportPhone] = useState("");

  useEffect(() => {
    const c = config.data;
    if (!c) return;
    setEnvironment(c.environment);
    setShortcode(c.shortcode);
    setCallbackBaseUrl(c.callbackBaseUrl ?? "");
    if (c.platform) {
      setPrice(String(c.platform.subscription_price_kes ?? 1500));
      setDays(String(c.platform.subscription_days ?? 30));
      setTrial(String(c.platform.trial_days ?? 3));
      setWarn(String(c.platform.warning_days ?? 5));
      setSaasTill(c.platform.saas_till_number ?? "");
      setSupportPhone(c.platform.support_phone ?? "");
    }
  }, [config.data]);

  if (ctx.isPending) {
    return (
      <AppShell>
        <Skeleton className="h-40 w-full" />
      </AppShell>
    );
  }

  if (!isSuper) {
    return (
      <AppShell>
        <Card>
          <CardHeader>
            <CardTitle>Not available</CardTitle>
            <CardDescription>This area is only for the platform owner.</CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  async function onSaveDaraja() {
    setBusy(true);
    try {
      await saveConfig({
        data: {
          environment,
          shortcode,
          transactionType,
          callbackBaseUrl,
          consumerKey,
          consumerSecret,
          passkey,
        },
      });
      setConsumerKey("");
      setConsumerSecret("");
      setPasskey("");
      await config.refetch();
      toast.success("Daraja API settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function onTest() {
    setTesting(true);
    try {
      const res = await testConfig();
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    } finally {
      setTesting(false);
    }
  }

  async function onSendTestStkPush() {
    if (!testPhone.trim()) {
      toast.error("Please enter a phone number (e.g. 0712345678 or 0113745960)");
      return;
    }
    setSendingStk(true);
    try {
      const res = await triggerTestStk({ data: { phone: testPhone.trim(), amount: 1 } });
      toast.success(`STK Push dispatched to ${res.phone}! Checkout ID: ${res.checkoutRequestId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "STK Push failed");
    } finally {
      setSendingStk(false);
    }
  }

  async function onSaveSettings() {
    setBusy(true);
    try {
      await saveSettings({
        data: {
          subscriptionPriceKes: Number(price) || 0,
          subscriptionDays: Number(days) || 30,
          trialDays: Number(trial) || 0,
          warningDays: Number(warn) || 0,
          saasTillNumber: saasTill,
          supportPhone: supportPhone,
        },
      });
      toast.success("Platform billing rules saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function onToggleStatus(tenantId: string, currentStatus: boolean) {
    setUpdatingId(tenantId);
    try {
      await updateTenant({ data: { tenantId, isActive: !currentStatus } });
      await tenants.refetch();
      toast.success(currentStatus ? "Business suspended" : "Business activated");
    } catch (err) {
      toast.error("Status update failed");
    } finally {
      setUpdatingId(null);
    }
  }

  async function onExtendSubscription(tenantId: string) {
    setUpdatingId(tenantId);
    try {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      await updateTenant({ data: { tenantId, expiresAt: thirtyDaysFromNow.toISOString() } });
      await tenants.refetch();
      toast.success("Subscription extended by 30 days");
    } catch (err) {
      toast.error("Extension failed");
    } finally {
      setUpdatingId(null);
    }
  }

  async function confirmDeleteTenant() {
    if (!tenantToDelete) return;
    setUpdatingId(tenantToDelete);
    try {
      await deleteTenant({ data: { tenantId: tenantToDelete } });
      await tenants.refetch();
      toast.success("Business permanently deleted");
      setTenantToDelete(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Deletion failed");
    } finally {
      setUpdatingId(null);
    }
  }

  const filteredTenants = tenants.data?.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()),
  );

  const n = (val: number | undefined) => (val === undefined ? "0" : val.toLocaleString());

  return (
    <AppShell isSuperAdmin>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-6 text-primary" />
          <h1 className="text-3xl font-bold font-display tracking-tight">Command Center</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Platform-wide oversight: manage M-Pesa gateway, business subscriptions, and global
          performance metrics.
        </p>
      </div>

      <Tabs defaultValue="overview" className="mt-8">
        <TabsList className="bg-muted/50 border border-border/60">
          <TabsTrigger value="overview" className="gap-2">
            <BarChart3 className="size-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="businesses" className="gap-2">
            <Building2 className="size-4" /> Businesses
          </TabsTrigger>
          <TabsTrigger value="gateway" className="gap-2">
            <CreditCard className="size-4" /> Gateway
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-2">
            <ShieldCheck className="size-4" /> Rules
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Businesses"
              value={n(stats.data?.totalTenants)}
              icon={Building2}
            />
            <StatCard
              title="Active Subscriptions"
              value={n(stats.data?.activeSubscriptions)}
              icon={CheckCircle2}
              color="text-success"
            />
            <StatCard
              title="Today's Revenue"
              value={`KES ${n(stats.data?.todayRevenue)}`}
              icon={TrendingUp}
              color="text-success"
            />
            <StatCard
              title="Month Revenue"
              value={`KES ${n(stats.data?.monthRevenue)}`}
              icon={CreditCard}
              color="text-primary"
            />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Platform Growth</CardTitle>
                <CardDescription>Total subscription revenue accumulated</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <div className="text-4xl font-bold text-primary">
                  KES {n(stats.data?.totalRevenue)}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">Total platform earnings</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">System Health</CardTitle>
                <CardDescription>Master Daraja API status</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between py-2 border-b border-border/40">
                  <span className="text-sm">Environment</span>
                  <Badge
                    variant={config.data?.environment === "production" ? "default" : "secondary"}
                  >
                    {config.data?.environment ?? "Unknown"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border/40">
                  <span className="text-sm">Last Config Sync</span>
                  <span className="text-sm font-medium">
                    {config.data?.updatedAt
                      ? new Date(config.data.updatedAt).toLocaleDateString()
                      : "Never"}
                  </span>
                </div>
                <Button variant="outline" size="sm" className="w-full gap-2" onClick={onTest}>
                  {testing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="size-4" />
                  )}
                  Verify Gateway Connection
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="businesses" className="mt-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search businesses..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              Showing {filteredTenants?.length ?? 0} businesses
            </div>
          </div>

          <div className="space-y-3">
            {tenants.isPending && (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            )}
            {filteredTenants?.map((t) => {
              const isExpired = t.expiresAt ? new Date(t.expiresAt) < new Date() : true;
              return (
                <Card key={t.id} className={cn("transition-colors", !t.isActive && "opacity-60")}>
                  <CardContent className="flex flex-wrap items-center gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-lg">{t.name}</p>
                        {!t.isActive && (
                          <Badge variant="destructive" className="h-5 text-[10px] uppercase">
                            Suspended
                          </Badge>
                        )}
                        {isExpired && t.isActive && (
                          <Badge
                            variant="outline"
                            className="h-5 text-[10px] uppercase text-destructive border-destructive/20 bg-destructive/5"
                          >
                            Expired
                          </Badge>
                        )}
                        {!isExpired && t.isActive && (
                          <Badge
                            variant="outline"
                            className="h-5 text-[10px] uppercase text-success border-success/20 bg-success/5"
                          >
                            Active
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="size-3" /> {t.customerCount} customers
                        </span>
                        <span className="flex items-center gap-1">
                          <Wifi className="size-3" /> {t.routerCount} routers
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" /> Expiry:{" "}
                          {t.expiresAt ? new Date(t.expiresAt).toLocaleDateString() : "Never"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => onExtendSubscription(t.id)}
                        disabled={updatingId === t.id}
                      >
                        {updatingId === t.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <RotateCcw className="size-3" />
                        )}
                        Extend
                      </Button>
                      <Button
                        variant={t.isActive ? "destructive" : "default"}
                        size="sm"
                        className="gap-2"
                        onClick={() => onToggleStatus(t.id, t.isActive)}
                        disabled={updatingId === t.id}
                      >
                        {updatingId === t.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : t.isActive ? (
                          <Ban className="size-3" />
                        ) : (
                          <CheckCircle2 className="size-3" />
                        )}
                        {t.isActive ? "Suspend" : "Activate"}
                      </Button>
                      {!t.isActive && (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="gap-2"
                          onClick={() => setTenantToDelete(t.id)}
                          disabled={updatingId === t.id}
                        >
                          {updatingId === t.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Trash2 className="size-3" />
                          )}
                          Delete
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {!tenants.isPending && filteredTenants?.length === 0 && (
              <Card className="border-dashed flex flex-col items-center justify-center py-12">
                <Building2 className="size-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">No businesses found</p>
              </Card>
            )}
          </div>

          <AlertDialog open={!!tenantToDelete} onOpenChange={(open) => !open && setTenantToDelete(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Permanently delete business?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to permanently delete this suspended business? This action cannot be undone and will remove all associated data, customers, and routers.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDeleteTenant} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete Business
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        <TabsContent value="gateway" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="size-4" /> Master M-Pesa Daraja API
              </CardTitle>
              <CardDescription>
                These credentials initiate every M-Pesa payment prompt on the entire platform.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Environment</Label>
                <Select
                  value={environment}
                  onValueChange={(v) => setEnvironment(v as "production" | "sandbox")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">Production</SelectItem>
                    <SelectItem value="sandbox">Sandbox</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Transaction Type</Label>
                <Input
                  value="CustomerBuyGoodsOnline"
                  disabled
                  className="bg-muted text-muted-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shortcode">Business shortcode</Label>
                <Input
                  id="shortcode"
                  value={shortcode}
                  onChange={(e) => setShortcode(e.target.value)}
                  placeholder="4123456"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="passkey">
                  Passkey{" "}
                  {config.data?.passkeyMasked && (
                    <Badge variant="secondary" className="ml-1 text-[10px]">
                      {config.data.passkeyMasked}
                    </Badge>
                  )}
                </Label>
                <Input
                  id="passkey"
                  type="password"
                  value={passkey}
                  onChange={(e) => setPasskey(e.target.value)}
                  placeholder="Leave blank to keep current"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ck">
                  Consumer key{" "}
                  {config.data?.consumerKeyMasked && (
                    <Badge variant="secondary" className="ml-1 text-[10px]">
                      {config.data.consumerKeyMasked}
                    </Badge>
                  )}
                </Label>
                <Input
                  id="ck"
                  type="password"
                  value={consumerKey}
                  onChange={(e) => setConsumerKey(e.target.value)}
                  placeholder="Leave blank to keep current"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cs">
                  Consumer secret{" "}
                  {config.data?.consumerSecretMasked && (
                    <Badge variant="secondary" className="ml-1 text-[10px]">
                      {config.data.consumerSecretMasked}
                    </Badge>
                  )}
                </Label>
                <Input
                  id="cs"
                  type="password"
                  value={consumerSecret}
                  onChange={(e) => setConsumerSecret(e.target.value)}
                  placeholder="Leave blank to keep current"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="cb">Callback web address</Label>
                  {config.data?.autoCallbackUrl && (
                    <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      Auto: {config.data.autoCallbackUrl}
                    </span>
                  )}
                </div>
                <Input
                  id="cb"
                  value={callbackBaseUrl}
                  onChange={(e) => setCallbackBaseUrl(e.target.value)}
                  placeholder="Leave blank for automatic matching"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:col-span-2 pt-2">
                <Button
                  onClick={onSaveDaraja}
                  disabled={busy || shortcode.trim().length < 4}
                  className="gap-2"
                >
                  {busy && <Loader2 className="size-4 animate-spin" />} Save credentials
                </Button>
              </div>

              <div className="space-y-3 sm:col-span-2 mt-4 pt-6 border-t">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Smartphone className="size-4 text-primary" /> Test Handset Prompt
                </div>
                <div className="flex gap-2 max-w-md">
                  <Input
                    placeholder="e.g. 0712345678"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                  />
                  <Button
                    variant="secondary"
                    onClick={onSendTestStkPush}
                    disabled={sendingStk || !testPhone.trim()}
                    className="gap-2 whitespace-nowrap"
                  >
                    {sendingStk ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Smartphone className="size-4" />
                    )}
                    Send 1 KES Test
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Platform Subscription Rules</CardTitle>
              <CardDescription>
                Configure pricing and trial policies for all ISP businesses.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="price">Monthly Price (KES)</Label>
                <Input
                  id="price"
                  inputMode="numeric"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trial">Trial Period (Days)</Label>
                <Input
                  id="trial"
                  inputMode="numeric"
                  value={trial}
                  onChange={(e) => setTrial(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="warn">Expiry Warning (Days)</Label>
                <Input
                  id="warn"
                  inputMode="numeric"
                  value={warn}
                  onChange={(e) => setWarn(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="saas-till">Settlement Till Number</Label>
                <Input
                  id="saas-till"
                  inputMode="numeric"
                  value={saasTill}
                  onChange={(e) => setSaasTill(e.target.value)}
                  placeholder="e.g. 5162345"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="support-phone">WhatsApp Support Number</Label>
                <Input
                  id="support-phone"
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(e.target.value)}
                  placeholder="e.g. 254712345678"
                />
              </div>
              <div className="sm:col-span-4 pt-4 border-t">
                <Button onClick={onSaveSettings} disabled={busy} className="gap-2">
                  {busy && <Loader2 className="size-4 animate-spin" />} Update Global Rules
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  color = "text-foreground",
}: {
  title: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  color?: string;
}) {
  return (
    <Card className="overflow-hidden border-border/60">
      <CardContent className="p-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {title}
          </p>
          <p className={cn("mt-1 text-2xl font-bold tracking-tight", color)}>{value}</p>
        </div>
        <div className="rounded-xl bg-muted/50 p-2.5">
          <Icon className="size-5 text-muted-foreground/70" />
        </div>
      </CardContent>
    </Card>
  );
}
