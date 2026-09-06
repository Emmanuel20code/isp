import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getMyContext, updateTenantProfile } from "@/lib/tenancy.functions";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Business Settings · Wifi Billing Wi-Fi Billing" },
      {
        name: "description",
        content:
          "Update your ISP business details, support contacts and M-Pesa till or paybill number.",
      },
      { property: "og:title", content: "Business Settings · Wifi Billing" },
      {
        property: "og:description",
        content: "Manage business details and M-Pesa collection shortcode.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const fetchContext = useServerFn(getMyContext);
  const save = useServerFn(updateTenantProfile);
  const { data, isPending } = useQuery({ queryKey: ["my-context"], queryFn: () => fetchContext() });
  const tenant = data?.tenant;

  const [form, setForm] = useState({
    name: "",
    businessPhone: "",
    businessEmail: "",
    country: "Kenya",
    mpesaShortcode: "",
    mpesaShortcodeKind: "till" as "till" | "paybill",
    mpesaAccountRef: "",
  });

  useEffect(() => {
    if (!tenant) return;
    setForm({
      name: tenant.name ?? "",
      businessPhone: tenant.business_phone ?? "",
      businessEmail: tenant.business_email ?? "",
      country: tenant.country ?? "Kenya",
      mpesaShortcode: tenant.mpesa_shortcode ?? "",
      mpesaShortcodeKind: (tenant.mpesa_shortcode_kind as "till" | "paybill") ?? "till",
      mpesaAccountRef: (tenant.mpesa_account_ref as string) ?? "",
    });
  }, [tenant]);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          tenantId: tenant!.id,
          name: form.name,
          businessPhone: form.businessPhone,
          businessEmail: form.businessEmail,
          country: form.country,
          mpesaShortcode: form.mpesaShortcode.trim() || null,
          mpesaShortcodeKind: form.mpesaShortcode.trim() ? form.mpesaShortcodeKind : null,
          mpesaAccountRef:
            form.mpesaShortcode.trim() && form.mpesaShortcodeKind === "paybill"
              ? form.mpesaAccountRef.trim() || null
              : null,
        },
      }),
    onSuccess: async () => {
      toast.success("Business settings saved");
      await qc.invalidateQueries({ queryKey: ["my-context"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell isSuperAdmin={data?.isSuperAdmin ?? false} title={tenant?.name ?? undefined}>
      <h1 className="mb-3 text-lg font-semibold">Business Settings</h1>

      {isPending || !tenant ? (
        <Skeleton className="h-64 w-full max-w-2xl" />
      ) : (
        <form
          className="max-w-2xl space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Business details</CardTitle>
              <CardDescription>
                Shown to your customers on the captive portal and receipts.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="name">Business name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="country">Operating Country</Label>
                <Select
                  value={form.country}
                  onValueChange={(val) => setForm({ ...form, country: val })}
                >
                  <SelectTrigger id="country">
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Kenya">🇰🇪 Kenya</SelectItem>
                    <SelectItem value="Tanzania">🇹🇿 Tanzania</SelectItem>
                    <SelectItem value="Uganda">🇺🇬 Uganda</SelectItem>
                    <SelectItem value="Rwanda">🇷🇼 Rwanda</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Determines your default currency and available local mobile money payment
                  providers.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Support phone</Label>
                <Input
                  id="phone"
                  value={form.businessPhone}
                  onChange={(e) => setForm({ ...form, businessPhone: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Support email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.businessEmail}
                  onChange={(e) => setForm({ ...form, businessEmail: e.target.value })}
                  required
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">M-Pesa collection</CardTitle>
              <CardDescription>
                Where customer payments from your captive portal are collected.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="short">Till / Paybill number</Label>
                <Input
                  id="short"
                  inputMode="numeric"
                  value={form.mpesaShortcode}
                  onChange={(e) => setForm({ ...form, mpesaShortcode: e.target.value })}
                  placeholder="e.g. 174379"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={form.mpesaShortcodeKind}
                  onValueChange={(v) =>
                    setForm({ ...form, mpesaShortcodeKind: v as "till" | "paybill" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="till">Till (Buy Goods)</SelectItem>
                    <SelectItem value="paybill">Paybill</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.mpesaShortcodeKind === "paybill" && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="accRef">Account reference (optional)</Label>
                  <Input
                    id="accRef"
                    value={form.mpesaAccountRef}
                    onChange={(e) => setForm({ ...form, mpesaAccountRef: e.target.value })}
                    placeholder="e.g. WiFi"
                  />
                  <p className="text-xs text-muted-foreground">
                    If your Paybill is not configured with standard Single-Account validation, you
                    can specify the target account reference to pass.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />} Save changes
          </Button>
        </form>
      )}
    </AppShell>
  );
}
