import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import {
  listNetwork,
  createRouter,
  deleteRouter,
  regenerateRouterToken,
} from "@/lib/network.functions";
import { getMyContext } from "@/lib/tenancy.functions";
import { generateMikrotikDualConfig } from "@/lib/mikrotik";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Loader2,
  Trash2,
  Copy,
  RefreshCw,
  Server,
  Radio,
  Wifi,
  Activity,
  Terminal,
  KeyRound,
  ShieldCheck,
  Zap,
  Layers,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/routers")({
  head: () => ({
    meta: [
      { title: "Routers · Wifi Billing Wi-Fi & PPPoE Billing" },
      {
        name: "description",
        content:
          "Connect and manage your MikroTik routers with unified Hotspot and PPPoE on all ports.",
      },
      { property: "og:title", content: "Routers · Wifi Billing" },
      {
        property: "og:description",
        content: "Connect and monitor your MikroTik routers with Dual Hotspot & PPPoE.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RoutersPage,
});

function RoutersPage() {
  const qc = useQueryClient();
  const fetchNetwork = useServerFn(listNetwork);
  const fetchContext = useServerFn(getMyContext);
  const add = useServerFn(createRouter);
  const remove = useServerFn(deleteRouter);
  const refreshTok = useServerFn(regenerateRouterToken);

  const ctx = useQuery({ queryKey: ["my-context"], queryFn: () => fetchContext() });
  const { data, isPending } = useQuery({
    queryKey: ["network"],
    queryFn: () => fetchNetwork(),
    refetchInterval: 10_000, // Poll every 10s to keep router status completely live
  });

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [currentOrigin, setCurrentOrigin] = useState("");
  const [routerToDelete, setRouterToDelete] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCurrentOrigin(window.location.origin);
    }
  }, []);

  const createMutation = useMutation({
    mutationFn: () => add({ data: { name, location: location || undefined } }),
    onSuccess: async () => {
      setName("");
      setLocation("");
      toast.success("Router registered! Copy the terminal command to connect it.");
      await qc.invalidateQueries({ queryKey: ["network"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add router"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: async () => {
      toast.success("Router removed successfully");
      await qc.invalidateQueries({ queryKey: ["network"] });
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove router"),
  });

  const refreshTokMutation = useMutation({
    mutationFn: (id: string) => refreshTok({ data: { id } }),
    onSuccess: async () => {
      toast.success("Onboarding token regenerated with 7-day validity");
      await qc.invalidateQueries({ queryKey: ["network"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not refresh token"),
  });

  const handleAction = async (
    routerId: string,
    action: string,
    payloadData: Record<string, unknown> = {},
  ) => {
    try {
      const res = await fetch("/api/mikrotik/action", {
        method: "POST",
        body: JSON.stringify({ routerId, action, data: payloadData }),
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        if (action === "test.connection")
          toast.success("Test connection queued for next router sync");
        else if (action === "sync.config")
          toast.success("Dual Hotspot & PPPoE config queued for sync");
        else if (action.includes("disconnect")) toast.success("Session disconnect queued");
        else toast.success("Command queued successfully");
      } else {
        toast.error("Failed to queue command");
      }
    } catch {
      toast.error("Error communicating with server");
    }
  };

  return (
    <AppShell isSuperAdmin={ctx.data?.isSuperAdmin ?? false}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">MikroTik Routers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your network gateways. All ports automatically support simultaneous{" "}
            <strong>Hotspot Captive Portal</strong> and <strong>PPPoE Server</strong>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/datagrid">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Layers className="size-3.5 text-primary" /> Open Data Grid View
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["network"] })}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className="size-3.5" /> Refresh Status
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="size-4 text-primary" /> Add New MikroTik
            </CardTitle>
            <CardDescription>
              Assign an identity name and location to generate an onboarding command.
            </CardDescription>
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
                <Label htmlFor="rname">Router Name</Label>
                <Input
                  id="rname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  placeholder="e.g. Base Station Alpha (hEX S)"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rloc">Location / Tower (Optional)</Label>
                <Input
                  id="rloc"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Westlands Tower 3, Nairobi"
                />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Generate Onboard Command
              </Button>
            </form>

            <div className="mt-6 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground border border-border/50">
              <p className="font-semibold text-foreground flex items-center gap-1.5 mb-1.5">
                <Zap className="size-3.5 text-warning" /> Dual Hotspot + PPPoE on All Ports
              </p>
              <p className="leading-relaxed">
                When onboarded, Ethernet ports 2–5 and wireless interfaces are automatically bridged
                into{" "}
                <code className="text-[11px] font-mono font-bold text-foreground">bridge-lan</code>{" "}
                (10.5.50.1/24), running Hotspot DHCP and PPPoE service simultaneously on every port.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {isPending && <Skeleton className="h-44 w-full" />}
          {!isPending && (data?.routers.length ?? 0) === 0 && (
            <Card className="text-center py-12">
              <CardContent className="space-y-3">
                <Radio className="size-10 mx-auto text-muted-foreground opacity-50" />
                <CardTitle className="text-base">No MikroTik routers configured</CardTitle>
                <CardDescription>
                  Add your router on the left to generate its unique onboarding terminal command.
                </CardDescription>
              </CardContent>
            </Card>
          )}

          {data?.routers.map((r) => {
            const hostUrl =
              currentOrigin ||
              "https://ais-dev-s5f2kjccs5j2y2utemvmit-58412567612.europe-west2.run.app";
            const onboardCommand = `:local res [/tool fetch url="${hostUrl}/api/public/mikrotik/onboard" http-method=post http-data="token=${r.onboard_token}" as-value output=user]; :execute ($res->"data");`;
            const syncUrl = `${hostUrl}/api/public/mikrotik/sync`;
            const dualSetupScript = generateMikrotikDualConfig(syncUrl, r.agent_key);

            return (
              <Card key={r.id} className="border-border">
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base font-semibold">{r.name}</CardTitle>
                      <Badge
                        className={
                          r.status === "online"
                            ? "bg-success/15 text-success hover:bg-success/15"
                            : r.status === "offline"
                              ? "bg-destructive/15 text-destructive hover:bg-destructive/15"
                              : "bg-warning/15 text-warning hover:bg-warning/15"
                        }
                      >
                        <span
                          className={`mr-1.5 size-1.5 rounded-full ${
                            r.status === "online"
                              ? "bg-success animate-pulse"
                              : r.status === "offline"
                                ? "bg-destructive"
                                : "bg-warning"
                          }`}
                        />
                        {r.status === "online"
                          ? "Online (Synced)"
                          : r.status === "offline"
                            ? "Offline (No Heartbeat)"
                            : "Pending Terminal Onboard"}
                      </Badge>
                    </div>
                    <CardDescription className="mt-0.5">
                      {r.location ?? "No location set"}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive/10"
                      aria-label={`Remove ${r.name}`}
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        setRouterToDelete({ id: r.id, name: r.name });
                      }}
                    >
                      {deleteMutation.isPending && deleteMutation.variables === r.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 text-sm pt-0">
                  {/* Status telemetry metrics */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-md border bg-muted/30 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Identity
                      </p>
                      <p className="truncate text-xs font-semibold text-foreground">
                        {r.identity ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-md border bg-muted/30 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        RouterOS
                      </p>
                      <p className="truncate text-xs font-semibold text-foreground">
                        {r.ros_version ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-md border bg-muted/30 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Uptime
                      </p>
                      <p className="truncate text-xs font-semibold text-foreground">
                        {r.uptime ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-md border bg-muted/30 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Active Sessions
                      </p>
                      <p className="truncate text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Wifi className="size-3 text-primary" /> {r.active_hotspot_users ?? 0}{" "}
                        Hotspot · <Radio className="size-3 text-emerald-500" />{" "}
                        {r.active_pppoe_users ?? 0} PPPoE
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {r.last_seen_at
                        ? `Last heartbeat: ${new Date(r.last_seen_at).toLocaleTimeString()} (${new Date(r.last_seen_at).toLocaleDateString()})`
                        : "Never connected yet — run terminal command below"}
                    </span>
                    <span className="font-mono text-[11px]">
                      Agent Key: {r.agent_key.slice(0, 8)}...{r.agent_key.slice(-6)}
                    </span>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/60">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      onClick={() => handleAction(r.id, "test.connection")}
                    >
                      <Activity className="size-3 text-primary" /> Test Connection
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      onClick={() => handleAction(r.id, "sync.config")}
                    >
                      <RefreshCw className="size-3 text-emerald-600" /> Sync Dual Config
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      onClick={() => handleAction(r.id, "hotspot.disconnect", { username: "all" })}
                    >
                      <Wifi className="size-3 text-amber-600" /> Disconnect Hotspot
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      onClick={() => handleAction(r.id, "pppoe.disconnect", { username: "all" })}
                    >
                      <Radio className="size-3 text-rose-600" /> Disconnect PPPoE
                    </Button>
                    {r.status !== "online" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs gap-1.5 text-muted-foreground ml-auto"
                        onClick={() => refreshTokMutation.mutate(r.id)}
                        disabled={refreshTokMutation.isPending}
                      >
                        <KeyRound className="size-3" /> Refresh Token
                      </Button>
                    )}
                  </div>

                  {/* 1-Click Terminal Onboarding Command */}
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <Terminal className="size-4 text-primary" /> MikroTik Terminal Onboarding
                          Command
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Binds all non-WAN Ethernet &amp; WiFi ports into{" "}
                          <code className="font-mono font-bold text-primary">bridge-lan</code> for
                          dual Hotspot + PPPoE.
                        </p>
                      </div>
                      <Button
                        variant="default"
                        size="sm"
                        className="h-7 text-xs gap-1 shrink-0"
                        onClick={() => {
                          void navigator.clipboard.writeText(onboardCommand);
                          toast.success("MikroTik onboarding command copied to clipboard!");
                        }}
                      >
                        <Copy className="size-3" /> Copy Command
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <Badge variant="outline" className="bg-background/80 text-[10px] py-0 px-2">
                        Bridge: bridge-lan (10.5.50.1/24)
                      </Badge>
                      <Badge variant="outline" className="bg-background/80 text-[10px] py-0 px-2">
                        Ports: ether2–etherX + SFP + WLAN + v7 WiFi
                      </Badge>
                      <Badge variant="outline" className="bg-background/80 text-[10px] py-0 px-2">
                        Hotspot: 10.5.50.0/24
                      </Badge>
                      <Badge variant="outline" className="bg-background/80 text-[10px] py-0 px-2">
                        PPPoE: 10.5.60.0/24
                      </Badge>
                    </div>

                    <div className="relative">
                      <pre className="overflow-x-auto rounded bg-slate-950 p-2.5 font-mono text-[11px] text-emerald-400 leading-relaxed select-all">
                        {onboardCommand}
                      </pre>
                    </div>
                  </div>

                  {/* Expandable full script view */}
                  <details className="rounded-md border border-border/80 bg-background/50 p-2.5 text-xs">
                    <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                      <ShieldCheck className="size-3.5 text-primary" />
                      View Complete Dual Hotspot + PPPoE RouterOS Script (All Ports)
                    </summary>
                    <div className="mt-3 space-y-2">
                      <div className="flex justify-between items-center">
                        <p className="text-[11px] text-muted-foreground">
                          Target Host: <code className="font-mono text-foreground">{hostUrl}</code>
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px]"
                          onClick={() => {
                            void navigator.clipboard.writeText(dualSetupScript);
                            toast.success("Full RouterOS configuration copied!");
                          }}
                        >
                          <Copy className="mr-1 size-3" /> Copy Full Script
                        </Button>
                      </div>
                      <pre className="max-h-64 overflow-y-auto overflow-x-auto rounded bg-slate-950 p-3 font-mono text-[10px] text-slate-300 leading-relaxed whitespace-pre">
                        {dualSetupScript}
                      </pre>
                    </div>
                  </details>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog
        open={Boolean(routerToDelete)}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setRouterToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove MikroTik Router</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove router{" "}
              <strong className="text-foreground">"{routerToDelete?.name}"</strong>? This will
              disconnect it from the billing platform and clear its active background telemetry
              sync.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (routerToDelete) {
                  deleteMutation.mutate(routerToDelete.id, {
                    onSuccess: () => {
                      setRouterToDelete(null);
                    },
                  });
                }
              }}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Removing...
                </>
              ) : (
                "Delete Router"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
