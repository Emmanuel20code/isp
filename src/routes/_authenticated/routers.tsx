import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import {
  listNetwork,
  createRouter,
  updateRouter,
  deleteRouter,
  regenerateRouterToken,
  forceRouterSync,
  toggleRouterDisabled,
  getRouterScript,
  fixRouterSsl,
  hardenRouterHotspot,
  fixRouterRepeaterBypass,
  fixAllRoutersRepeaterBypass,
} from "@/lib/network.functions";
import { getMyContext } from "@/lib/tenancy.functions";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatWidget } from "@/components/chat-widget";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { motion, AnimatePresence } from "motion/react";
import {
  Loader2,
  Trash2,
  Pencil,
  RefreshCw,
  Server,
  Radio,
  Wifi,
  KeyRound,
  Layers,
  Plus,
  Copy,
  Check,
  Terminal,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  Cpu,
  HardDrive,
  Clock,
  ChevronDown,
  ChevronUp,
  Download,
  FileCode,
  Sparkles,
  ChevronRight,
  Activity,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import { disableRadiusOnAllRouters } from "@/lib/radius-cleanup.server";
import { MacScannerModal } from "@/components/MacScannerModal";
import { RouterRevenueModal } from "@/components/RouterRevenueModal";
import { RouterIncomeLeaderboard } from "@/components/RouterIncomeLeaderboard";
import { RepeaterFixModal } from "@/components/RepeaterFixModal";
import type { RouterRevenueData } from "@/lib/network.functions";

export const Route = createFileRoute("/_authenticated/routers")({
  head: () => ({
    meta: [
      { title: "MikroTik Routers · WiFiBilling" },
      {
        name: "description",
        content: "Manage MikroTik routers, live telemetry, and one-click onboarding.",
      },
      { property: "og:title", content: "MikroTik Routers · WiFiBilling" },
      {
        property: "og:description",
        content: "Manage MikroTik routers, live telemetry, and one-click onboarding.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RoutersPage,
});

interface RouterCardProps {
  router: {
    id: string;
    name: string;
    location?: string | null;
    status: "online" | "offline" | "pending";
    agent_key: string;
    onboard_token?: string | null;
    identity?: string | null;
    ros_version?: string | null;
    uptime?: string | null;
    last_seen_at?: string | null;
    active_hotspot_users?: number;
    active_pppoe_users?: number;
    serial_number?: string | null;
    model?: string | null;
    architecture?: string | null;
    cpu_load?: string | null;
    free_memory?: string | null;
    configuration_version?: number;
    desired_configuration_version?: number;
    sync_status?: string;
    is_disabled?: boolean;
    revenue?: RouterRevenueData;
  };
  tenantSlug: string;
  baseUrl: string;
  onEdit?: (router: { id: string; name: string; location?: string | null }) => void;
  onDelete: (id: string, name: string) => void;
  onRefreshTok: (id: string) => void;
  onForceSync: (id: string) => void;
  onToggleDisable: (id: string, isDisabled: boolean) => void;
  onFixSsl: (id: string) => void;
  onHardenHotspot: (id: string) => void;
  onFixRepeater: (id: string) => void;
  onScanMacs: (id: string) => void;
  onViewRevenue: (router: any) => void;
  isDeleting: boolean;
  isRefreshingTok: boolean;
  isSyncing: boolean;
  isFixingSsl: boolean;
  isHardening: boolean;
  isFixingRepeater: boolean;
}

function RouterCard({
  router: r,
  tenantSlug,
  baseUrl,
  onEdit,
  onDelete,
  onRefreshTok,
  onForceSync,
  onFixSsl,
  onHardenHotspot,
  onFixRepeater,
  onScanMacs,
  onViewRevenue,
  onToggleDisable,
  isDeleting,
  isRefreshingTok,
  isSyncing,
  isFixingSsl,
  isHardening,
  isFixingRepeater,
}: RouterCardProps) {
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [scriptModalOpen, setScriptModalOpen] = useState(false);

  const onboardCommand = r.onboard_token ? generateOnboardingCommand(baseUrl, r.onboard_token) : "";

  const handleCopy = () => {
    if (!onboardCommand) return;
    navigator.clipboard.writeText(onboardCommand);
    setCopied(true);
    toast.success("MikroTik onboarding command copied to clipboard!");
    setTimeout(() => setCopied(false), 2500);
  };

  const formatLastSeen = (lastSeenAt?: string | null) => {
    if (!lastSeenAt) return "Never connected";
    const diffSeconds = Math.floor((Date.now() - new Date(lastSeenAt).getTime()) / 1000);
    if (diffSeconds < 30) return "Just now (<30s ago)";
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    return `${Math.floor(diffSeconds / 3600)}h ago`;
  };

  const portalUrl = `${baseUrl}/portal/${encodeURIComponent(tenantSlug)}?router_id=${encodeURIComponent(r.id)}`;

  return (
    <Card
      className={`border-border shadow-sm overflow-hidden transition-all bg-card ${isExpanded ? "ring-1 ring-primary/20" : ""}`}
    >
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-muted/20 border-b cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronRight className="size-4 text-muted-foreground" />
          </motion.div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
                  <Server className="size-4 text-primary" /> {r.name}
                </CardTitle>
                {onEdit && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit({ id: r.id, name: r.name, location: r.location });
                    }}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                    title="Edit Router Name"
                    aria-label="Edit Router Name"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                )}
              </div>
              <Badge
                className={
                  r.is_disabled
                    ? "bg-zinc-500/15 text-zinc-400 font-semibold"
                    : r.status === "online"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15 font-semibold"
                      : r.sync_status === "configuring"
                        ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 hover:bg-blue-500/15 font-semibold"
                        : r.sync_status === "downloading"
                          ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 hover:bg-sky-500/15 font-semibold"
                          : r.status === "offline"
                            ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 hover:bg-rose-500/15 font-semibold"
                            : "bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/15 font-semibold"
                }
              >
                <span
                  className={`mr-1.5 size-2 rounded-full ${
                    r.is_disabled
                      ? "bg-zinc-400"
                      : r.status === "online"
                        ? "bg-emerald-500 animate-pulse"
                        : r.sync_status === "configuring"
                          ? "bg-blue-500 animate-pulse"
                          : r.sync_status === "downloading"
                            ? "bg-sky-500 animate-pulse"
                            : r.status === "offline"
                              ? "bg-rose-500"
                              : "bg-amber-500"
                  }`}
                />
                {r.is_disabled
                  ? "Disabled"
                  : r.status === "online"
                    ? "Online"
                    : r.sync_status === "configuring"
                      ? "Configuring"
                      : r.sync_status === "downloading"
                        ? "Downloading"
                        : r.status === "offline"
                          ? "Offline"
                          : "Pending"}
              </Badge>

              {r.revenue && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewRevenue(r);
                  }}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all cursor-pointer"
                  title="Click to view daily & monthly revenue breakdown"
                >
                  <DollarSign className="size-3 text-emerald-500" />
                  <span>Today: KES {r.revenue.incomeToday.toLocaleString()}</span>
                  <span className="text-muted-foreground/60">|</span>
                  <span>Month: KES {r.revenue.incomeThisMonth.toLocaleString()}</span>
                </button>
              )}
            </div>
            {!isExpanded && (
              <p className="text-[10px] text-muted-foreground font-medium">
                {r.location || "No location"} · {formatLastSeen(r.last_seen_at)}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px] gap-1.5 px-2 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 bg-emerald-500/5 hover:bg-emerald-500/10 font-semibold"
            onClick={() => onViewRevenue(r)}
            title="View detailed daily & monthly income analytics for this router"
          >
            <TrendingUp className="size-3 text-emerald-500" />
            Income Stats
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px] gap-1.5 px-2 bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
            disabled={isSyncing}
            onClick={() => {
              toast.success(
                "Applying changes to router. Configuration will be pushed on next sync heartbeat.",
              );
              onForceSync(r.id);
            }}
          >
            {isSyncing ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Sparkles className="size-3" />
            )}
            Apply Changes
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px] gap-1.5 px-2 text-primary border-primary/25 bg-primary/5 hover:bg-primary/10 font-semibold"
            onClick={() => onScanMacs(r.id)}
            title="Scan connected MAC addresses on this router"
          >
            <Activity className="size-3" />
            Scan MACs
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px] gap-1.5 px-2"
            disabled={isSyncing}
            onClick={() => onForceSync(r.id)}
          >
            {isSyncing ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCw className="size-3" />
            )}
            Sync
          </Button>

          {onEdit && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] gap-1.5 px-2"
              onClick={() => onEdit({ id: r.id, name: r.name, location: r.location })}
              title="Edit router name & location"
            >
              <Pencil className="size-3" />
              Edit
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:bg-destructive/10"
            disabled={isDeleting}
            onClick={() => onDelete(r.id, r.name)}
          >
            {isDeleting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <CardContent className="space-y-4 text-sm p-4 border-t">
              <div className="flex flex-col gap-1.5 mb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardDescription className="text-xs">
                    {r.location ? `Location: ${r.location}` : "No location assigned"} · Heartbeat:{" "}
                    <span className="font-mono text-foreground font-medium">
                      {formatLastSeen(r.last_seen_at)}
                    </span>
                  </CardDescription>

                  {r.onboard_token && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px] gap-1.5 px-2 font-mono"
                      disabled={isRefreshingTok}
                      onClick={() => onRefreshTok(r.id)}
                      title="Regenerate onboarding token"
                    >
                      {isRefreshingTok ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <KeyRound className="size-3 text-amber-500" />
                      )}
                      {r.onboard_token}
                    </Button>
                  )}
                </div>
              </div>
              {/* Onboarding Command Box */}
              <div className="rounded-xl border border-border bg-slate-950 p-3.5 text-slate-100 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Terminal className="size-4 text-sky-400" />
                    <span className="text-xs font-semibold text-slate-200">
                      1-Step MikroTik Terminal Command (RouterOS 6 & 7)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setScriptModalOpen(true)}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold underline flex items-center gap-1 cursor-pointer bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20"
                    >
                      <FileCode className="size-3 text-emerald-400" /> View Full Script (.rsc)
                    </button>
                    <button
                      type="button"
                      onClick={() => setInstructionsOpen(true)}
                      className="text-[11px] text-sky-400 hover:text-sky-300 underline font-medium cursor-pointer"
                    >
                      Quick Guide
                    </button>
                    <button
                      type="button"
                      onClick={() => onScanMacs(r.id)}
                      className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold underline flex items-center gap-1 cursor-pointer bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20"
                      title="Scan connected MAC addresses on this MikroTik"
                    >
                      <Activity className="size-3 text-sky-400" /> Scan MACs
                    </button>
                    <button
                      type="button"
                      disabled={isFixingSsl}
                      onClick={() => onFixSsl(r.id)}
                      className="text-[11px] text-amber-400 hover:text-amber-300 underline font-medium cursor-pointer disabled:opacity-50 flex items-center gap-1"
                      title="Fix SSL certificate issues on the router"
                    >
                      {isFixingSsl ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <ShieldAlert className="size-3" />
                      )}
                      Fix SSL Handshake
                    </button>
                    <button
                      type="button"
                      disabled={isHardening}
                      onClick={() => onHardenHotspot(r.id)}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 underline font-medium cursor-pointer disabled:opacity-50 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20"
                      title="Removes MAC cookies, disables trial uptime, sets 1 device per MAC, and clears rogue bindings"
                    >
                      {isHardening ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <ShieldCheck className="size-3 text-emerald-400" />
                      )}
                      Fix Free Internet / Harden
                    </button>
                    <button
                      type="button"
                      disabled={isFixingRepeater}
                      onClick={() => onFixRepeater(r.id)}
                      className="text-[11px] text-amber-400 hover:text-amber-300 underline font-medium cursor-pointer disabled:opacity-50 flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20"
                      title="Rectifies Tenda / extender bypass: wipes MAC cookies, sets 1 device per MAC, applies TTL=1 Anti-NAT rule, and forces captive portal"
                    >
                      {isFixingRepeater ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Radio className="size-3 text-amber-400" />
                      )}
                      Fix Repeater Bypass
                    </button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleCopy}
                      className="h-7 px-2.5 text-xs gap-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold"
                    >
                      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      {copied ? "Copied!" : "Copy Command"}
                    </Button>
                  </div>
                </div>
                <div className="rounded bg-black/60 p-2 font-mono text-[11px] text-emerald-400 break-all select-all border border-slate-800">
                  {onboardCommand || "Generating command..."}
                </div>
              </div>

              {/* Real-time Hardware Telemetry Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <div className="rounded-lg border bg-muted/30 p-2.5 space-y-0.5">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                    Identity
                  </p>
                  <p className="truncate text-xs font-semibold text-foreground font-mono">
                    {r.identity || "—"}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-2.5 space-y-0.5">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                    RouterOS
                  </p>
                  <p className="truncate text-xs font-semibold text-foreground font-mono">
                    {r.ros_version ? `v${r.ros_version}` : "—"}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-2.5 space-y-0.5">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                    Model
                  </p>
                  <p className="truncate text-xs font-semibold text-foreground font-mono">
                    {r.model || "—"}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-2.5 space-y-0.5">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1">
                    <Clock className="size-3 text-muted-foreground" /> Uptime
                  </p>
                  <p className="truncate text-xs font-semibold text-foreground font-mono">
                    {r.uptime || "—"}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-2.5 space-y-0.5">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1">
                    <Cpu className="size-3 text-muted-foreground" /> CPU Load
                  </p>
                  <p className="truncate text-xs font-semibold text-foreground font-mono">
                    {r.cpu_load ? `${r.cpu_load}% CPU` : "—"}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-2.5 space-y-0.5">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                    Active Users
                  </p>
                  <p className="truncate text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <span className="flex items-center gap-1 text-primary">
                      <Wifi className="size-3" /> {r.active_hotspot_users ?? 0}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="flex items-center gap-1 text-emerald-500">
                      <Radio className="size-3" /> {r.active_pppoe_users ?? 0}
                    </span>
                  </p>
                </div>
              </div>

              {/* Router Financial Overview Card */}
              {r.revenue && (
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <DollarSign className="size-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground">
                          Router Financial Summary
                        </span>
                        <Badge variant="secondary" className="text-[10px] font-mono">
                          {r.revenue.shareOfTotalMonth}% of Network Revenue
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Real-time revenue attribution from Wi-Fi vouchers & customer packages
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                        Today's Income
                      </span>
                      <span className="text-xs font-bold text-foreground">
                        KES {r.revenue.incomeToday.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-muted-foreground block">
                        {r.revenue.txnCountToday} sales
                      </span>
                    </div>

                    <div className="h-7 w-px bg-border hidden sm:block" />

                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                        This Month
                      </span>
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        KES {r.revenue.incomeThisMonth.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-muted-foreground block">
                        {r.revenue.txnCountThisMonth} sales
                      </span>
                    </div>

                    <div className="h-7 w-px bg-border hidden sm:block" />

                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                        All-Time Total
                      </span>
                      <span className="text-xs font-bold text-foreground">
                        KES {r.revenue.incomeTotal.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-muted-foreground block">
                        {r.revenue.txnCountTotal} total sales
                      </span>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px] gap-1 px-2.5 bg-background hover:bg-muted font-semibold"
                      onClick={() => onViewRevenue(r)}
                    >
                      <TrendingUp className="size-3 text-emerald-500" />
                      Detailed Analytics
                    </Button>
                  </div>
                </div>
              )}

              {/* Quick Links & Advanced Toggle */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t text-xs">
                <div className="flex items-center gap-3">
                  <a
                    href={portalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline flex items-center gap-1 font-semibold"
                  >
                    <ExternalLink className="size-3.5" /> Test Captive Portal
                  </a>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">
                    Config Ver:{" "}
                    <strong className="text-foreground">v{r.configuration_version || 1}</strong>
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDetails(!showDetails)}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  {showDetails ? (
                    <>
                      Less Details <ChevronUp className="ml-1 size-3" />
                    </>
                  ) : (
                    <>
                      Hardware & Security <ChevronDown className="ml-1 size-3" />
                    </>
                  )}
                </Button>
              </div>

              {/* Expandable Technical Details */}
              {showDetails && (
                <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-2 border">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                      <span className="text-muted-foreground">Router ID:</span>
                      <p className="font-mono font-medium text-foreground truncate">{r.id}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Serial Number:</span>
                      <p className="font-mono font-medium text-foreground">
                        {r.serial_number || "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Architecture:</span>
                      <p className="font-mono font-medium text-foreground">
                        {r.architecture || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-muted-foreground">Quarantine / Maintenance Mode:</span>
                    <Button
                      variant={r.is_disabled ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => onToggleDisable(r.id, !r.is_disabled)}
                    >
                      {r.is_disabled ? "Enable Router" : "Disable / Quarantine"}
                    </Button>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2.5 border-t bg-emerald-500/[0.04] -mx-3 -mb-3 p-3 rounded-b-lg border-emerald-500/20">
                    <div className="space-y-0.5">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 text-xs">
                        <ShieldCheck className="size-3.5" /> Hotspot Anti-Free-Internet Lock
                      </span>
                      <p className="text-[11px] text-muted-foreground">
                        Removes MAC cookies, disables trial uptime, sets 1 device per MAC, and
                        clears rogue bindings.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isHardening}
                      className="h-7 text-xs gap-1.5 bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 shrink-0"
                      onClick={() => onHardenHotspot(r.id)}
                    >
                      {isHardening ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <ShieldCheck className="size-3.5" />
                      )}
                      Remote Harden Hotspot
                    </Button>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2.5 border-t bg-amber-500/[0.04] -mx-3 -mb-3 p-3 rounded-b-lg border-amber-500/20">
                    <div className="space-y-0.5">
                      <span className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5 text-xs">
                        <Radio className="size-3.5" /> Repeater & Range Extender Protection
                      </span>
                      <p className="text-[11px] text-muted-foreground">
                        Rectifies Tenda / extender bypass: disables MAC cookies, sets 1 device per MAC, applies TTL=1 Anti-NAT rule, and forces captive portal redirection.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isFixingRepeater}
                      className="h-7 text-xs gap-1.5 bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 shrink-0"
                      onClick={() => onFixRepeater(r.id)}
                    >
                      {isFixingRepeater ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Radio className="size-3.5" />
                      )}
                      Fix Repeater Bypass
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Setup Instructions Dialog */}
      <Dialog open={instructionsOpen} onOpenChange={setInstructionsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="size-5 text-primary" /> How to Onboard Your MikroTik Router
            </DialogTitle>
            <DialogDescription>
              Follow these simple steps to connect your MikroTik router to WiFiBilling in seconds.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-xs leading-relaxed">
            <div className="flex items-start gap-2.5 p-2 rounded-lg bg-muted/40">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                1
              </span>
              <div>
                <strong className="text-foreground">Open Winbox or SSH</strong>
                <p className="text-muted-foreground">
                  Connect to your MikroTik router via Winbox, WebFig, or SSH.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 p-2 rounded-lg bg-muted/40">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                2
              </span>
              <div>
                <strong className="text-foreground">Open New Terminal</strong>
                <p className="text-muted-foreground">
                  Click "New Terminal" in the left menu of Winbox.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 p-2 rounded-lg bg-muted/40">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                3
              </span>
              <div>
                <strong className="text-foreground">Paste the Onboarding Command</strong>
                <p className="text-muted-foreground">
                  Paste the 1-step command and press Enter. The script runs with automatic RouterOS
                  6 & 7 version detection, creates the captive portal redirects, configures
                  non-destructive hotspot routing, and cleans up temporary files.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                !
              </span>
              <div>
                <strong className="text-amber-700 dark:text-amber-300">
                  Troubleshooting "unable to resolve hostname"
                </strong>
                <p className="text-muted-foreground">
                  If the terminal returns{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">
                    failure: unable to resolve hostname
                  </code>
                  , ensure your upstream modem is connected to your router's WAN port (e.g. ether1)
                  and verify internet access with{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">
                    /ping 8.8.8.8
                  </code>
                  .
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
                4
              </span>
              <div>
                <strong className="text-emerald-700 dark:text-emerald-300">
                  Live Heartbeat & Verification
                </strong>
                <p className="text-muted-foreground">
                  Within 15-30 seconds, the status badge will switch to{" "}
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    Online & Connected
                  </span>
                  , streaming live CPU, memory, uptime, and active users.
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Full Generated RSC Script Modal */}
      <ScriptModal
        routerId={r.id}
        routerName={r.name}
        open={scriptModalOpen}
        onOpenChange={setScriptModalOpen}
      />
    </Card>
  );
}

function ScriptModal({
  routerId,
  routerName,
  open,
  onOpenChange,
}: {
  routerId: string;
  routerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fetchScript = useServerFn(getRouterScript);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [scriptType, setScriptType] = useState<"monolithic" | "modular" | "portal">("monolithic");

  const { data, isLoading, error } = useQuery({
    queryKey: ["router-script", routerId, scriptType],
    queryFn: () => fetchScript({ data: { routerId, scriptType } }),
    enabled: open,
    staleTime: 10000,
  });

  const handleCopyScript = () => {
    if (!data?.script) return;
    navigator.clipboard.writeText(data.script);
    setCopiedScript(true);
    toast.success("RouterOS script copied to clipboard!");
    setTimeout(() => setCopiedScript(false), 2500);
  };

  const handleCopyCommand = () => {
    if (!data?.command) return;
    navigator.clipboard.writeText(data.command);
    setCopiedCmd(true);
    toast.success("Terminal onboarding command copied to clipboard!");
    setTimeout(() => setCopiedCmd(false), 2500);
  };

  const handleDownload = () => {
    if (!data?.script) return;
    const blob = new Blob([data.script], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = scriptType === "modular" ? "mainhotspot.rsc" : "onboard.auto.rsc";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(
      `Downloaded ${scriptType === "modular" ? "mainhotspot.rsc" : "onboard.auto.rsc"} script file`,
    );
  };

  const subScripts = [
    { name: "VPN Connection", type: "vpn", file: "vpnsetup.rsc" },
    { name: "Captive Portal Hotspot", type: "hotspot", file: "hotspotsetup.rsc" },
    { name: "PPPoE Server", type: "pppoe", file: "pppoesetup.rsc" },
    { name: "Users & Operators", type: "users", file: "users.rsc" },
    { name: "Sync Scheduler", type: "syncusers", file: "syncusers.rsc" },
    { name: "Heartbeat Client", type: "heartbeat", file: "heartbeat.rsc" },
    { name: "Uptime Telemetry", type: "syncfull", file: "syncfull.rsc" },
    { name: "Remote Logging", type: "logpush", file: "logpush.rsc" },
    { name: "Port Lockdown", type: "seclogpush", file: "seclogpush.rsc" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-6 overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg text-slate-100">
            <FileCode className="size-5 text-emerald-500" />
            {scriptType === "portal"
              ? `Captive Portal HTML - ${routerName}`
              : `Generated MikroTik Onboarding Script (.rsc) - ${routerName}`}
          </DialogTitle>
          <DialogDescription className="text-slate-400 text-xs">
            {scriptType === "portal"
              ? "This is the raw login.html code that connects your MikroTik router to this billing cloud. Manually paste this into your router's hotspot/login.html file if you aren't using the scripts."
              : "Auto-generated RouterOS configuration script. Select your preferred installer structure, then copy or download to run directly on your MikroTik router."}
          </DialogDescription>
        </DialogHeader>

        {/* SSL/TLS Handshake Warning for RouterOS v6 */}
        <div className="p-3.5 bg-amber-500/5 border border-amber-500/20 rounded-lg flex items-start gap-3 text-xs text-amber-200/90 leading-relaxed">
          <span className="text-base select-none mt-0.5">💡</span>
          <div>
            <span className="font-semibold text-amber-300">
              RouterOS v6 SSL Handshake or Redirect Error?
            </span>
            <p className="mt-1 text-slate-400 text-[11px]">
              If your router fails with{" "}
              <code className="text-amber-300 px-1 py-0.5 bg-amber-500/10 rounded font-mono">
                ssl connection error
              </code>{" "}
              or{" "}
              <code className="text-amber-300 px-1 py-0.5 bg-amber-500/10 rounded font-mono">
                301 Moved Permanently
              </code>
              , it is because older RouterOS versions do not support modern SSL Server Name
              Indication (SNI) required by secure servers.
            </p>
            <p className="mt-1.5 font-medium text-amber-200">
              👉 <span className="underline">The Workaround:</span> Change the architecture below to{" "}
              <strong>⚡ Monolithic (1-Step)</strong>, click <strong>Copy Installer Script</strong>,
              then paste the script text directly into your MikroTik WinBox Terminal. It configures
              the captive portal HTML files 100% offline without any network downloads!
            </p>
          </div>
        </div>

        {/* Script Type Selector */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between py-3 border-t border-slate-800">
          <span className="text-xs font-bold text-slate-300">Installer Architecture:</span>
          <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-lg w-full sm:w-auto">
            <button
              onClick={() => setScriptType("monolithic")}
              className={`flex-1 sm:flex-initial py-1.5 px-4 text-xs font-semibold rounded-md transition-all ${
                scriptType === "monolithic"
                  ? "bg-emerald-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              ⚡ Monolithic (1-Step)
            </button>
            <button
              onClick={() => setScriptType("modular")}
              className={`flex-1 sm:flex-initial py-1.5 px-4 text-xs font-semibold rounded-md transition-all ${
                scriptType === "modular"
                  ? "bg-emerald-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              🗂️ Modular (ISP Ledger Style)
            </button>
            <button
              onClick={() => setScriptType("portal")}
              className={`flex-1 sm:flex-initial py-1.5 px-4 text-xs font-semibold rounded-md transition-all ${
                scriptType === "portal"
                  ? "bg-emerald-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              🌐 Captive Portal Only (login.html)
            </button>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 py-3 border-y border-slate-800 my-1">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-xs gap-1 font-mono bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            >
              <Check className="size-3 text-emerald-500" /> RouterOS v6/v7 Compatible
            </Badge>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopyCommand}
              disabled={!data?.command}
              className="h-8 text-xs gap-1.5 text-slate-300 border-slate-800 bg-slate-900 hover:bg-slate-800 hover:text-white"
            >
              {copiedCmd ? (
                <Check className="size-3.5 text-emerald-500" />
              ) : (
                <Terminal className="size-3.5" />
              )}
              {copiedCmd ? "Command Copied!" : "Copy 1-Step Command"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownload}
              disabled={!data?.script}
              className="h-8 text-xs gap-1.5 text-slate-300 border-slate-800 bg-slate-900 hover:bg-slate-800 hover:text-white"
            >
              <Download className="size-3.5 text-blue-400" />
              {scriptType === "modular" ? "Download mainhotspot.rsc" : "Download .rsc"}
            </Button>
            <Button
              size="sm"
              onClick={handleCopyScript}
              disabled={!data?.script}
              className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
            >
              {copiedScript ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copiedScript ? "Script Copied!" : "Copy Installer Script"}
            </Button>
          </div>
        </div>

        {/* Modular Sub-Scripts Grid */}
        {scriptType === "modular" && data?.onboardToken && (
          <div className="p-4 bg-slate-900/60 rounded-lg border border-slate-800/80 mb-3">
            <div className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Individual Modular Setup Sub-Scripts (Fetch & Import Flow)
            </div>
            <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
              The main loader script (
              <span className="text-emerald-400 font-mono">mainhotspot.rsc</span>) automatically
              downloads and imports each file below sequentially. If you prefer to set them up
              separately, click a script to download it:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {subScripts.map((sub) => {
                const subUrl = `${window.location.origin}/api/public/mikrotik/onboard?token=${data.onboardToken}&type=${sub.type}`;
                return (
                  <a
                    key={sub.type}
                    href={subUrl}
                    download={sub.file}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between p-2 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800/50 hover:border-slate-700 text-slate-300 hover:text-slate-100 transition-all text-xs"
                  >
                    <span className="truncate font-medium">{sub.name}</span>
                    <Badge
                      variant="secondary"
                      className="font-mono text-[9px] px-1 py-0 bg-slate-800 text-slate-400 border border-slate-700/30"
                    >
                      {sub.file}
                    </Badge>
                  </a>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex-1 min-h-[300px] max-h-[500px] overflow-hidden rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-emerald-400">
          {isLoading ? (
            <div className="h-48 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="size-6 animate-spin text-emerald-500" />
              <span>Generating RouterOS script...</span>
            </div>
          ) : error ? (
            <div className="p-4 text-rose-400">
              Failed to load script: {(error as Error).message}
            </div>
          ) : (
            <pre className="h-full overflow-auto whitespace-pre font-mono text-[11px] leading-relaxed text-slate-200 select-all pr-2">
              {data?.script}
            </pre>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RoutersPage() {
  const qc = useQueryClient();
  const fetchNetwork = useServerFn(listNetwork);
  const fetchContext = useServerFn(getMyContext);
  const add = useServerFn(createRouter);
  const updateRouterFn = useServerFn(updateRouter);
  const remove = useServerFn(deleteRouter);
  const refreshTok = useServerFn(regenerateRouterToken);
  const forceSyncFn = useServerFn(forceRouterSync);
  const toggleDisableFn = useServerFn(toggleRouterDisabled);
  const disableRadius = useServerFn(disableRadiusOnAllRouters);

  const ctx = useQuery({ queryKey: ["my-context"], queryFn: () => fetchContext() });
  const { data, isPending } = useQuery({
    queryKey: ["network"],
    queryFn: () => fetchNetwork(),
    refetchInterval: 5_000,
  });

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [routerToDelete, setRouterToDelete] = useState<{ id: string; name: string } | null>(null);
  const [routerToEdit, setRouterToEdit] = useState<{
    id: string;
    name: string;
    location: string;
  } | null>(null);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");

  const handleOpenEdit = (router: { id: string; name: string; location?: string | null }) => {
    setRouterToEdit({
      id: router.id,
      name: router.name,
      location: router.location || "",
    });
    setEditName(router.name);
    setEditLocation(router.location || "");
  };

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!routerToEdit) throw new Error("No router selected for editing");
      return updateRouterFn({
        data: {
          id: routerToEdit.id,
          name: editName.trim(),
          location: editLocation.trim() || undefined,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Router name and details updated successfully");
      setRouterToEdit(null);
      await qc.invalidateQueries({ queryKey: ["network"] });
      await qc.invalidateQueries({ queryKey: ["my-context"] });
      await qc.invalidateQueries({ queryKey: ["device-routers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update router"),
  });

  const [baseUrl, setBaseUrl] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(window.location.origin);
    }
  }, []);

  const createMutation = useMutation({
    mutationFn: () => add({ data: { name, location: location || undefined } }),
    onSuccess: async () => {
      setName("");
      setLocation("");
      toast.success("Router registered! Copy the terminal command to complete setup.");
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
      toast.success("Router onboarding token refreshed");
      await qc.invalidateQueries({ queryKey: ["network"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not refresh token"),
  });

  const forceSyncMutation = useMutation({
    mutationFn: (id: string) => forceSyncFn({ data: { id } }),
    onSuccess: async () => {
      toast.success("Synchronization queued for router");
      await qc.invalidateQueries({ queryKey: ["network"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not queue sync"),
  });

  const toggleDisableMutation = useMutation({
    mutationFn: ({ id, isDisabled }: { id: string; isDisabled: boolean }) =>
      toggleDisableFn({ data: { id, isDisabled } }),
    onSuccess: async () => {
      toast.success("Router status updated");
      await qc.invalidateQueries({ queryKey: ["network"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update status"),
  });

  const fixSslMutation = useMutation({
    mutationFn: (id: string) => fixRouterSsl({ data: { id } }),
    onSuccess: async () => {
      toast.success("SSL CA Fix command enqueued for router.");
      await qc.invalidateQueries({ queryKey: ["network"] });
    },
    onError: (err) => {
      toast.error(`Failed to fix SSL: ${err instanceof Error ? err.message : "Unknown error"}`);
    },
  });

  const hardenHotspotFn = useServerFn(hardenRouterHotspot);
  const hardenHotspotMutation = useMutation({
    mutationFn: (id: string) => hardenHotspotFn({ data: { id } }),
    onSuccess: async () => {
      toast.success(
        "Hotspot security hardening queued! Cookies wiped, trial disabled, 1-device policy enforced.",
      );
      await qc.invalidateQueries({ queryKey: ["network"] });
    },
    onError: (err) => {
      toast.error(
        `Failed to harden hotspot: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    },
  });

  const fixRepeaterFn = useServerFn(fixRouterRepeaterBypass);
  const fixAllRepeatersFn = useServerFn(fixAllRoutersRepeaterBypass);

  const fixRepeaterMutation = useMutation({
    mutationFn: (id: string) => fixRepeaterFn({ data: { id } }),
    onSuccess: async () => {
      toast.success(
        "Repeater protection queued! MAC cookies disabled, 1-device policy enforced, and Anti-NAT rule activated.",
      );
      await qc.invalidateQueries({ queryKey: ["network"] });
    },
    onError: (err) => {
      toast.error(
        `Failed to queue repeater protection: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    },
  });

  const fixAllRepeatersMutation = useMutation({
    mutationFn: () => fixAllRepeatersFn(),
    onSuccess: async (res) => {
      toast.success(
        `Repeater protection queued for ${res.count} router(s)! MAC cookies disabled and Anti-NAT rules pushed.`,
      );
      await qc.invalidateQueries({ queryKey: ["network"] });
    },
    onError: (err) => {
      toast.error(
        `Failed to queue repeater protection: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    },
  });

  const [apGuideOpen, setApGuideOpen] = useState(false);
  const [repeaterModalOpen, setRepeaterModalOpen] = useState(false);
  const [selectedRouterForRepeater, setSelectedRouterForRepeater] = useState<string | null>(null);
  const [macScannerOpen, setMacScannerOpen] = useState(false);
  const [selectedRouterForScan, setSelectedRouterForScan] = useState<string | null>(null);
  const [selectedRouterForRevenue, setSelectedRouterForRevenue] = useState<any | null>(null);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);

  const tenantSlug = ctx.data?.tenant?.slug || "wifi";
  const revenueMetrics = data?.revenueMetrics;

  return (
    <AppShell isSuperAdmin={ctx.data?.isSuperAdmin ?? false}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Server className="size-6 text-primary" /> MikroTik Routers
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your network gateways, live telemetry, and per-router daily/monthly income.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (confirm("Are you sure you want to disable RADIUS on all routers?")) {
                await disableRadius();
                toast.success("RADIUS cleanup command enqueued.");
              }
            }}
            className="text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-100"
          >
            Disable RADIUS on All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLeaderboardOpen(true)}
            className="gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 bg-emerald-500/5"
          >
            <TrendingUp className="size-3.5" /> Router Income Leaderboard
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedRouterForScan(null);
              setMacScannerOpen(true);
            }}
            className="gap-1.5 text-xs font-semibold text-primary border-primary/30 hover:bg-primary/10"
          >
            <Activity className="size-3.5" /> Scan MAC Addresses
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setApGuideOpen(true)}
            className="gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
          >
            <ShieldCheck className="size-3.5" /> Anti-Leak Guide
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedRouterForRepeater(null);
              setRepeaterModalOpen(true);
            }}
            className="gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10 bg-amber-500/5"
          >
            <Radio className="size-3.5 text-amber-500" /> Tenda / Repeater Fix
          </Button>
          <Link to="/datagrid">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs font-semibold">
              <Layers className="size-3.5 text-primary" /> Data Grid
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["network"] })}
            className="gap-1.5 text-xs font-semibold"
          >
            <RefreshCw className="size-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Network Router Revenue Highlights */}
      {revenueMetrics && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-card p-3.5 space-y-1 shadow-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] uppercase font-bold tracking-wider">
                All Routers Today
              </span>
              <DollarSign className="size-3.5 text-primary" />
            </div>
            <p className="text-xl font-bold tracking-tight text-foreground">
              KES {revenueMetrics.totalIncomeToday.toLocaleString()}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {revenueMetrics.totalTxnsToday} sales across network today
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3.5 space-y-1 shadow-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] uppercase font-bold tracking-wider">
                All Routers This Month
              </span>
              <TrendingUp className="size-3.5 text-emerald-500" />
            </div>
            <p className="text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              KES {revenueMetrics.totalIncomeThisMonth.toLocaleString()}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {revenueMetrics.totalTxnsThisMonth} sales this month
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3.5 space-y-1 shadow-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] uppercase font-bold tracking-wider">
                Top Earner Today
              </span>
              <Server className="size-3.5 text-sky-500" />
            </div>
            <p className="text-sm font-bold text-foreground truncate">
              {revenueMetrics.topRouterToday?.name || "No sales yet today"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {revenueMetrics.topRouterToday
                ? `KES ${revenueMetrics.topRouterToday.amount.toLocaleString()}`
                : "—"}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3.5 space-y-1 shadow-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] uppercase font-bold tracking-wider">
                Top Earner Month
              </span>
              <Server className="size-3.5 text-amber-500" />
            </div>
            <p className="text-sm font-bold text-foreground truncate">
              {revenueMetrics.topRouterMonth?.name || "No sales yet this month"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {revenueMetrics.topRouterMonth
                ? `KES ${revenueMetrics.topRouterMonth.amount.toLocaleString()}`
                : "—"}
            </p>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* Left Form: Add Router */}
        <Card className="h-fit shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="size-4 text-primary" /> Add New Router
            </CardTitle>
            <CardDescription className="text-xs">
              Register a MikroTik router to generate its onboarding command.
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
              <div className="space-y-1.5">
                <Label htmlFor="rname" className="text-xs font-semibold">
                  Router Name
                </Label>
                <Input
                  id="rname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  placeholder="e.g. Main Gateway (hEX / RB4011 / CCR)"
                  className="text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rloc" className="text-xs font-semibold">
                  Location / Site (Optional)
                </Label>
                <Input
                  id="rloc"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Westlands Tower 3, Nairobi"
                  className="text-xs h-9"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-9 text-xs font-bold"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Generate Onboarding Script
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Right List: Connected Routers */}
        <div className="space-y-4">
          {isPending && <Skeleton className="h-48 w-full rounded-xl" />}
          {!isPending && (data?.routers.length ?? 0) === 0 && (
            <Card className="text-center py-14 shadow-sm">
              <CardContent className="space-y-3">
                <Radio className="size-10 mx-auto text-muted-foreground opacity-40" />
                <CardTitle className="text-base">No MikroTik routers configured</CardTitle>
                <CardDescription className="max-w-sm mx-auto text-xs">
                  Register your router on the left to generate its 1-step onboarding command.
                </CardDescription>
              </CardContent>
            </Card>
          )}

          {data?.routers.map((r) => (
            <RouterCard
              key={r.id}
              router={r}
              tenantSlug={tenantSlug}
              baseUrl={baseUrl}
              onEdit={handleOpenEdit}
              onDelete={(id, name) => setRouterToDelete({ id, name })}
              onRefreshTok={(id) => refreshTokMutation.mutate(id)}
              onForceSync={(id) => forceSyncMutation.mutate(id)}
              onFixSsl={(id) => fixSslMutation.mutate(id)}
              onHardenHotspot={(id) => hardenHotspotMutation.mutate(id)}
              onFixRepeater={(id) => {
                setSelectedRouterForRepeater(id);
                fixRepeaterMutation.mutate(id);
                setRepeaterModalOpen(true);
              }}
              onScanMacs={(id) => {
                setSelectedRouterForScan(id);
                setMacScannerOpen(true);
              }}
              onViewRevenue={(router) => setSelectedRouterForRevenue(router)}
              onToggleDisable={(id, isDisabled) => toggleDisableMutation.mutate({ id, isDisabled })}
              isDeleting={deleteMutation.isPending && deleteMutation.variables === r.id}
              isRefreshingTok={
                refreshTokMutation.isPending && refreshTokMutation.variables === r.id
              }
              isSyncing={forceSyncMutation.isPending && forceSyncMutation.variables === r.id}
              isFixingSsl={fixSslMutation.isPending && fixSslMutation.variables === r.id}
              isHardening={
                hardenHotspotMutation.isPending && hardenHotspotMutation.variables === r.id
              }
              isFixingRepeater={
                fixRepeaterMutation.isPending && fixRepeaterMutation.variables === r.id
              }
            />
          ))}
        </div>
      </div>

      {/* Access Point / Leak Diagnostics Dialog */}
      <Dialog open={apGuideOpen} onOpenChange={setApGuideOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-emerald-500" /> Hotspot Security & Anti-Leak
              Diagnostics
            </DialogTitle>
            <DialogDescription>
              Why random phones/devices might connect without paying and how the system stops it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-xs leading-relaxed">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg space-y-1.5">
              <h4 className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                <Check className="size-3.5" /> 1. Dashboard 1-Click Remote Hardening
              </h4>
              <p className="text-muted-foreground">
                Clicking <strong className="text-foreground">"Fix Free Internet / Harden"</strong>{" "}
                on your router sends an instant command to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-0.5 ml-1">
                <li>
                  Enforce <code className="text-emerald-500">addresses-per-mac=1</code> (blocks MAC
                  spoofing & device cloning).
                </li>
                <li>
                  Disable <code className="text-emerald-500">mac-cookie</code> (stops devices from
                  auto-reauthenticating for free after voucher expiry).
                </li>
                <li>
                  Set <code className="text-emerald-500">trial-uptime-limit=0s</code> (wipes free
                  trial bypasses).
                </li>
                <li>Wipe ghost cookies & rogue bypassed IP bindings from router memory.</li>
                <li>
                  Activate Anti-DNS-Tunnel NAT redirection (intercepts SlowDNS/DroidVPN port 53).
                </li>
              </ul>
            </div>

            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-1.5">
              <h4 className="font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                <ShieldCheck className="size-3.5" /> 2. Tunneling Apps (HTTP Custom, HA Tunnel,
                SlowDNS, DroidVPN)
              </h4>
              <p className="text-muted-foreground">
                Tunneling apps exploit unauthenticated DNS (Port 53) or spoofed SNI headers in
                Walled Gardens to tunnel free data:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-0.5 ml-1">
                <li>
                  <strong className="text-foreground">SlowDNS & DroidVPN (DNS Port 53)</strong>:
                  Blocked by redirecting all DNS queries to the router's internal resolver,
                  preventing direct UDP tunnel communication.
                </li>
                <li>
                  <strong className="text-foreground">
                    HTTP Custom & HA Tunnel Plus (SNI Spoofing)
                  </strong>
                  : Blocked by dropping QUIC (UDP 443) and restricting Walled Garden entries
                  strictly to the captive portal and payment endpoints.
                </li>
              </ul>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg space-y-1.5">
              <h4 className="font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                <ShieldAlert className="size-3.5" /> 3. Access Point Double-NAT Check (Crucial
                Hardware Step)
              </h4>
              <p className="text-muted-foreground">
                If your Wi-Fi Access Points (e.g. TP-Link, Tenda, Mercusys) are operating in{" "}
                <strong>Router / NAT Mode</strong> instead of{" "}
                <strong>Access Point / Bridge Mode</strong>:
              </p>
              <p className="text-foreground font-medium">
                The MikroTik only sees the single MAC address of the Access Point. As soon as ONE
                user buys a voucher, ALL other users connected to that AP get free internet!
              </p>
              <div className="bg-background/80 p-2.5 rounded border border-amber-500/30 text-[11px] space-y-1">
                <p className="font-bold text-amber-500">
                  To fix this on your physical Access Points:
                </p>
                <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground">
                  <li>
                    Set AP Operation Mode to <strong>"Access Point"</strong> or{" "}
                    <strong>"Bridge"</strong>.
                  </li>
                  <li>Disable DHCP Server on the Access Point.</li>
                  <li>
                    Plug ethernet cable from MikroTik into the AP's <strong>LAN port</strong> (NOT
                    the WAN/Internet port).
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Router Name & Location Dialog */}
      <Dialog
        open={Boolean(routerToEdit)}
        onOpenChange={(open) => {
          if (!open && !updateMutation.isPending) {
            setRouterToEdit(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="size-5 text-primary" /> Edit Router
            </DialogTitle>
            <DialogDescription>
              Update the display name and physical location for this MikroTik router.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editName.trim().length >= 2) {
                updateMutation.mutate();
              }
            }}
            className="space-y-4 pt-2"
          >
            <div className="space-y-2">
              <Label htmlFor="editRouterName">
                Router Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="editRouterName"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="e.g. Main Gateway or Station 1"
                required
                minLength={2}
                maxLength={60}
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                This name identifies your router in Hotspot portals, PPPoE manager, and network
                telemetry.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editRouterLocation">Location (Optional)</Label>
              <Input
                id="editRouterLocation"
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                placeholder="e.g. Server Room Rack 2, 2nd Floor"
                maxLength={80}
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={updateMutation.isPending}
                onClick={() => setRouterToEdit(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending || editName.trim().length < 2}
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
              remove it from your network dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bold"
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

      {/* Live MikroTik MAC Scanner Modal */}
      <MacScannerModal
        open={macScannerOpen}
        onOpenChange={setMacScannerOpen}
        initialRouterId={selectedRouterForScan}
      />

      {/* Deep Router Revenue Analytics Modal */}
      <RouterRevenueModal
        open={Boolean(selectedRouterForRevenue)}
        onOpenChange={(open) => {
          if (!open) setSelectedRouterForRevenue(null);
        }}
        router={selectedRouterForRevenue}
      />

      {/* Network Router Income Leaderboard & Full CSV Export */}
      <RouterIncomeLeaderboard
        open={leaderboardOpen}
        onOpenChange={setLeaderboardOpen}
        metrics={revenueMetrics ?? null}
        onSelectRouter={(id) => {
          const found = data?.routers.find((r) => r.id === id);
          if (found) setSelectedRouterForRevenue(found);
        }}
      />

      {/* Tenda Repeater & Range Extender Protection Modal */}
      <RepeaterFixModal
        open={repeaterModalOpen}
        onOpenChange={setRepeaterModalOpen}
        routers={data?.routers?.map((r) => ({ id: r.id, name: r.name })) || []}
        selectedRouterId={selectedRouterForRepeater}
        onFixRouter={async (id) => {
          await fixRepeaterMutation.mutateAsync(id);
        }}
        onFixAllRouters={async () => {
          await fixAllRepeatersMutation.mutateAsync();
        }}
        isFixing={fixRepeaterMutation.isPending || fixAllRepeatersMutation.isPending}
      />

      <ChatWidget />
    </AppShell>
  );
}
