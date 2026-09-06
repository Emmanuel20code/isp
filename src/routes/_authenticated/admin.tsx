import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyContext, getPlatformOverview } from "@/lib/tenancy.functions";
import { computeBillingState } from "@/lib/subscription";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Platform admin · Wifi Billing" },
      {
        name: "description",
        content:
          "Platform owner view of every ISP business, trial and subscription on Wifi Billing.",
      },
      { property: "og:title", content: "Platform admin · Wifi Billing" },
      { property: "og:description", content: "Manage every ISP business on the platform." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const fetchContext = useServerFn(getMyContext);
  const fetchOverview = useServerFn(getPlatformOverview);
  const ctx = useQuery({ queryKey: ["my-context"], queryFn: () => fetchContext() });
  const overview = useQuery({
    queryKey: ["platform-overview"],
    queryFn: () => fetchOverview(),
    enabled: ctx.data?.isSuperAdmin === true,
    retry: false,
  });

  if (ctx.isPending) {
    return (
      <AppShell>
        <Skeleton className="h-40 w-full" />
      </AppShell>
    );
  }

  if (!ctx.data?.isSuperAdmin) {
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

  const tenants = overview.data?.tenants ?? [];
  const warningDays = ctx.data.platform?.warning_days ?? 5;

  return (
    <AppShell isSuperAdmin>
      <h1 className="text-2xl font-bold">Platform</h1>
      <p className="text-sm text-muted-foreground">Every ISP business on Wifi Billing.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Businesses</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-bold">{tenants.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>On trial</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-bold">
              {tenants.filter((t) => t.subscription_status === "trialing").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Paying</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-bold">
              {tenants.filter((t) => t.subscription_status === "active").length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Businesses</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No businesses yet.
                  </TableCell>
                </TableRow>
              )}
              {tenants.map((t) => {
                const billing = computeBillingState(t, warningDays);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{t.business_phone}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          billing.isEntitled
                            ? "bg-success/15 text-success hover:bg-success/15"
                            : "bg-destructive/15 text-destructive hover:bg-destructive/15"
                        }
                      >
                        {billing.label}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(t.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}
