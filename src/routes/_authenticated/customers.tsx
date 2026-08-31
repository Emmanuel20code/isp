import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listCustomers,
  createCustomer,
  setCustomerStatus,
  deleteCustomer,
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
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({
    meta: [
      { title: "Customers · Wifi Billing" },
      {
        name: "description",
        content: "Manage hotspot subscribers, their plans, routers and expiry dates.",
      },
      { property: "og:title", content: "Customers · Wifi Billing" },
      { property: "og:description", content: "Manage your hotspot subscribers and their plans." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CustomersPage,
});

const statusTone: Record<string, string> = {
  active: "bg-success/15 text-success",
  expired: "bg-destructive/15 text-destructive",
  disabled: "bg-muted text-muted-foreground",
};

function CustomersPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listCustomers);
  const fetchContext = useServerFn(getMyContext);
  const add = useServerFn(createCustomer);
  const setStatus = useServerFn(setCustomerStatus);
  const remove = useServerFn(deleteCustomer);

  const ctx = useQuery({ queryKey: ["my-context"], queryFn: () => fetchContext() });
  const { data, isPending } = useQuery({ queryKey: ["customers"], queryFn: () => fetchList() });

  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    kind: "hotspot" as const,
    packageId: "",
    routerId: "",
    username: "",
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
      setForm((f) => ({ ...f, fullName: "", phone: "", username: "" }));
      toast.success("Customer added");
      await qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add customer"),
  });

  const statusMutation = useMutation({
    mutationFn: (v: { id: string; status: "active" | "expired" | "disabled" }) =>
      setStatus({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: async () => {
      toast.success("Customer removed");
      await qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove"),
  });

  const pkgName = (id: string | null) => data?.packages.find((p) => p.id === id)?.name ?? "No plan";

  return (
    <AppShell isSuperAdmin={ctx.data?.isSuperAdmin ?? false}>
      <h1 className="text-2xl font-bold">Hotspot Customers</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage active hotspot subscribers and their Wi-Fi session plans.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Add customer</CardTitle>
            <CardDescription>Expiry is set from the plan duration.</CardDescription>
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
                <Label htmlFor="cname">Full name</Label>
                <Input
                  id="cname"
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  required
                  minLength={2}
                  placeholder="Jane Wanjiru"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cphone">Phone</Label>
                <Input
                  id="cphone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  required
                  placeholder="0712345678"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpkg">Plan</Label>
                <select
                  id="cpkg"
                  value={form.packageId}
                  onChange={(e) => setForm({ ...form, packageId: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">No plan</option>
                  {data?.packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({formatPackageDuration(p.duration_hours)}) · KES {p.price_kes}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="crouter">Router</Label>
                <select
                  id="crouter"
                  value={form.routerId}
                  onChange={(e) => setForm({ ...form, routerId: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Unassigned</option>
                  {data?.routers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Add customer
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {isPending && <Skeleton className="h-32 w-full" />}
          {!isPending && (data?.customers.length ?? 0) === 0 && (
            <Card>
              <CardHeader>
                <CardTitle>No customers yet</CardTitle>
                <CardDescription>
                  Add your first subscriber, or let them self-register from the portal.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
          {data?.customers.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex flex-wrap items-center gap-3 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.phone} · {pkgName(c.package_id)}
                    {c.expires_at
                      ? ` · expires ${new Date(c.expires_at).toLocaleDateString()}`
                      : ""}
                  </p>
                </div>
                <Badge className={`rounded-sm ${statusTone[c.status] ?? ""}`} variant="secondary">
                  {c.status}
                </Badge>
                <select
                  value={c.status}
                  onChange={(e) =>
                    statusMutation.mutate({ id: c.id, status: e.target.value as "active" })
                  }
                  aria-label={`Status for ${c.full_name}`}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="active">active</option>
                  <option value="expired">expired</option>
                  <option value="disabled">disabled</option>
                </select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Remove ${c.full_name}`}
                  onClick={() => deleteMutation.mutate(c.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
