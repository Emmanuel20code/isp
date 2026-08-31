import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type ComponentType } from "react";
import * as React from "react";
import { ensureMyTenant, getMyContext } from "@/lib/tenancy.functions";
import { getDashboard, updateDashboardSettings } from "@/lib/dashboard.functions";
import { checkAndUpdateSubscription } from "@/lib/payments.functions";
import { computeBillingState } from "@/lib/subscription";
import { formatPackageDuration } from "@/lib/billing-helpers";
import { AppShell } from "@/components/AppShell";
import { RenewDialog } from "@/components/RenewDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  Clock,
  ShoppingBag,
  BarChart3,
  User,
  Users,
  Wifi,
  Ticket,
  Receipt,
  UsersRound,
  RefreshCw,
  Server,
  Activity,
  ArrowRight,
  CheckCircle2,
  XCircle,
  GripVertical,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · Wifi Billing Wi-Fi Billing" },
      {
        name: "description",
        content:
          "Live view of your routers, packages and subscription status across your Wi-Fi network.",
      },
      { property: "og:title", content: "Dashboard · Wifi Billing" },
      { property: "og:description", content: "Live view of your Wi-Fi network operations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Panel({
  title,
  icon: Icon,
  right,
  children,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-border">
      <header className="flex flex-wrap items-center justify-between gap-2 bg-panel-header px-3 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-tile-foreground">
          <Icon className="size-4" /> {title}
        </h2>
        {right}
      </header>
      <div className="bg-card p-3">{children}</div>
    </section>
  );
}

function Tile({
  value,
  label,
  icon: Icon,
  bg,
  to,
}: {
  value: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  bg: string;
  to?: string;
}) {
  return (
    <div className={`flex flex-col rounded-md ${bg} p-3 text-tile-foreground`}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-display text-2xl font-bold leading-tight">{value}</p>
        <Icon className="size-6 opacity-40" />
      </div>
      <p className="mt-1 text-[11px] uppercase tracking-wide opacity-85">{label}</p>
      <div className="mt-3 border-t border-white/15 pt-2 text-[11px] opacity-90">
        {to ? (
          <Link to={to} className="inline-flex items-center gap-1 hover:underline">
            View All <ArrowRight className="size-3" />
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1">Not connected yet</span>
        )}
      </div>
    </div>
  );
}

interface ActiveSession {
  id: string;
  phone: string;
  expires_at: string | null;
  packages: { name: string } | null;
}

function SortableTile({ id, children }: { id: string; children: React.ReactElement }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      {children}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 right-2 cursor-grab rounded-md bg-white/10 p-1 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
      >
        <GripVertical className="size-3 text-white/60" />
      </div>
    </div>
  );
}

const DEFAULT_TILE_ORDER = [
  "total_online",
  "active_hotspot",
  "income_today",
  "expired_hotspot",
  "income_month",
  "total_customers",
  "vouchers_unused",
  "vouchers_active",
  "payments_today",
  "routers_count",
];

