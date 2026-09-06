import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listVouchers, generateVouchers, deleteVoucher } from "@/lib/customers.functions";
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
import { Loader2, Copy, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/vouchers")({
  head: () => ({
    meta: [
      { title: "Hotspot Vouchers · Wifi Billing Wi-Fi Billing" },
      {
        name: "description",
        content: "Generate and track hotspot voucher codes tied to a plan and router.",
      },
      { property: "og:title", content: "Hotspot Vouchers · Wifi Billing" },
      {
        property: "og:description",
        content: "Generate hotspot voucher codes for your Wi-Fi plans.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VouchersPage,
});

const tone: Record<string, string> = {
  unused: "bg-primary/15 text-primary",
  active: "bg-success/15 text-success",
  used: "bg-muted text-muted-foreground",
  expired: "bg-destructive/15 text-destructive",
};

function VouchersPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listVouchers);
  const fetchContext = useServerFn(getMyContext);
  const gen = useServerFn(generateVouchers);
  const remove = useServerFn(deleteVoucher);

  const ctx = useQuery({ queryKey: ["my-context"], queryFn: () => fetchContext() });
  const { data, isPending } = useQuery({ queryKey: ["vouchers"], queryFn: () => fetchList() });

  const [packageId, setPackageId] = useState("");
  const [routerId, setRouterId] = useState("");
  const [count, setCount] = useState("10");

  const genMutation = useMutation({
    mutationFn: () =>
      gen({ data: { packageId, routerId: routerId || null, count: Number(count) } }),
    onSuccess: async (r) => {
      toast.success(`${r.created} vouchers generated`);
      await qc.invalidateQueries({ queryKey: ["vouchers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not generate vouchers"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vouchers"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete voucher"),
  });

  const pkgName = (id: string) => data?.packages.find((p) => p.id === id)?.name ?? "Plan removed";

  return (
    <AppShell isSuperAdmin={ctx.data?.isSuperAdmin ?? false}>
      <h1 className="text-2xl font-bold">Hotspot vouchers</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Printable codes your customers redeem on the captive portal.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[340px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Generate batch</CardTitle>
            <CardDescription>Codes are unique per business.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!packageId) {
                  toast.error("Pick a hotspot plan first");
                  return;
                }
                genMutation.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="vpkg">Hotspot plan</Label>
                <select
                  id="vpkg"
                  value={packageId}
                  onChange={(e) => setPackageId(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select plan</option>
                  {data?.packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({formatPackageDuration(p.duration_hours)}) · KES {p.price_kes}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vrouter">Router</Label>
                <select
                  id="vrouter"
                  value={routerId}
                  onChange={(e) => setRouterId(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Any router</option>
                  {data?.routers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vcount">How many</Label>
                <Input
                  id="vcount"
                  type="number"
                  min={1}
                  max={200}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={genMutation.isPending}>
                {genMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Generate
              </Button>
              {(data?.packages.length ?? 0) === 0 && !isPending && (
                <p className="text-xs text-muted-foreground">Create a hotspot package first.</p>
              )}
            </form>
          </CardContent>
        </Card>

        <div>
          {isPending && <Skeleton className="h-32 w-full" />}
          {!isPending && (data?.vouchers.length ?? 0) === 0 && (
            <Card>
              <CardHeader>
                <CardTitle>No vouchers yet</CardTitle>
                <CardDescription>Generate a batch to start selling prepaid access.</CardDescription>
              </CardHeader>
            </Card>
          )}
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {data?.vouchers.map((v) => (
              <Card key={v.id}>
                <CardContent className="flex items-center gap-2 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-semibold tracking-widest">{v.code}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {pkgName(v.package_id)}
                    </p>
                  </div>
                  <Badge className={`rounded-sm ${tone[v.status] ?? ""}`} variant="secondary">
                    {v.status}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Copy ${v.code}`}
                    onClick={() => {
                      void navigator.clipboard.writeText(v.code);
                      toast.success("Code copied");
                    }}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Delete ${v.code}`}
                    onClick={() => deleteMutation.mutate(v.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
