import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useMemo } from "react";
import {
  listNetwork,
  createPackage,
  setPackageActive,
  deletePackage,
} from "@/lib/network.functions";
import { getMyContext, updatePortalSettings } from "@/lib/tenancy.functions";
import { formatPackageDuration } from "@/lib/billing-helpers";
import { getCurrencyByCountry } from "@/lib/payment-providers";
import { CaptivePortalView } from "@/components/portal/CaptivePortalView";
import {
  PortalPackage,
  PortalTenantSettings,
  startPortalPurchase,
  getPortalPurchase,
  redeemPortalVoucher,
} from "@/lib/portal.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Loader2,
  Clock,
  Zap,
  Trash2,
  Palette,
  ExternalLink,
  Smartphone,
  Sparkles,
  Layers,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/packages")({
  head: () => ({
    meta: [
      { title: "Packages · Wifi Billing Wi-Fi Billing" },
      {
        name: "description",
        content: "Create hotspot and PPPoE Wi-Fi packages with speed, duration and price in KES.",
      },
      { property: "og:title", content: "Packages · Wifi Billing" },
      { property: "og:description", content: "Create Wi-Fi packages priced in KES." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PackagesPage,
});

function PackagesPage() {
  const qc = useQueryClient();
  const fetchNetwork = useServerFn(listNetwork);
  const fetchContext = useServerFn(getMyContext);
  const add = useServerFn(createPackage);
  const toggle = useServerFn(setPackageActive);
  const remove = useServerFn(deletePackage);

  const ctx = useQuery({ queryKey: ["my-context"], queryFn: () => fetchContext() });
  const currency = getCurrencyByCountry(ctx.data?.tenant?.country);
  const { data, isPending } = useQuery({ queryKey: ["network"], queryFn: () => fetchNetwork() });

  const startPay = useServerFn(startPortalPurchase);
  const checkPay = useServerFn(getPortalPurchase);
  const redeemVoucher = useServerFn(redeemPortalVoucher);

  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [redeemedData, setRedeemedData] = useState<{
    code: string;
    packageName: string;
    expiresAt: string | null;
  } | null>(null);

  const pay = useMutation({
    mutationFn: ({ packageId, phone }: { packageId: string; phone: string }) =>
      startPay({ data: { slug: ctx.data?.tenant?.slug || "preview", packageId, phone } }),
    onSuccess: (res) => {
      setCheckoutId(res.checkoutRequestId);
      setWaiting(true);
      toast.success(res.message ?? "Check your phone to enter your M-Pesa PIN");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const redeem = useMutation({
    mutationFn: (voucherCode: string) =>
      redeemVoucher({ data: { slug: ctx.data?.tenant?.slug || "preview", code: voucherCode } }),
    onSuccess: (res) => {
      setRedeemedData({
        code: res.code,
        packageName: res.packageName,
        expiresAt: res.expiresAt,
      });
      toast.success("Voucher activated successfully!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!checkoutId || !waiting) return;
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      const res = await checkPay({ data: { checkoutRequestId: checkoutId } });
      if (res.status === "success") {
        setCode(res.code);
        setWaiting(false);
        clearInterval(timer);
      } else if (res.status === "failed" || res.status === "cancelled") {
        setWaiting(false);
        clearInterval(timer);
        toast.error(res.failureReason ?? "Payment was not completed");
      } else if (tries > 35) {
        setWaiting(false);
        clearInterval(timer);
        toast.error("Still waiting for M-Pesa. Check your messages, then refresh.");
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [checkoutId, waiting, checkPay]);

  const updatePortal = useServerFn(updatePortalSettings);

  const [portalForm, setPortalForm] = useState({
    portalTitle: "",
    portalSubtitle: "",
    brandColor: "#00A8E8",
    accentColor: "#f97316",
    themePreset: "midnight" as "midnight" | "obsidian" | "sapphire" | "light",
    announcementText: "",
    cardStyle: "pill" as "pill" | "modern" | "minimal",
    logoUrl: "",
    supportPhone: "",
  });

  useEffect(() => {
    if (ctx.data?.tenantSettings) {
      const s = ctx.data.tenantSettings;
      setPortalForm({
        portalTitle: s.portal_title ?? "",
        portalSubtitle: s.portal_subtitle ?? "",
        brandColor: s.brand_color ?? "#00A8E8",
        accentColor: (s as unknown as { accent_color?: string })?.accent_color ?? "#f97316",
        themePreset:
          ((s as unknown as { theme_preset?: string })?.theme_preset as
            "midnight" | "obsidian" | "sapphire" | "light") ?? "midnight",
        announcementText: (s as unknown as { announcement_text?: string })?.announcement_text ?? "",
        cardStyle:
          ((s as unknown as { card_style?: string })?.card_style as
            "pill" | "modern" | "minimal") ?? "pill",
        logoUrl: s.logo_url ?? "",
        supportPhone: s.support_phone ?? "",
      });
    }
  }, [ctx.data?.tenantSettings]);

  const portalMutation = useMutation({
    mutationFn: () =>
      updatePortal({
        data: {
          tenantId: ctx.data!.tenant!.id,
          portalTitle: portalForm.portalTitle.trim() || null,
          portalSubtitle: portalForm.portalSubtitle.trim() || null,
          brandColor: portalForm.brandColor,
          accentColor: portalForm.accentColor,
          themePreset: portalForm.themePreset,
          announcementText: portalForm.announcementText.trim() || null,
          cardStyle: portalForm.cardStyle,
          logoUrl: portalForm.logoUrl.trim() || null,
          supportPhone: portalForm.supportPhone.trim() || null,
        },
      }),
    onSuccess: async () => {
      toast.success("Portal appearance settings saved!");
      await qc.invalidateQueries({ queryKey: ["my-context"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save portal settings"),
  });

  const [form, setForm] = useState({
    name: "",
    kind: "hotspot" as "hotspot" | "pppoe",
    priceKes: "50",
    durationValue: "24",
    durationUnit: "hours" as "minutes" | "hours" | "days",
    speedDownMbps: "5",
    speedUpMbps: "5",
    deviceLimit: "1",
  });

  const computedDurationHours = useMemo(() => {
    const num = parseFloat(form.durationValue);
    if (isNaN(num) || num <= 0) return 1;
    if (form.durationUnit === "minutes") {
      // Exact fractional hours (e.g., 30m = 0.5h, 15m = 0.25h)
      return Math.round((num / 60) * 1000000) / 1000000;
    }
    if (form.durationUnit === "days") {
      return Math.round(num * 24 * 100) / 100;
    }
    return Math.round(num * 100) / 100;
  }, [form.durationValue, form.durationUnit]);

  const PRESET_DURATIONS = [
    { label: "15 Mins", value: "15", unit: "minutes" as const },
    { label: "30 Mins", value: "30", unit: "minutes" as const },
    { label: "1 Hr", value: "1", unit: "hours" as const },
    { label: "3 Hrs", value: "3", unit: "hours" as const },
    { label: "6 Hrs", value: "6", unit: "hours" as const },
    { label: "12 Hrs", value: "12", unit: "hours" as const },
    { label: "24 Hrs", value: "24", unit: "hours" as const },
    { label: "3 Days", value: "3", unit: "days" as const },
    { label: "7 Days", value: "7", unit: "days" as const },
    { label: "30 Days", value: "30", unit: "days" as const },
  ];

  const createMutation = useMutation({
    mutationFn: () =>
      add({
        data: {
          name: form.name,
          kind: form.kind,
          priceKes: Number(form.priceKes),
          durationHours: computedDurationHours,
          speedDownMbps: Number(form.speedDownMbps),
          speedUpMbps: Number(form.speedUpMbps),
          deviceLimit: Number(form.deviceLimit),
        },
      }),
    onSuccess: async () => {
      setForm((f) => ({ ...f, name: "" }));
      toast.success("Package created");
      await qc.invalidateQueries({ queryKey: ["network"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create package"),
  });

  const toggleMutation = useMutation({
    mutationFn: (v: { id: string; isActive: boolean }) => toggle({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["network"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update package"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: async () => {
      toast.success("Package deleted successfully");
      await qc.invalidateQueries({ queryKey: ["network"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete package"),
  });

  return (
    <AppShell isSuperAdmin={ctx.data?.isSuperAdmin ?? false}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Packages</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What your customers buy: a speed, a time window and a price in {currency}.
          </p>
        </div>
        <Link to="/datagrid">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <Layers className="size-3.5 text-primary" /> Open Data Grid View
          </Button>
        </Link>
      </div>

      {ctx.data?.tenant?.slug ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Your captive portal link</p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {`${typeof window === "undefined" ? "" : window.location.origin}/portal/${ctx.data.tenant.slug}`}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(
                `${window.location.origin}/portal/${ctx.data!.tenant!.slug}`,
              );
              toast.success("Portal link copied");
            }}
          >
            Copy link
          </Button>
        </div>
      ) : null}

      <Tabs defaultValue="packages" className="mt-6">
        <TabsList>
          <TabsTrigger value="packages">Data Packages</TabsTrigger>
          <TabsTrigger value="portal">Captive Portal</TabsTrigger>
        </TabsList>
        <TabsContent value="packages" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>New package</CardTitle>
                <CardDescription>Hotspot vouchers or PPPoE home plans.</CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createMutation.mutate();
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="pname">Name</Label>
                    <Input
                      id="pname"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                      minLength={2}
                      placeholder="Daily 5Mbps"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <div className="flex gap-2">
                      {(["hotspot", "pppoe"] as const).map((k) => (
                        <Button
                          key={k}
                          type="button"
                          variant={form.kind === k ? "default" : "outline"}
                          size="sm"
                          onClick={() => setForm({ ...form, kind: k })}
                        >
                          {k === "hotspot" ? "Hotspot" : "PPPoE"}
                        </Button>
                      ))}
                    </div>
                  </div>
                  {/* Duration Selector with Minutes, Hours, Days */}
                  <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="duration-val"
                        className="text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Clock className="size-3.5 text-primary" /> Validity / Duration
                      </Label>
                      <Badge
                        variant="secondary"
                        className="font-mono text-[11px] font-medium text-primary"
                      >
                        {formatPackageDuration(computedDurationHours)}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-[1fr_130px] gap-2">
                      <Input
                        id="duration-val"
                        type="number"
                        min={1}
                        step={1}
                        value={form.durationValue}
                        onChange={(e) => setForm({ ...form, durationValue: e.target.value })}
                        placeholder={
                          form.durationUnit === "minutes"
                            ? "e.g. 60"
                            : form.durationUnit === "days"
                              ? "e.g. 7"
                              : "e.g. 24"
                        }
                        required
                        className="bg-background"
                      />
                      <Select
                        value={form.durationUnit}
                        onValueChange={(val: "minutes" | "hours" | "days") =>
                          setForm({ ...form, durationUnit: val })
                        }
                      >
                        <SelectTrigger id="duration-unit" className="w-full bg-background">
                          <SelectValue placeholder="Unit" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="minutes">Minutes (m)</SelectItem>
                          <SelectItem value="hours">Hours (h)</SelectItem>
                          <SelectItem value="days">Days (d)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Quick Presets */}
                    <div className="flex flex-wrap items-center gap-1 pt-1">
                      <span className="text-[10px] text-muted-foreground mr-0.5">Presets:</span>
                      {PRESET_DURATIONS.map((preset) => {
                        const isSelected =
                          form.durationValue === preset.value && form.durationUnit === preset.unit;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                durationValue: preset.value,
                                durationUnit: preset.unit,
                              }))
                            }
                            className={`px-2 py-0.5 text-[10px] rounded-md border transition-all ${
                              isSelected
                                ? "bg-primary text-primary-foreground border-primary font-semibold"
                                : "bg-background text-muted-foreground border-border/80 hover:border-foreground/30 hover:text-foreground"
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2 col-span-2 sm:col-span-1">
                      <Label htmlFor="price">Price ({currency})</Label>
                      <Input
                        id="price"
                        type="number"
                        min={0}
                        value={form.priceKes}
                        onChange={(e) => setForm({ ...form, priceKes: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2 col-span-2 sm:col-span-1">
                      <Label htmlFor="devices">Device Limit</Label>
                      <Input
                        id="devices"
                        type="number"
                        min={1}
                        value={form.deviceLimit}
                        onChange={(e) => setForm({ ...form, deviceLimit: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="down">Down (Mbps)</Label>
                      <Input
                        id="down"
                        type="number"
                        min={1}
                        value={form.speedDownMbps}
                        onChange={(e) => setForm({ ...form, speedDownMbps: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="up">Up (Mbps)</Label>
                      <Input
                        id="up"
                        type="number"
                        min={1}
                        value={form.speedUpMbps}
                        onChange={(e) => setForm({ ...form, speedUpMbps: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                    {createMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                    Create package
                  </Button>
                </form>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {isPending && <Skeleton className="h-32 w-full" />}
              {!isPending && (data?.packages.length ?? 0) === 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>No packages yet</CardTitle>
                    <CardDescription>Create your first plan to start selling.</CardDescription>
                  </CardHeader>
                </Card>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {data?.packages.map((p) => (
                  <Card key={p.id}>
                    <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                      <div>
                        <CardTitle className="text-base">{p.name}</CardTitle>
                        <CardDescription>
                          {p.kind === "hotspot" ? "Hotspot" : "PPPoE"}
                        </CardDescription>
                      </div>
                      <Badge variant="outline">
                        {currency} {p.price_kes}
                      </Badge>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-muted-foreground">
                      <p>
                        {p.speed_down_mbps}/{p.speed_up_mbps} Mbps ·{" "}
                        <span className="font-medium text-foreground">
                          {formatPackageDuration(p.duration_hours)}
                        </span>{" "}
                        · {p.device_limit} device{p.device_limit === 1 ? "" : "s"}
                      </p>
                      <div className="flex items-center justify-between pt-1 border-t border-border/40">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={p.is_active}
                            onCheckedChange={(v) =>
                              toggleMutation.mutate({ id: p.id, isActive: v })
                            }
                            aria-label={`Toggle ${p.name}`}
                          />
                          <span className="text-xs">{p.is_active ? "Selling" : "Hidden"}</span>
                        </div>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="size-3.5 mr-1" />
                              <span className="text-xs">Delete</span>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Delete package &ldquo;{p.name}&rdquo;?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently remove this package from your pricing catalog.
                                Any active customers assigned to this package will be safely
                                unlinked.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate(p.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete Package
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="portal" className="mt-6">
          <div className="grid gap-6 xl:grid-cols-[440px_1fr]">
            {/* Customizer Settings Form */}
            <Card className="h-fit">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                      <Palette className="size-5 text-primary" />
                      Captive Portal Customizer
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Customize branding, colors, and layout for your customer hotspot login screen.
                    </CardDescription>
                  </div>
                  <Sparkles className="size-4 text-amber-500 animate-pulse" />
                </div>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    portalMutation.mutate();
                  }}
                >
                  {/* Theme Presets */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Theme Preset</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: "midnight", name: "Midnight Navy", bg: "bg-[#07101E]" },
                        { id: "obsidian", name: "Obsidian Dark", bg: "bg-[#050505]" },
                        { id: "sapphire", name: "Sapphire Deep", bg: "bg-[#021024]" },
                        { id: "light", name: "Modern Light", bg: "bg-slate-100" },
                      ].map((th) => (
                        <button
                          key={th.id}
                          type="button"
                          onClick={() =>
                            setPortalForm({
                              ...portalForm,
                              themePreset: th.id as "midnight" | "obsidian" | "sapphire" | "light",
                            })
                          }
                          className={`flex items-center gap-2 p-2 rounded-lg border text-left text-xs transition ${
                            portalForm.themePreset === th.id
                              ? "border-primary bg-primary/10 font-bold"
                              : "border-border hover:bg-muted/50"
                          }`}
                        >
                          <span
                            className={`size-4 rounded-full border border-border shrink-0 ${th.bg}`}
                          />
                          <span className="truncate">{th.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Accent Color Selection */}
                  <div className="space-y-1.5">
                    <Label htmlFor="accentColor" className="text-xs font-semibold">
                      Accent Color
                    </Label>
                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        { color: "#f97316", name: "Orange" },
                        { color: "#10b981", name: "Emerald" },
                        { color: "#0ea5e9", name: "Sky Blue" },
                        { color: "#8b5cf6", name: "Violet" },
                        { color: "#f43f5e", name: "Rose" },
                        { color: "#f59e0b", name: "Amber" },
                      ].map((c) => (
                        <button
                          key={c.color}
                          type="button"
                          onClick={() => setPortalForm({ ...portalForm, accentColor: c.color })}
                          title={c.name}
                          className={`size-7 rounded-full transition-transform ${
                            portalForm.accentColor === c.color
                              ? "ring-2 ring-primary ring-offset-2 scale-110"
                              : "hover:scale-105"
                          }`}
                          style={{ backgroundColor: c.color }}
                        />
                      ))}
                      <div className="flex items-center gap-1.5 ml-auto">
                        <Input
                          id="accentColor"
                          type="color"
                          className="size-7 p-0.5 rounded-full cursor-pointer border-0"
                          value={portalForm.accentColor}
                          onChange={(e) =>
                            setPortalForm({ ...portalForm, accentColor: e.target.value })
                          }
                        />
                        <Input
                          value={portalForm.accentColor}
                          onChange={(e) =>
                            setPortalForm({ ...portalForm, accentColor: e.target.value })
                          }
                          className="w-24 h-7 text-xs font-mono uppercase px-2"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Card Style */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Package Card Layout Style</Label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: "pill", label: "Capsule Pill" },
                        { id: "modern", label: "Modern Card" },
                        { id: "minimal", label: "Minimalist" },
                      ].map((cs) => (
                        <button
                          key={cs.id}
                          type="button"
                          onClick={() =>
                            setPortalForm({
                              ...portalForm,
                              cardStyle: cs.id as "pill" | "modern" | "minimal",
                            })
                          }
                          className={`py-1.5 px-2 rounded-lg border text-center text-xs transition ${
                            portalForm.cardStyle === cs.id
                              ? "border-primary bg-primary/10 font-bold"
                              : "border-border hover:bg-muted/50"
                          }`}
                        >
                          {cs.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Title & Subtitle */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="portalTitle" className="text-xs font-semibold">
                        Portal Title
                      </Label>
                      <Input
                        id="portalTitle"
                        value={portalForm.portalTitle}
                        onChange={(e) =>
                          setPortalForm({ ...portalForm, portalTitle: e.target.value })
                        }
                        placeholder={ctx.data?.tenant?.name ?? "Wifi Billing Hotspot"}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="supportPhone" className="text-xs font-semibold">
                        Customer Care Phone
                      </Label>
                      <Input
                        id="supportPhone"
                        type="tel"
                        value={portalForm.supportPhone}
                        onChange={(e) =>
                          setPortalForm({ ...portalForm, supportPhone: e.target.value })
                        }
                        placeholder="0712345678"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="portalSubtitle" className="text-xs font-semibold">
                      Portal Subtitle / Instructions
                    </Label>
                    <Input
                      id="portalSubtitle"
                      value={portalForm.portalSubtitle}
                      onChange={(e) =>
                        setPortalForm({ ...portalForm, portalSubtitle: e.target.value })
                      }
                      placeholder="Select a package · Enter M-Pesa number · Complete payment"
                      className="h-8 text-xs"
                    />
                  </div>

                  {/* Announcement Banner (Optional) */}
                  <div className="space-y-1.5">
                    <Label htmlFor="announcementText" className="text-xs font-semibold">
                      Announcement Banner (Optional)
                    </Label>
                    <Input
                      id="announcementText"
                      value={portalForm.announcementText}
                      onChange={(e) =>
                        setPortalForm({ ...portalForm, announcementText: e.target.value })
                      }
                      placeholder="e.g. Flash Offer: Double speed on all 24hr plans today!"
                      className="h-8 text-xs"
                    />
                  </div>

                  {/* Logo URL */}
                  <div className="space-y-1.5">
                    <Label htmlFor="logoUrl" className="text-xs font-semibold">
                      Logo URL (Optional)
                    </Label>
                    <Input
                      id="logoUrl"
                      type="url"
                      value={portalForm.logoUrl}
                      onChange={(e) => setPortalForm({ ...portalForm, logoUrl: e.target.value })}
                      placeholder="https://example.com/logo.png"
                      className="h-8 text-xs"
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full font-semibold"
                    disabled={portalMutation.isPending}
                  >
                    {portalMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                    Save Portal Appearance
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Live Real-Time Preview Panel */}
            <div className="flex flex-col space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                  <Smartphone className="size-4 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground">
                    Live Portal Preview (Real-Time Interactive)
                  </span>
                </div>
                {ctx.data?.tenant?.slug && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => {
                        const url = `${window.location.origin}/portal/${ctx.data?.tenant?.slug}`;
                        navigator.clipboard.writeText(url);
                        toast.success("Public portal link copied to clipboard!");
                      }}
                    >
                      Copy Link
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => {
                        window.open(`/portal/${ctx.data?.tenant?.slug}`, "_blank");
                      }}
                    >
                      <ExternalLink className="size-3" />
                      Open Live Portal
                    </Button>
                  </div>
                )}
              </div>

              {/* Responsive Device Frame Container */}
              <div className="overflow-hidden rounded-2xl border bg-muted/40 p-3 sm:p-5 flex justify-center shadow-inner">
                <div className="w-full max-w-[420px] rounded-[2.5rem] border-4 border-slate-800/80 bg-[#07101E] shadow-2xl overflow-hidden min-h-[640px] flex flex-col relative">
                  {/* Phone Speaker Notch */}
                  <div className="h-5 bg-slate-900 flex items-center justify-center">
                    <div className="w-16 h-1 rounded-full bg-slate-700/60" />
                  </div>

                  {/* Render Live Dynamic Component */}
                  <div className="flex-1 overflow-y-auto">
                    <CaptivePortalView
                      tenant={
                        {
                          id: ctx.data?.tenant?.id ?? "preview",
                          slug: ctx.data?.tenant?.slug ?? "preview",
                          business_name: ctx.data?.tenant?.name ?? "Wifi Billing Wi-Fi",
                          portal_title: portalForm.portalTitle || null,
                          portal_subtitle: portalForm.portalSubtitle || null,
                          brand_color: portalForm.brandColor,
                          accent_color: portalForm.accentColor,
                          theme_preset: portalForm.themePreset,
                          announcement_text: portalForm.announcementText || null,
                          card_style: portalForm.cardStyle,
                          logo_url: portalForm.logoUrl || null,
                          support_phone: portalForm.supportPhone || null,
                        } as PortalTenantSettings
                      }
                      packages={
                        (data?.packages?.filter((p) => p.kind === "hotspot" && p.is_active) ??
                          []) as unknown as PortalPackage[]
                      }
                      onPay={(packageId, phone) => pay.mutate({ packageId, phone })}
                      onRedeemVoucher={(voucherCode) => redeem.mutate(voucherCode)}
                      isPaymentPending={pay.isPending}
                      isRedeemPending={redeem.isPending}
                      isWaitingForPin={waiting}
                      activeCode={code}
                      redeemedData={redeemedData}
                      onReset={() => {
                        setCode(null);
                        setRedeemedData(null);
                        setCheckoutId(null);
                        setWaiting(false);
                      }}
                      previewMode={false}
                    />
                  </div>

                  {/* Bottom Navigation Bar Pill */}
                  <div className="h-4 bg-slate-900 flex items-center justify-center">
                    <div className="w-24 h-1 rounded-full bg-slate-600/50" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
