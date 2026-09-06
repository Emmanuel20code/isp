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
  getGithubConfig,
  saveGithubConfig,
  triggerGithubPush,
  getSubscriptionLogs,
} from "@/lib/platform.functions";
import { getSubscriptionDiagnosticsDashboard } from "@/lib/diagnostic.functions";
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
  Github,
  GitBranch,
  Activity,
  AlertTriangle,
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
  const fetchGithub = useServerFn(getGithubConfig);
  const saveGithub = useServerFn(saveGithubConfig);
  const triggerGithub = useServerFn(triggerGithubPush);
  const fetchLogs = useServerFn(getSubscriptionLogs);

  const ctx = useQuery({ queryKey: ["my-context"], queryFn: () => fetchContext() });
  const isSuper = ctx.data?.isSuperAdmin === true;

  const config = useQuery({
    queryKey: ["platform-mpesa-config"],
    queryFn: () => fetchConfig(),
    enabled: isSuper,
    retry: false,
  });

  const githubConfig = useQuery({
    queryKey: ["platform-github-config"],
    queryFn: () => fetchGithub(),
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

  const subscriptionLogs = useQuery({
    queryKey: ["super-admin-subscription-logs"],
    queryFn: () => fetchLogs(),
    enabled: isSuper,
  });

  const fetchDiagnostics = useServerFn(getSubscriptionDiagnosticsDashboard);
  const diagnosticsQuery = useQuery({
    queryKey: ["subscription-diagnostics-dashboard"],
    queryFn: () => fetchDiagnostics(),
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

  const [githubToken, setGithubToken] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [githubBranch, setGithubBranch] = useState("main");
  const [forcePush, setForcePush] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{
    ok: boolean;
    message: string;
    output?: string;
  } | null>(null);
  const [savingGithub, setSavingGithub] = useState(false);

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

  useEffect(() => {
    const g = githubConfig.data;
    if (!g) return;
    setGithubRepo(g.githubRepo);
    setGithubBranch(g.githubBranch || "main");
  }, [githubConfig.data]);

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

  async function onSaveGithub() {
    setSavingGithub(true);
    try {
      await saveGithub({
        data: {
          githubToken: githubToken.trim() || undefined,
          githubRepo: githubRepo.trim() || undefined,
          githubBranch: githubBranch.trim() || "main",
        },
      });
      setGithubToken("");
      await githubConfig.refetch();
      toast.success("GitHub configuration saved!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save GitHub config");
    } finally {
      setSavingGithub(false);
    }
  }

  async function onTriggerPush() {
    setPushing(true);
    setPushResult(null);
    try {
      const res = await triggerGithub({
        data: {
          forcePush,
        },
      });
      setPushResult({
        ok: true,
        message: res.message,
        output: res.output,
      });
      toast.success(res.message);
    } catch (err: any) {
      setPushResult({
        ok: false,
        message: err.message || "Failed to push to GitHub",
      });
      toast.error(err.message || "Push failed");
    } finally {
      setPushing(false);
    }
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
          <TabsTrigger value="github" className="gap-2">
            <Github className="size-4" /> GitHub Push
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <Clock className="size-4" /> Subscription Logs
          </TabsTrigger>
          <TabsTrigger value="diagnostics" className="gap-2">
            <Activity className="size-4" /> Subscription Diagnostics
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

          <AlertDialog
            open={!!tenantToDelete}
            onOpenChange={(open) => !open && setTenantToDelete(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Permanently delete business?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to permanently delete this suspended business? This action
                  cannot be undone and will remove all associated data, customers, and routers.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmDeleteTenant}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
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

        <TabsContent value="github" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Github className="size-5" /> Code Self-Push to GitHub
              </CardTitle>
              <CardDescription>
                Directly push the current, live application codebase from the runtime server to a
                GitHub repository of your choice.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                {/* Configuration Panel */}
                <div className="space-y-4 p-5 rounded-xl border bg-card/50">
                  <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                    1. Configuration
                  </h3>

                  <div className="space-y-2">
                    <Label htmlFor="github-repo">GitHub Repository</Label>
                    <Input
                      id="github-repo"
                      value={githubRepo}
                      onChange={(e) => setGithubRepo(e.target.value)}
                      placeholder="e.g. username/repository"
                    />
                    <p className="text-xs text-muted-foreground">
                      Format: <code className="bg-muted px-1 py-0.5 rounded">owner/repo_name</code>.
                      Make sure the repository exists on GitHub.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="github-branch">Target Branch</Label>
                    <Input
                      id="github-branch"
                      value={githubBranch}
                      onChange={(e) => setGithubBranch(e.target.value)}
                      placeholder="main"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="github-token">
                      Personal Access Token (PAT){" "}
                      {githubConfig.data?.githubTokenMasked && (
                        <Badge variant="secondary" className="ml-1 text-[10px]">
                          {githubConfig.data.githubTokenMasked}
                        </Badge>
                      )}
                    </Label>
                    <Input
                      id="github-token"
                      type="password"
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                      placeholder={
                        githubConfig.data?.githubTokenMasked
                          ? "Leave blank to keep existing token"
                          : "ghp_..."
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Requires <code className="bg-muted px-1 py-0.5 rounded">repo</code> scope
                      permissions to write to private repositories.
                    </p>
                  </div>

                  <Button
                    onClick={onSaveGithub}
                    disabled={savingGithub || !githubRepo.trim()}
                    className="w-full gap-2 mt-2"
                  >
                    {savingGithub ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="size-4" />
                    )}
                    Save GitHub Config
                  </Button>
                </div>

                {/* Push Actions Panel */}
                <div className="space-y-4 p-5 rounded-xl border bg-card/50 flex flex-col justify-between">
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                      2. Execution
                    </h3>

                    <div className="rounded-lg bg-muted/40 p-4 border text-sm space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status:</span>
                        <span className="font-semibold flex items-center gap-1.5">
                          {githubConfig.data?.githubRepo ? (
                            <>
                              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                              Configured
                            </>
                          ) : (
                            <>
                              <XCircle className="size-4 text-destructive" />
                              Not Configured
                            </>
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Target:</span>
                        <span
                          className="font-mono text-xs truncate max-w-[200px]"
                          title={githubConfig.data?.githubRepo || "None"}
                        >
                          {githubConfig.data?.githubRepo || "None"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Branch:</span>
                        <span className="font-mono text-xs">
                          {githubConfig.data?.githubBranch || "main"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs">
                      <input
                        type="checkbox"
                        id="force-push"
                        checked={forcePush}
                        onChange={(e) => setForcePush(e.target.checked)}
                        className="mt-0.5 rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                      />
                      <div className="grid gap-0.5">
                        <Label
                          htmlFor="force-push"
                          className="font-bold text-amber-800 dark:text-amber-400 cursor-pointer"
                        >
                          Force Push (Dangerous)
                        </Label>
                        <p className="text-amber-700/80 dark:text-amber-400/80">
                          Force-pushing will overwrite history on the remote repository branch if it
                          differs. Use with caution.
                        </p>
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={onTriggerPush}
                    disabled={pushing || !githubConfig.data?.githubRepo}
                    variant={forcePush ? "destructive" : "default"}
                    className="w-full gap-2 mt-4 py-6 text-base font-semibold"
                  >
                    {pushing ? (
                      <>
                        <Loader2 className="size-5 animate-spin" />
                        Pushing Codebase...
                      </>
                    ) : (
                      <>
                        <Github className="size-5" />
                        Push Active Code to GitHub
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Push Results / logs */}
              {pushResult && (
                <div
                  className={cn(
                    "p-5 rounded-xl border text-sm space-y-3",
                    pushResult.ok
                      ? "bg-emerald-500/5 border-emerald-500/20"
                      : "bg-destructive/5 border-destructive/20",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {pushResult.ok ? (
                      <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <XCircle className="size-5 text-destructive" />
                    )}
                    <span className="font-bold">
                      {pushResult.ok ? "Self-Push Succeeded!" : "Self-Push Failed"}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{pushResult.message}</p>

                  {pushResult.output && (
                    <div className="mt-3">
                      <span className="text-xs font-semibold text-muted-foreground uppercase block mb-1">
                        Git Output Log:
                      </span>
                      <pre className="bg-muted p-4 rounded-lg font-mono text-xs overflow-x-auto max-h-40 whitespace-pre-wrap">
                        {pushResult.output}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Subscription Renewal Logs</CardTitle>
              <CardDescription>
                Audited history of tenant subscription activations linked to M-Pesa receipts (one
                receipt per subscription).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {subscriptionLogs.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : subscriptionLogs.data && subscriptionLogs.data.length > 0 ? (
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 border-b text-muted-foreground uppercase text-xs">
                      <tr>
                        <th className="p-3">Business</th>
                        <th className="p-3">M-Pesa Receipt</th>
                        <th className="p-3">Days Added</th>
                        <th className="p-3">Activated At</th>
                        <th className="p-3">New Expiry Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {subscriptionLogs.data.map((log: any) => (
                        <tr key={log.id} className="hover:bg-muted/30">
                          <td className="p-3 font-medium">{log.tenantName}</td>
                          <td className="p-3 font-mono text-xs">
                            {log.receipt ? (
                              <Badge
                                variant="outline"
                                className="font-mono text-xs bg-success/10 text-success border-success/30"
                              >
                                {log.receipt}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground italic">
                                Manual / No Receipt
                              </span>
                            )}
                          </td>
                          <td className="p-3">+{log.days} days</td>
                          <td className="p-3 text-muted-foreground text-xs">
                            {new Date(log.activatedAt).toLocaleString()}
                          </td>
                          <td className="p-3 font-medium">
                            {log.nextEnd ? new Date(log.nextEnd).toLocaleDateString() : "N/A"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  No subscription renewal logs recorded yet.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diagnostics" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="size-5 text-primary" /> Tenant Subscription & Receipt
                Diagnostics Dashboard
              </CardTitle>
              <CardDescription>
                Compares active/remaining subscription days against total verified M-Pesa receipts
                and flags any data inconsistencies.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {diagnosticsQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : diagnosticsQuery.data?.diagnostics &&
                diagnosticsQuery.data.diagnostics.length > 0 ? (
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 border-b text-muted-foreground uppercase text-xs">
                      <tr>
                        <th className="p-3">Business</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Remaining Days</th>
                        <th className="p-3">Verified Receipts</th>
                        <th className="p-3">Total Paid (KES)</th>
                        <th className="p-3">Diagnostic Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {diagnosticsQuery.data.diagnostics.map((d: any) => (
                        <tr
                          key={d.tenantId}
                          className={cn(
                            "hover:bg-muted/30",
                            d.hasDiscrepancy && "bg-destructive/5",
                          )}
                        >
                          <td className="p-3 font-medium">
                            <div>{d.tenantName}</div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {d.tenantSlug}
                            </div>
                          </td>
                          <td className="p-3">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs uppercase font-semibold",
                                d.status === "active" &&
                                  "bg-success/10 text-success border-success/30",
                                d.status === "trialing" &&
                                  "bg-primary/10 text-primary border-primary/30",
                                d.status === "expired" &&
                                  "bg-destructive/10 text-destructive border-destructive/30",
                              )}
                            >
                              {d.status}
                            </Badge>
                          </td>
                          <td className="p-3 font-semibold">
                            {d.remainingDays > 0 ? (
                              `${d.remainingDays} days`
                            ) : (
                              <span className="text-destructive">Expired</span>
                            )}
                          </td>
                          <td className="p-3 font-mono text-xs">
                            {d.totalReceiptsCount > 0 ? (
                              <div className="space-y-1">
                                <Badge variant="secondary" className="font-mono text-xs">
                                  {d.totalReceiptsCount} receipt(s)
                                </Badge>
                                <div className="text-muted-foreground text-[10px] truncate max-w-[150px]">
                                  {d.verifiedReceipts.join(", ")}
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground italic">No receipts</span>
                            )}
                          </td>
                          <td className="p-3 font-medium">KES {d.totalPaidKes.toLocaleString()}</td>
                          <td className="p-3">
                            {d.hasDiscrepancy ? (
                              <div className="flex items-center gap-1.5 text-destructive text-xs font-semibold">
                                <AlertTriangle className="size-4 shrink-0" />
                                <div>
                                  <div>Discrepancy Flagged</div>
                                  <ul className="list-disc list-inside text-[11px] font-normal text-muted-foreground">
                                    {d.discrepancies.map((disc: string, idx: number) => (
                                      <li key={idx}>{disc}</li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-success text-xs font-medium">
                                <CheckCircle2 className="size-4 shrink-0" />
                                <span>Consistent</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  No tenant subscription diagnostics available.
                </div>
              )}
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