function Dashboard() {
  const fetchContext = useServerFn(getMyContext);
  const fetchDashboard = useServerFn(getDashboard);
  const ensureTenant = useServerFn(ensureMyTenant);
  const saveSettings = useServerFn(updateDashboardSettings);
  const checkStatusFn = useServerFn(checkAndUpdateSubscription);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const queryClient = useQueryClient();
  const provisioning = useRef(false);

  const { data, isPending } = useQuery({ queryKey: ["my-context"], queryFn: () => fetchContext() });
  const board = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchDashboard(),
    refetchInterval: 15000, // Poll every 15s to update income tiles when new payments arrive
  });

  // If user might have recently paid or has a pending payment, auto-check database
  useEffect(() => {
    if (data?.tenant?.id) {
      checkStatusFn()
        .then((res) => {
          if (res?.newlyActivated) {
            toast.success("M-Pesa payment confirmed! Your subscription is now active.");
            queryClient.invalidateQueries({ queryKey: ["my-context"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard"] });
          }
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.tenant?.id]);

  async function handleManualCheck() {
    setCheckingPayment(true);
    try {
      const res = await checkStatusFn();
      await queryClient.invalidateQueries({ queryKey: ["my-context"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      if (res.newlyActivated || res.subscription_status === "active") {
        toast.success("Payment verified! Subscription activated successfully.");
      } else {
        toast.info("No completed M-Pesa payment detected yet. Please make payment or try again.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error verifying payment");
    } finally {
      setCheckingPayment(false);
    }
  }

  // Use a state for the tile order to handle drag updates locally
  const [activeTileOrder, setActiveTileOrder] = useState<string[]>([]);

  useEffect(() => {
    const savedOrder = data?.tenant?.settings?.dashboard_order;
    if (savedOrder && Array.isArray(savedOrder)) {
      setActiveTileOrder(savedOrder);
    } else {
      setActiveTileOrder(DEFAULT_TILE_ORDER);
    }
  }, [data]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = activeTileOrder.indexOf(active.id as string);
      const newIndex = activeTileOrder.indexOf(over.id as string);

      const newOrder = arrayMove(activeTileOrder, oldIndex, newIndex);
      setActiveTileOrder(newOrder);
      saveSettings({ order: newOrder }).catch((e) =>
        console.error("Failed to save dashboard order", e),
      );
    }
  }

  useEffect(() => {
    if (isPending || !data || data.tenant || provisioning.current) return;
    provisioning.current = true;
    ensureTenant()
      .then(async () => {
        await queryClient.invalidateQueries({ queryKey: ["my-context"] });
        await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      })
      .catch(() => {
        provisioning.current = false;
      });
  }, [data, isPending, ensureTenant, queryClient]);

  if (isPending || !data?.tenant) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-32 w-full" />
        </div>
      </AppShell>
    );
  }

  const tenant = data.tenant;
  const billing = computeBillingState(tenant, data.platform?.warning_days ?? 5);
  const price = data.platform?.subscription_price_kes ?? 1500;

  const routers = board.data?.routers ?? [];
  const packages = board.data?.packages ?? [];
  const activeSessions = (board.data?.activeSessions as unknown as ActiveSession[]) ?? [];

  const online = routers.filter((r) => r.status === "online").length;
  const offline = routers.filter((r) => r.status === "offline").length;

  const totalOnlineUsers = routers.reduce((acc, r) => acc + (r.active_hotspot_users ?? 0), 0);

  const mpesaReady = Boolean(tenant.mpesa_shortcode);
  const stats = board.data?.stats;
  const n = (v: number | undefined) => (v === undefined ? "—" : v.toLocaleString());
  const money = (v: number | undefined) => (v === undefined ? "—" : `KES ${v.toLocaleString()}`);

  const formatTimeLeft = (expiry: string | null) => {
    if (!expiry) return "—";
    const left = new Date(expiry).getTime() - Date.now();
    if (left <= 0) return "Expired";
    const h = Math.floor(left / 3_600_000);
    const m = Math.floor((left % 3_600_000) / 60_000);
    if (h > 0) return `${h}h ${m}m left`;
    return `${m}m left`;
  };

  if (!billing.isEntitled) {
    return (
      <AppShell isSuperAdmin={data.isSuperAdmin} title={tenant.name}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-destructive">Account Suspended</h1>
          <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/15">
            {billing.label}
          </Badge>
        </div>

        <div className="mx-auto max-w-lg rounded-xl border border-destructive/25 bg-destructive/5 p-6 text-center space-y-6 shadow-md mt-10">
          <AlertTriangle className="size-12 text-destructive mx-auto animate-pulse" />
          <div className="space-y-2">
            <h2 className="text-xl font-bold tracking-tight">Your Subscription Has Expired</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              To regain access to your client Wi-Fi billing network, active packages, customer
              accounts, vouchers, and settings, please renew your 30-day subscription.
            </p>
          </div>

          <div className="rounded-md border border-border bg-card p-4 text-left space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">SaaS Platform Access</span>
              <span className="font-bold">30 Days Duration</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subscription Price</span>
              <span className="font-bold">KES {price.toLocaleString()}</span>
            </div>
          </div>

          <div className="space-y-3">
            <RenewDialog price={price} defaultPhone={tenant.business_phone ?? data.profile?.phone}>
              <Button size="lg" className="w-full font-bold">
                Pay KES {price.toLocaleString()} with M-Pesa
              </Button>
            </RenewDialog>

            <Button
              variant="outline"
              size="sm"
              onClick={handleManualCheck}
              disabled={checkingPayment}
              className="w-full gap-2 text-xs"
            >
              {checkingPayment ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Verify / Check Payment Status
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell isSuperAdmin={data.isSuperAdmin} title={tenant.name}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <Badge
          className={
            billing.isEntitled
              ? "bg-success/15 text-success hover:bg-success/15"
              : "bg-destructive/15 text-destructive hover:bg-destructive/15"
          }
        >
          {billing.label}
        </Badge>
      </div>

      {billing.isEntitled && billing.showWarning && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-warning/50 bg-warning/10 px-3 py-2.5 text-sm">
          <Clock className="size-4 text-warning" />
          {billing.isTrial ? "Trial" : "Subscription"} ends in {billing.daysRemaining} day
          {billing.daysRemaining === 1 ? "" : "s"} · {billing.endsAt?.toLocaleDateString()}
          <RenewDialog price={price} defaultPhone={tenant.business_phone ?? data.profile?.phone}>
            <Button size="sm" variant="outline" className="ml-auto h-7 text-xs">
              Renew now
            </Button>
          </RenewDialog>
        </div>
      )}

      <div className="space-y-4">
        <Panel
          title="Router View"
          icon={Server}
          right={
            <Select defaultValue="all">
              <SelectTrigger className="h-8 w-[210px] rounded-sm bg-background/80 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Routers - System Wide</SelectItem>
                {routers.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        >
          {board.isPending ? (
            <Skeleton className="h-16 w-full" />
          ) : routers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No routers yet.{" "}
              <Link to="/routers" className="text-primary hover:underline">
                Add your first MikroTik
              </Link>
              .
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {routers.map((r) => (
                <Link
                  key={r.id}
                  to="/routers"
                  className="rounded-md border border-border bg-background/40 p-3 hover:border-primary/60"
                >
                  <p className="truncate text-sm font-medium text-primary">{r.name}</p>
                  <p className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <span
                        className={`size-2 rounded-full ${
                          r.status === "online"
                            ? "bg-success"
                            : r.status === "offline"
                              ? "bg-destructive"
                              : "bg-warning"
                        }`}
                      />
                      {r.status}
                    </span>
                    <span>{r.location ?? "No location"}</span>
                  </p>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={activeTileOrder} strategy={rectSortingStrategy}>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {activeTileOrder.map((id) => {
                let tile = null;
                switch (id) {
                  case "total_online":
                    tile = (
                      <Tile
                        value={n(totalOnlineUsers)}
                        label="Hotspot Online"
                        icon={UsersRound}
                        bg="bg-success/20 !text-success-foreground border border-success/30"
                        to="/customers"
                      />
                    );
                    break;
                  case "active_hotspot":
                    tile = (
                      <Tile
                        value={n(stats?.activeHotspot)}
                        label="Active Hotspot"
                        icon={Users}
                        bg="bg-tile-1"
                        to="/customers"
                      />
                    );
                    break;
                  case "income_today":
                    tile = (
                      <Tile
                        value={money(stats?.incomeToday)}
                        label="Income Today"
                        icon={ShoppingBag}
                        bg="bg-tile-3"
                        to="/transactions"
                      />
                    );
                    break;
                  case "expired_hotspot":
                    tile = (
                      <Tile
                        value={n(stats?.expiredHotspot)}
                        label="Expired Hotspot"
                        icon={Users}
                        bg="bg-destructive/10 text-destructive border border-destructive/20"
                        to="/customers"
                      />
                    );
                    break;
                  case "income_month":
                    tile = (
                      <Tile
                        value={money(stats?.incomeMonth)}
                        label="Income This Month"
                        icon={BarChart3}
                        bg="bg-tile-4"
                        to="/transactions"
                      />
                    );
                    break;
                  case "total_customers":
                    tile = (
                      <Tile
                        value={n(stats?.totalCustomers)}
                        label="Total Users"
                        icon={Users}
                        bg="bg-tile-5"
                        to="/customers"
                      />
                    );
                    break;
                  case "vouchers_unused":
                    tile = (
                      <Tile
                        value={n(stats?.vouchersUnused)}
                        label="Unused Vouchers"
                        icon={Ticket}
                        bg="bg-tile-6"
                        to="/vouchers"
                      />
                    );
                    break;
                  case "vouchers_active":
                    tile = (
                      <Tile
                        value={n(stats?.vouchersActive)}
                        label="Active Vouchers"
                        icon={Wifi}
                        bg="bg-tile-7"
                        to="/vouchers"
                      />
                    );
                    break;
                  case "payments_today":
                    tile = (
                      <Tile
                        value={n(stats?.paymentsToday)}
                        label="Payments Today"
                        icon={Receipt}
                        bg="bg-tile-8"
                        to="/transactions"
                      />
                    );
                    break;
                  case "routers_count":
                    tile = (
                      <Tile
                        value={n(routers.length)}
                        label="Routers"
                        icon={Server}
                        bg="bg-tile-1"
                        to="/routers"
                      />
                    );
                    break;
                }
                return (
                  <SortableTile key={id} id={id}>
                    {tile || <div />}
                  </SortableTile>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>

        <div className="flex justify-end">
          <Button
            size="sm"
            className="h-8 gap-1.5 rounded-sm text-xs"
            onClick={() => board.refetch()}
            disabled={board.isFetching}
          >
            <RefreshCw className={`size-3.5 ${board.isFetching ? "animate-spin" : ""}`} /> Refresh
            Online Users
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs">
          <span
            className={`size-2 rounded-full ${mpesaReady ? "bg-success" : "bg-muted-foreground"}`}
          />
          <span className="font-medium">M-Pesa STK Push Service</span>
          <span className="text-muted-foreground">
            — {mpesaReady ? `Till/PayBill ${tenant.mpesa_shortcode} saved` : "Not configured"}
          </span>
        </div>

        <Panel
          title="Router Status"
          icon={Server}
          right={
            <div className="flex gap-2">
              <Badge className="rounded-sm bg-success text-success-foreground hover:bg-success">
                <CheckCircle2 className="mr-1 size-3" /> {online} Online
              </Badge>
              <Badge className="rounded-sm bg-destructive text-destructive-foreground hover:bg-destructive">
                <XCircle className="mr-1 size-3" /> {offline} Offline
              </Badge>
            </div>
          }
        >
          {routers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No routers connected yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {routers.map((r) => (
                <div
                  key={r.id}
                  className={`flex items-center gap-3 rounded-md border-l-4 bg-background/40 p-3 ${
                    r.status === "online"
                      ? "border-success"
                      : r.status === "offline"
                        ? "border-destructive"
                        : "border-warning"
                  }`}
                >
                  <CheckCircle2
                    className={`size-5 ${r.status === "online" ? "text-success" : "text-muted-foreground"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {r.status} ·{" "}
                      {r.last_seen_at
                        ? `last seen ${new Date(r.last_seen_at).toLocaleString()}`
                        : "never reported"}
                    </p>
                  </div>
                  {r.ros_version && (
                    <span className="rounded-sm bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      {r.ros_version}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Monthly Registered Customers" icon={BarChart3}>
          <p className="py-10 text-center text-sm text-muted-foreground">
            No customer records yet — this chart fills up once M-Pesa payments and the router agent
            are connected.
          </p>
        </Panel>

        <Panel title="Today's Data Usage" icon={BarChart3}>
          <p className="py-10 text-center text-sm text-muted-foreground">
            Usage reporting starts when your on-site router agent is installed.
          </p>
        </Panel>

        <Panel
          title="Recent Active Sessions"
          icon={Users}
          right={
            <Link to="/customers" className="text-xs text-tile-foreground hover:underline">
              View All Customers
            </Link>
          }
        >
          {board.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : activeSessions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No active sessions found.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Customer</th>
                    <th className="pb-2 font-medium">Package</th>
                    <th className="pb-2 text-right font-medium">Time Left</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {activeSessions.map((session) => (
                    <tr key={session.id} className="hover:bg-muted/30">
                      <td className="py-2.5 font-medium">{session.phone}</td>
                      <td className="py-2.5 text-muted-foreground">
                        {session.packages?.name || "Standard"}
                      </td>
                      <td className="py-2.5 text-right">
                        <Badge
                          variant="secondary"
                          className="font-mono text-[10px] bg-success/10 text-success border-none"
                        >
                          {formatTimeLeft(session.expires_at)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel
          title="Packages / Plans"
          icon={ShoppingBag}
          right={
            <Link to="/packages" className="text-xs text-tile-foreground hover:underline">
              Manage
            </Link>
          }
        >
          {packages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No packages yet.{" "}
              <Link to="/packages" className="text-primary hover:underline">
                Create one
              </Link>{" "}
              to start selling.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {packages.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {p.kind === "hotspot" ? "Hotspot" : "PPPoE"} {"·"}{" "}
                      {formatPackageDuration(p.duration_hours)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-sm font-semibold">KES {p.price_kes}</p>
                    {!p.is_active && <p className="text-[11px] text-muted-foreground">paused</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
