import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getMyContext } from "@/lib/tenancy.functions";
import { getSubscriptionHistory, checkAndUpdateSubscription } from "@/lib/payments.functions";
import { computeBillingState } from "@/lib/subscription";
import { getCurrencyByCountry } from "@/lib/payment-providers";
import { AppShell } from "@/components/AppShell";
import { RenewDialog } from "@/components/RenewDialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Zap,
  Calendar,
  CreditCard,
  History,
  AlertCircle,
  Loader2,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/subscription")({
  head: () => ({
    meta: [
      { title: "Subscription · SaaS Billing" },
      {
        name: "description",
        content: "Manage your SaaS platform subscription, view renewal history and billing status.",
      },
    ],
  }),
  component: SubscriptionPage,
});

function SubscriptionPage() {
  const fetchContext = useServerFn(getMyContext);
  const fetchHistory = useServerFn(getSubscriptionHistory);

  const ctx = useQuery({ queryKey: ["my-context"], queryFn: () => fetchContext() });
  const history = useQuery({
    queryKey: ["subscription-history"],
    queryFn: () => fetchHistory(),
    enabled: !!ctx.data?.tenant?.id,
  });

  const [checking, setChecking] = useState(false);
  const checkStatusFn = useServerFn(checkAndUpdateSubscription);
  const queryClient = useQueryClient();

  // Automatically check payment status on mount if tenant exists
  useEffect(() => {
    if (ctx.data?.tenant?.id) {
      checkStatusFn()
        .then((res) => {
          if (res?.newlyActivated) {
            toast.success(
              res.message || "Subscription automatically activated upon payment confirmation!",
            );
            ctx.refetch();
            history.refetch();
            queryClient.invalidateQueries({ queryKey: ["my-context"] });
          }
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.data?.tenant?.id]);

  async function handleCheckStatus() {
    setChecking(true);
    try {
      const res = await checkStatusFn();
      await ctx.refetch();
      await history.refetch();
      await queryClient.invalidateQueries({ queryKey: ["my-context"] });

      if (res.newlyActivated) {
        toast.success(
          res.message || "Payment confirmed! SaaS Subscription automatically activated.",
        );
      } else if (res.subscription_status === "active") {
        toast.success(
          res.message || `Subscription is active! ${res.days_remaining} day(s) remaining.`,
        );
      } else {
        toast.info(
          res.message ||
            "No completed payment found in database yet. Completed M-Pesa payments activate automatically.",
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to query database status");
    } finally {
      setChecking(false);
    }
  }

  if (ctx.isPending || !ctx.data?.tenant) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppShell>
    );
  }

  const tenant = ctx.data.tenant;
  const platform = ctx.data.platform;
  const billing = computeBillingState(tenant, platform?.warning_days ?? 5);
  const currency = getCurrencyByCountry(tenant.country);
  const price = platform?.subscription_price_kes ?? 1500;

  const isKenya = tenant.country === "Kenya";
  const providerName = isKenya ? "M-Pesa" : "Mobile Money";

  return (
    <AppShell isSuperAdmin={ctx.data.isSuperAdmin} title={tenant.name}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Zap className="size-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">SaaS Subscription</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCheckStatus}
          disabled={checking}
          className="gap-1.5 text-xs font-semibold"
        >
          {checking ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5 text-primary" />
          )}
          Sync Payment & Status
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="size-4" /> Current Status
              </CardTitle>
              <CardDescription>
                Your business access to the Wifi Billing billing platform.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-muted/30 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <div className="flex items-center gap-2">
                    <Badge
                      className={
                        billing.isEntitled
                          ? "bg-success/15 text-success hover:bg-success/15"
                          : "bg-destructive/15 text-destructive hover:bg-destructive/15"
                      }
                    >
                      {billing.label}
                    </Badge>
                    {!billing.isEntitled && (
                      <span className="flex items-center gap-1 text-xs text-destructive font-medium">
                        <AlertCircle className="size-3" /> Access Suspended
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Next Renewal</p>
                  <p className="text-base font-bold">
                    {billing.endsAt?.toLocaleDateString() ?? "Not set"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Pricing</p>
                  <p className="text-base font-bold">
                    {currency} {price.toLocaleString()} / 30 days
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Automated SaaS Activation</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    When you make a payment via {providerName}, the system automatically checks
                    network records in real-time and extends your SaaS subscription by 30 days
                    without interruption.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <RenewDialog
                    price={price}
                    currency={currency}
                    defaultPhone={tenant.business_phone ?? ctx.data.profile?.phone}
                  >
                    <Button size="lg" className="w-full sm:w-auto font-bold gap-2">
                      <Zap className="size-4 fill-current" />
                      Renew Now with {providerName} STK Push
                    </Button>
                  </RenewDialog>

                  <Button
                    size="lg"
                    variant="outline"
                    onClick={handleCheckStatus}
                    disabled={checking}
                    className="w-full sm:w-auto gap-2"
                  >
                    {checking ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                    Check Database Payment Status
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="size-4" /> Renewal History
              </CardTitle>
              <CardDescription>
                A record of your recent SaaS platform subscription payments.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {history.isPending ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : history.data?.length === 0 ? (
                <div className="text-center py-10 border rounded-md border-dashed">
                  <Calendar className="size-8 text-muted-foreground mx-auto mb-2 opacity-20" />
                  <p className="text-sm text-muted-foreground">No renewal history found yet.</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Plan
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Expiry
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {history.data?.map((sub) => (
                        <tr key={sub.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-medium">
                            {new Date(sub.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 capitalize text-muted-foreground">
                            {sub.plan_type}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {new Date(sub.expiry_date).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Badge
                              variant="outline"
                              className="bg-success/5 text-success border-success/20"
                            >
                              {sub.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="text-base text-primary flex items-center gap-2">
                <CheckCircle2 className="size-4 text-primary" /> Automated Billing
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground leading-relaxed space-y-3">
              <p>
                When you initiate a {providerName} STK push or send funds, the payment gateway sends
                an instant confirmation directly into the database.
              </p>
              <p>
                The automated billing engine immediately matches the payment transaction, activates
                your SaaS subscription, and extends your expiry date without requiring any manual
                intervention.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
