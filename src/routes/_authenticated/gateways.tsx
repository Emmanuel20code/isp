import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { getMyContext } from "@/lib/tenancy.functions";
import {
  getTenantGateways,
  updateTenantCountry,
  saveTenantGatewayConfig,
  testTenantGatewayConnection,
} from "@/lib/gateways.server";
import { COUNTRIES_AND_PROVIDERS, PaymentProviderDefinition } from "@/lib/payment-providers";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  CreditCard,
  CheckCircle2,
  ShieldCheck,
  Loader2,
  Globe,
  KeyRound,
  ArrowRight,
  AlertCircle,
  Zap,
  Building2,
  PhoneCall,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/gateways")({
  head: () => ({
    meta: [
      { title: "Payment Gateways · Wifi Billing Wi-Fi Billing" },
      {
        name: "description",
        content: "Configure country-specific payment gateway providers and secure credentials.",
      },
      { property: "og:title", content: "Payment Gateways · Wifi Billing" },
      { property: "og:description", content: "Manage country payment providers securely." },
    ],
  }),
  component: GatewaysPage,
});

function GatewaysPage() {
  const qc = useQueryClient();
  const fetchContext = useServerFn(getMyContext);
  const getGatewaysFn = useServerFn(getTenantGateways);
  const updateCountryFn = useServerFn(updateTenantCountry);
  const saveGatewayFn = useServerFn(saveTenantGatewayConfig);
  const testConnectionFn = useServerFn(testTenantGatewayConnection);

  const { data: ctxData, isPending: ctxPending } = useQuery({
    queryKey: ["my-context"],
    queryFn: () => fetchContext(),
  });

  const tenantId = ctxData?.tenant?.id;

  const {
    data: gatewayData,
    isPending: gwPending,
    refetch,
  } = useQuery({
    queryKey: ["tenant-gateways", tenantId],
    queryFn: () => getGatewaysFn({ data: { tenantId: tenantId! } }),
    enabled: !!tenantId,
  });

  const [selectedCountry, setSelectedCountry] = useState<string>("Kenya");
  const [activeProvider, setActiveProvider] = useState<PaymentProviderDefinition | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [testing, setTesting] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (gatewayData?.country) {
      setSelectedCountry(gatewayData.country);
    }
  }, [gatewayData?.country]);

  const countryMutation = useMutation({
    mutationFn: (country: string) => updateCountryFn({ data: { tenantId: tenantId!, country } }),
    onSuccess: async (_, country) => {
      setSelectedCountry(country);
      toast.success(`Country updated to ${country}. Available providers updated.`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["tenant-gateways", tenantId] }),
        qc.invalidateQueries({ queryKey: ["my-context"] }),
      ]);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const availableProviders = COUNTRIES_AND_PROVIDERS[selectedCountry] || [];

  const handleOpenConfig = (provider: PaymentProviderDefinition) => {
    setActiveProvider(provider);
    // Find existing configured values if any
    const existing = (gatewayData?.gateways || []).find(
      (g: Record<string, unknown>) => g.provider_id === provider.id,
    );
    const initial: Record<string, string> = {};
    provider.fields.forEach((f) => {
      initial[f.key] =
        existing?.credentials?.[f.key] || (f.type === "select" ? f.options?.[0]?.value || "" : "");
    });
    setFormData(initial);
    setIsEnabled(existing ? existing.is_enabled : true);
  };

  const handleTestConnection = async () => {
    if (!tenantId || !activeProvider) return;
    setTesting(true);
    try {
      const res = await testConnectionFn({
        data: {
          tenantId,
          providerId: activeProvider.id,
          credentials: formData,
        },
      });
      if (res.success) {
        toast.success(res.message);
        await refetch();
      } else {
        toast.error(res.message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test connection failed");
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !activeProvider) return;
    setSaving(true);
    try {
      await saveGatewayFn({
        data: {
          tenantId,
          providerId: activeProvider.id,
          country: selectedCountry,
          credentials: formData,
          isEnabled,
        },
      });
      toast.success(`${activeProvider.name} configuration saved securely!`);
      setActiveProvider(null);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell
      isSuperAdmin={ctxData?.isSuperAdmin ?? false}
      title={ctxData?.tenant?.name ?? undefined}
    >
      <div className="max-w-5xl space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
              <CreditCard className="size-6 text-primary" /> Payment Gateway Settings
            </h1>
            <p className="text-sm text-muted-foreground">
              Select your operating country and configure country-specific mobile money and payment
              collection gateways securely.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Globe className="size-3.5 text-primary" /> Country:
            </span>
            <Select
              value={selectedCountry}
              onValueChange={(val) => countryMutation.mutate(val)}
              disabled={countryMutation.isPending || ctxPending}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(COUNTRIES_AND_PROVIDERS).map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {ctxPending || gwPending ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        ) : (
          <div className="space-y-6">
            {selectedCountry === "Kenya" && (
              <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-background p-5 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground font-bold shadow-md">
                      <Zap className="size-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-foreground">
                          Default System M-Pesa Flow Active (Kenya)
                        </h2>
                        <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[11px]">
                          Zero Setup Required
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Your ISP business automatically uses the platform-managed Safaricom Daraja
                        M-Pesa STK push integration.
                      </p>
                    </div>
                  </div>
                  <Link
                    to="/settings"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                  >
                    <Building2 className="size-3.5" />
                    Manage Till/Paybill in Settings &rarr;
                  </Link>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 pt-2 text-xs border-t border-primary/20">
                  <div className="space-y-1">
                    <span className="text-muted-foreground font-medium flex items-center gap-1">
                      <CheckCircle2 className="size-3.5 text-emerald-500" /> STK Push Flow:
                    </span>
                    <p className="font-semibold text-foreground">Automatic Platform Daraja API</p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-muted-foreground font-medium flex items-center gap-1">
                      <Building2 className="size-3.5 text-primary" /> Destination Shortcode:
                    </span>
                    <p className="font-semibold text-foreground">
                      {gatewayData?.tenantDetails?.mpesaShortcode ? (
                        <>
                          {gatewayData.tenantDetails.mpesaShortcodeKind === "paybill"
                            ? "Paybill "
                            : "Till "}
                          {gatewayData.tenantDetails.mpesaShortcode}
                        </>
                      ) : (
                        <span className="text-amber-500 font-normal">
                          Not set yet (Set in Business Settings)
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-muted-foreground font-medium flex items-center gap-1">
                      <PhoneCall className="size-3.5 text-primary" /> Captive Hotspot:
                    </span>
                    <p className="font-semibold text-foreground">Instant Voucher Auto-Activation</p>
                  </div>
                </div>

                <div className="bg-background/80 rounded-xl p-3 border border-border/60 text-xs text-muted-foreground flex items-start gap-2">
                  <AlertCircle className="size-4 text-primary shrink-0 mt-0.5" />
                  <p>
                    <strong>Notice:</strong> For Kenyan tenants, you do not need to register a
                    custom Daraja API developer app. By default, customer Wi-Fi payments and your
                    SaaS renewals run seamlessly on our integrated M-Pesa pipeline. If you have your
                    own dedicated Daraja credentials, you can still configure your custom gateway
                    below.
                  </p>
                </div>
              </div>
            )}

            <div className="grid gap-6 md:grid-cols-2">
              {availableProviders.map((provider) => {
                const configured = (gatewayData?.gateways || []).find(
                  (g: Record<string, unknown>) => g.provider_id === provider.id,
                );
                const isVerified = configured?.is_verified;
                const isGwEnabled = configured?.is_enabled;
                const isDefaultMpesa =
                  selectedCountry === "Kenya" && provider.id === "safaricom_mpesa";

                return (
                  <Card
                    key={provider.id}
                    className="relative overflow-hidden border-border/80 bg-card/60 backdrop-blur-xl transition-all duration-300 hover:border-primary/50 hover:shadow-xl"
                  >
                    <div className="absolute top-4 right-4 flex items-center gap-2">
                      {isDefaultMpesa && !configured && (
                        <Badge
                          variant="secondary"
                          className="bg-primary/10 text-primary border-primary/20"
                        >
                          System Default Active
                        </Badge>
                      )}
                      <Badge
                        variant={isGwEnabled && isVerified ? "default" : "outline"}
                        className={
                          isGwEnabled && isVerified
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                            : ""
                        }
                      >
                        {isGwEnabled && isVerified
                          ? "Custom & Verified"
                          : configured
                            ? "Custom Configured"
                            : "Standby"}
                      </Badge>
                    </div>

                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary font-display font-bold text-sm">
                          {provider.logoBadge}
                        </span>
                        <div>
                          <CardTitle className="text-lg">{provider.name}</CardTitle>
                          <CardDescription className="text-xs">
                            Currency: {provider.currency} · {provider.country}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {isDefaultMpesa
                          ? "Active by default using platform Daraja infrastructure. Optionally override with your own custom Paybill/Till Daraja API keys below."
                          : provider.description}
                      </p>

                      <div className="flex items-center justify-between pt-2 border-t border-border/60">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <KeyRound className="size-3.5 text-primary" />
                          {provider.fields.length} required fields
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleOpenConfig(provider)}
                          className="gap-1.5"
                        >
                          {configured
                            ? "Edit Custom Keys"
                            : isDefaultMpesa
                              ? "Override Keys"
                              : "Connect Provider"}{" "}
                          <ArrowRight className="size-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Configuration Dialog */}
        <Dialog open={!!activeProvider} onOpenChange={(open) => !open && setActiveProvider(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            {activeProvider && (
              <form onSubmit={handleSaveConfig} className="space-y-5">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary text-xs font-bold">
                      {activeProvider.logoBadge}
                    </span>
                    Configure {activeProvider.name}
                  </DialogTitle>
                  <DialogDescription>
                    Enter your merchant API credentials for {activeProvider.country} (
                    {activeProvider.currency}). Credentials are encrypted securely and kept isolated
                    to your tenant business.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3 border border-border/60">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-semibold">Enable Payment Gateway</Label>
                      <p className="text-xs text-muted-foreground">
                        Allow customer payments and subscription renewals via this provider.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={(e) => setIsEnabled(e.target.checked)}
                      className="size-4 rounded border-border text-primary focus:ring-primary"
                    />
                  </div>

                  {activeProvider.fields.map((field) => (
                    <div key={field.key} className="space-y-1.5">
                      <Label htmlFor={field.key} className="text-xs font-semibold">
                        {field.label}{" "}
                        {field.required && <span className="text-destructive">*</span>}
                      </Label>
                      {field.type === "select" ? (
                        <Select
                          value={formData[field.key] || ""}
                          onValueChange={(val) => setFormData({ ...formData, [field.key]: val })}
                        >
                          <SelectTrigger id={field.key}>
                            <SelectValue placeholder={`Select ${field.label}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {field.options?.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id={field.key}
                          type={field.type}
                          value={formData[field.key] || ""}
                          onChange={(e) =>
                            setFormData({ ...formData, [field.key]: e.target.value })
                          }
                          placeholder={field.placeholder}
                          required={field.required}
                        />
                      )}
                    </div>
                  ))}

                  <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold flex items-center gap-1.5 text-primary">
                        <ShieldCheck className="size-4" /> Test Connection Step
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleTestConnection}
                        disabled={testing}
                        className="h-8 text-xs bg-background"
                      >
                        {testing ? (
                          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="mr-1.5 size-3.5 text-emerald-500" />
                        )}
                        Test Connection
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-normal">
                      Click test connection to validate your API credentials with{" "}
                      {activeProvider.name} before saving and enabling payments.
                    </p>
                  </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                  <Button type="button" variant="outline" onClick={() => setActiveProvider(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="mr-2 size-4 animate-spin" />} Save & Secure
                    Gateway
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
