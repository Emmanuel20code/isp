import React, { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  updateRouter,
  updatePackage,
  setPackageActive,
  deleteRouter,
  deletePackage,
  regenerateRouterToken,
  createRouter,
  createPackage,
  updateTenantMpesaConfig,
} from "@/lib/network.functions";
import { formatPackageDuration } from "@/lib/billing-helpers";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Search,
  ArrowUpDown,
  MoreHorizontal,
  Copy,
  Eye,
  EyeOff,
  Edit2,
  Trash2,
  RefreshCw,
  Plus,
  Radio,
  CreditCard,
  Package as PackageIcon,
  Layers,
  Download,
  Terminal,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  Zap,
  Building2,
  Smartphone,
  Check,
} from "lucide-react";

export type GridRouter = {
  id: string;
  name: string;
  location?: string | null;
  status: "online" | "offline" | "pending";
  agent_key: string;
  onboard_token: string;
  onboard_token_expires_at?: string;
  public_ip?: string | null;
  ros_version?: string | null;
  active_hotspot_users?: number;
  active_pppoe_users?: number;
  last_seen_at?: string | null;
  created_at?: string;
};

export type GridPackage = {
  id: string;
  name: string;
  kind: "hotspot" | "pppoe";
  price_kes: number;
  duration_hours: number;
  speed_down_mbps: number;
  speed_up_mbps: number;
  device_limit: number;
  is_active: boolean;
  created_at?: string;
};

export type GridTenantMpesa = {
  shortcode?: string | null;
  shortcodeKind?: "till" | "paybill" | null;
  accountRef?: string | null;
  country?: string;
};

interface TenantDataGridProps {
  routers: GridRouter[];
  packages: GridPackage[];
  mpesa?: GridTenantMpesa;
  initialTab?: "all" | "routers" | "mpesa" | "packages";
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function TenantDataGrid({
  routers = [],
  packages = [],
  mpesa,
  initialTab = "all",
  onRefresh,
  isRefreshing = false,
}: TenantDataGridProps) {
  const qc = useQueryClient();

  // Server functions
  const updateRouterFn = useServerFn(updateRouter);
  const updatePackageFn = useServerFn(updatePackage);
  const setPackageActiveFn = useServerFn(setPackageActive);
  const deleteRouterFn = useServerFn(deleteRouter);
  const deletePackageFn = useServerFn(deletePackage);
  const regenerateTokenFn = useServerFn(regenerateRouterToken);
  const createRouterFn = useServerFn(createRouter);
  const createPackageFn = useServerFn(createPackage);
  const updateMpesaFn = useServerFn(updateTenantMpesaConfig);

  // Local view state
  const [activeTab, setActiveTab] = useState<"all" | "routers" | "mpesa" | "packages">(initialTab);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<string>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [isCompact, setIsCompact] = useState(false);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});

  // Modals state
  const [editingRouter, setEditingRouter] = useState<GridRouter | null>(null);
  const [editingPackage, setEditingPackage] = useState<GridPackage | null>(null);
  const [isAddingRouter, setIsAddingRouter] = useState(false);
  const [isAddingPackage, setIsAddingPackage] = useState(false);
  const [isEditingMpesa, setIsEditingMpesa] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{
    type: "router" | "package";
    id: string;
    name: string;
  } | null>(null);

  // Forms state
  const [routerForm, setRouterForm] = useState({ name: "", location: "" });
  const [packageForm, setPackageForm] = useState<{
    name: string;
    kind: "hotspot" | "pppoe";
    priceKes: number;
    durationHours: number;
    speedDownMbps: number;
    speedUpMbps: number;
    deviceLimit: number;
    isActive: boolean;
  }>({
    name: "",
    kind: "hotspot",
    priceKes: 50,
    durationHours: 24,
    speedDownMbps: 5,
    speedUpMbps: 5,
    deviceLimit: 1,
    isActive: true,
  });

  const [mpesaForm, setMpesaForm] = useState({
    shortcode: mpesa?.shortcode ?? "",
    shortcodeKind: (mpesa?.shortcodeKind ?? "till") as "till" | "paybill",
    accountRef: mpesa?.accountRef ?? "",
  });

  // Sync mpesa prop if changed
  React.useEffect(() => {
    if (mpesa) {
      setMpesaForm({
        shortcode: mpesa.shortcode ?? "",
        shortcodeKind: (mpesa.shortcodeKind ?? "till") as "till" | "paybill",
        accountRef: mpesa.accountRef ?? "",
      });
    }
  }, [mpesa]);

  // Mutations
  const editRouterMutation = useMutation({
    mutationFn: (data: { id: string; name: string; location?: string | null }) =>
      updateRouterFn({ data }),
    onSuccess: async () => {
      toast.success("Router credentials updated");
      setEditingRouter(null);
      await qc.invalidateQueries({ queryKey: ["network"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update router"),
  });

  const editPackageMutation = useMutation({
    mutationFn: (data: {
      id: string;
      name: string;
      kind: "hotspot" | "pppoe";
      priceKes: number;
      durationHours: number;
      speedDownMbps: number;
      speedUpMbps: number;
      deviceLimit: number;
      isActive?: boolean;
    }) => updatePackageFn({ data }),
    onSuccess: async () => {
      toast.success("Package definition updated");
      setEditingPackage(null);
      await qc.invalidateQueries({ queryKey: ["network"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update package"),
  });

  const togglePackageActiveMutation = useMutation({
    mutationFn: (data: { id: string; isActive: boolean }) => setPackageActiveFn({ data }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["network"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update status"),
  });

  const addRouterMutation = useMutation({
    mutationFn: (data: { name: string; location?: string }) => createRouterFn({ data }),
    onSuccess: async () => {
      toast.success("New router added to database");
      setIsAddingRouter(false);
      setRouterForm({ name: "", location: "" });
      await qc.invalidateQueries({ queryKey: ["network"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to add router"),
  });

  const addPackageMutation = useMutation({
    mutationFn: (data: typeof packageForm) => createPackageFn({ data }),
    onSuccess: async () => {
      toast.success("New package created");
      setIsAddingPackage(false);
      setPackageForm({
        name: "",
        kind: "hotspot",
        priceKes: 50,
        durationHours: 24,
        speedDownMbps: 5,
        speedUpMbps: 5,
        deviceLimit: 1,
        isActive: true,
      });
      await qc.invalidateQueries({ queryKey: ["network"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to create package"),
  });

  const updateMpesaMutation = useMutation({
    mutationFn: (data: typeof mpesaForm) => updateMpesaFn({ data }),
    onSuccess: async () => {
      toast.success("M-Pesa till / shortcode settings saved");
      setIsEditingMpesa(false);
      await qc.invalidateQueries({ queryKey: ["my-context"] });
      await qc.invalidateQueries({ queryKey: ["tenant-gateways"] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Failed to save M-Pesa info"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (item: { type: "router" | "package"; id: string }) => {
      if (item.type === "router") {
        return await deleteRouterFn({ data: { id: item.id } });
      } else {
        return await deletePackageFn({ data: { id: item.id } });
      }
    },
    onSuccess: async (_, item) => {
      toast.success(`${item.type === "router" ? "Router" : "Package"} deleted`);
      setItemToDelete(null);
      await qc.invalidateQueries({ queryKey: ["network"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to delete"),
  });

  const regenTokenMutation = useMutation({
    mutationFn: (id: string) => regenerateTokenFn({ data: { id } }),
    onSuccess: async () => {
      toast.success("New onboarding token generated");
      await qc.invalidateQueries({ queryKey: ["network"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to regen token"),
  });

  function toggleSecret(id: string) {
    setRevealedSecrets((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function copyText(text: string, label: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    }
  }

  // Filtered & Sorted Datasets
  const filteredRouters = useMemo(() => {
    let list = [...routers];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.location && r.location.toLowerCase().includes(q)) ||
          r.status.toLowerCase().includes(q) ||
          (r.public_ip && r.public_ip.toLowerCase().includes(q)) ||
          r.onboard_token.toLowerCase().includes(q),
      );
    }
    list.sort((a, b) => {
      let valA = (a as unknown as Record<string, unknown>)[sortField] ?? "";
      let valB = (b as unknown as Record<string, unknown>)[sortField] ?? "";
      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();
      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [routers, searchQuery, sortField, sortDirection]);

  const filteredPackages = useMemo(() => {
    let list = [...packages];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.kind.toLowerCase().includes(q) ||
          p.price_kes.toString().includes(q) ||
          `${p.speed_down_mbps}mbps`.includes(q),
      );
    }
    list.sort((a, b) => {
      let valA = (a as unknown as Record<string, unknown>)[sortField] ?? "";
      let valB = (b as unknown as Record<string, unknown>)[sortField] ?? "";
      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();
      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [packages, searchQuery, sortField, sortDirection]);

  // Handle Sort Toggle
  function handleSort(field: string) {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  }

  // Export Data Grid to JSON
  function handleExportJSON() {
    const dataToExport = {
      tenantMpesa: mpesa,
      routers,
      packages,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tenant-resources-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported database resources to JSON");
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Metrics Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold font-display tracking-tight text-foreground flex items-center gap-2">
              <Layers className="size-5 text-primary" />
              Tenant Resource Data Grid
            </h2>
            <Badge variant="secondary" className="font-mono text-xs">
              Live Database
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Centralized data management for MikroTik credentials, M-Pesa Till/Paybill endpoints, and
            hotspot/PPPoE package definitions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="gap-1.5 text-xs h-9"
            >
              <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportJSON}
            className="gap-1.5 text-xs h-9"
          >
            <Download className="size-3.5" />
            Export Backup
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="gap-1.5 font-semibold text-xs h-9">
                <Plus className="size-4" />
                Add Resource
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Create Database Entry</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setIsAddingRouter(true)} className="gap-2 text-xs">
                <Radio className="size-3.5 text-primary" />
                Add MikroTik Router
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsAddingPackage(true)} className="gap-2 text-xs">
                <PackageIcon className="size-3.5 text-emerald-500" />
                Add Package Plan
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsEditingMpesa(true)} className="gap-2 text-xs">
                <CreditCard className="size-3.5 text-amber-500" />
                Configure M-Pesa Till
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Primary Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <Button
            variant={activeTab === "all" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("all")}
            className="h-8 gap-1.5 text-xs rounded-lg"
          >
            <Layers className="size-3.5" />
            Overview ({routers.length + packages.length + (mpesa?.shortcode ? 1 : 0)})
          </Button>
          <Button
            variant={activeTab === "routers" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("routers")}
            className="h-8 gap-1.5 text-xs rounded-lg"
          >
            <Radio className="size-3.5" />
            Routers ({routers.length})
          </Button>
          <Button
            variant={activeTab === "mpesa" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("mpesa")}
            className="h-8 gap-1.5 text-xs rounded-lg"
          >
            <CreditCard className="size-3.5" />
            M-Pesa Shortcode {mpesa?.shortcode ? `(${mpesa.shortcode})` : ""}
          </Button>
          <Button
            variant={activeTab === "packages" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("packages")}
            className="h-8 gap-1.5 text-xs rounded-lg"
          >
            <PackageIcon className="size-3.5" />
            Packages ({packages.length})
          </Button>
        </div>

        {/* Search and Density Controls */}
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search data grid..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs bg-muted/30"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCompact(!isCompact)}
            className="h-8 text-xs px-2.5 shrink-0"
            title="Toggle Row Density"
          >
            {isCompact ? "Comfortable" : "Compact"}
          </Button>
        </div>
      </div>

      {/* SECTION: M-PESA TILL / PAYBILL QUICK CARD IF ACTIVE TAB IS ALL OR MPESA */}
      {(activeTab === "all" || activeTab === "mpesa") && (
        <Card className="border-border/80 bg-card/60 backdrop-blur-sm overflow-hidden">
          <CardHeader className="p-4 pb-3 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2.5">
              <div className="grid size-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-500">
                <CreditCard className="size-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold">
                  M-Pesa Payment Destination Configuration
                </CardTitle>
                <CardDescription className="text-[11px]">
                  Configured Till Number or Paybill shortcode for your customer hotspot payments
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setMpesaForm({
                  shortcode: mpesa?.shortcode ?? "",
                  shortcodeKind: (mpesa?.shortcodeKind ?? "till") as "till" | "paybill",
                  accountRef: mpesa?.accountRef ?? "",
                });
                setIsEditingMpesa(true);
              }}
              className="h-8 gap-1.5 text-xs"
            >
              <Edit2 className="size-3.5" />
              {mpesa?.shortcode ? "Update Shortcode" : "Set Till/Paybill"}
            </Button>
          </CardHeader>

          <CardContent className="p-4 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-muted/20 p-3 rounded-xl border border-border/50 text-xs">
              <div className="space-y-0.5">
                <span className="text-muted-foreground text-[11px]">Active Destination:</span>
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  {mpesa?.shortcode ? (
                    <>
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase font-bold py-0 h-4 bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                      >
                        {mpesa.shortcodeKind || "till"}
                      </Badge>
                      <span className="font-mono text-sm">{mpesa.shortcode}</span>
                      <button
                        onClick={() => copyText(mpesa.shortcode!, "Till number")}
                        className="text-muted-foreground hover:text-foreground p-0.5"
                        title="Copy"
                      >
                        <Copy className="size-3" />
                      </button>
                    </>
                  ) : (
                    <span className="text-amber-500 font-medium">
                      Platform Shared Pipeline (Default)
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-0.5">
                <span className="text-muted-foreground text-[11px]">Account / Store Ref:</span>
                <div className="font-mono font-medium text-foreground">
                  {mpesa?.accountRef || (mpesa?.shortcode ? "Hotspot WiFi" : "System Handled")}
                </div>
              </div>

              <div className="space-y-0.5">
                <span className="text-muted-foreground text-[11px]">Country:</span>
                <div className="font-medium text-foreground flex items-center gap-1">
                  <span className="text-sm">🇰🇪</span> {mpesa?.country || "Kenya"}
                </div>
              </div>

              <div className="space-y-0.5">
                <span className="text-muted-foreground text-[11px]">STK Auto-Verification:</span>
                <div className="font-medium text-emerald-500 flex items-center gap-1">
                  <CheckCircle2 className="size-3.5" />
                  Real-time Instant
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SECTION: ROUTERS DATA GRID */}
      {(activeTab === "all" || activeTab === "routers") && (
        <Card className="border-border/80 bg-card/60 backdrop-blur-sm overflow-hidden">
          <CardHeader className="p-4 pb-3 flex flex-row items-center justify-between space-y-0 border-b border-border/50">
            <div className="flex items-center gap-2">
              <Radio className="size-4 text-primary" />
              <CardTitle className="text-sm font-bold">
                MikroTik Routers & Credentials ({filteredRouters.length})
              </CardTitle>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsAddingRouter(true)}
              className="h-7 text-xs gap-1"
            >
              <Plus className="size-3" /> Add Router
            </Button>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow className="text-[11px]">
                    <TableHead
                      className="w-[180px] cursor-pointer"
                      onClick={() => handleSort("name")}
                    >
                      <div className="flex items-center gap-1">
                        Router Name
                        <ArrowUpDown className="size-3 text-muted-foreground" />
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort("status")}>
                      <div className="flex items-center gap-1">
                        Status
                        <ArrowUpDown className="size-3 text-muted-foreground" />
                      </div>
                    </TableHead>
                    <TableHead>Location / IP</TableHead>
                    <TableHead>Onboard Token (Script)</TableHead>
                    <TableHead>Agent Key</TableHead>
                    <TableHead className="text-center">Active Users</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRouters.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="h-24 text-center text-xs text-muted-foreground"
                      >
                        No routers found matching query. Click "Add Router" to register one.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRouters.map((router) => {
                      const isRevealed = revealedSecrets[router.id];
                      const isOnline = router.status === "online";
                      const isPending = router.status === "pending";

                      return (
                        <TableRow
                          key={router.id}
                          className={`${isCompact ? "h-10" : "h-14"} text-xs hover:bg-muted/30 transition-colors`}
                        >
                          <TableCell className="font-semibold text-foreground">
                            <div className="flex items-center gap-2">
                              <span
                                className={`size-2 rounded-full shrink-0 ${
                                  isOnline
                                    ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                                    : isPending
                                      ? "bg-amber-500"
                                      : "bg-rose-500"
                                }`}
                              />
                              <div>
                                <span>{router.name}</span>
                                {router.ros_version && (
                                  <span className="block text-[10px] font-mono text-muted-foreground">
                                    RouterOS {router.ros_version}
                                  </span>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            <Badge
                              variant={isOnline ? "default" : "secondary"}
                              className={`text-[10px] capitalize font-medium ${
                                isOnline
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                  : isPending
                                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                    : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20"
                              }`}
                            >
                              {router.status}
                            </Badge>
                          </TableCell>

                          <TableCell className="text-muted-foreground font-mono text-[11px]">
                            {router.location || router.public_ip || "—"}
                          </TableCell>

                          <TableCell>
                            <div className="flex items-center gap-1 font-mono text-[11px]">
                              <code className="bg-muted/60 px-1.5 py-0.5 rounded border border-border/50">
                                {router.onboard_token || "—"}
                              </code>
                              {router.onboard_token && (
                                <button
                                  onClick={() => copyText(router.onboard_token, "Token")}
                                  title="Copy Token"
                                  className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                                >
                                  <Copy className="size-3.5" />
                                </button>
                              )}
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="flex items-center gap-1.5 font-mono text-[11px]">
                              <span>
                                {isRevealed
                                  ? router.agent_key
                                  : "••••••••••••" + router.agent_key.slice(-4)}
                              </span>
                              <button
                                onClick={() => toggleSecret(router.id)}
                                className="text-muted-foreground hover:text-foreground p-0.5"
                                title={isRevealed ? "Mask key" : "Reveal key"}
                              >
                                {isRevealed ? (
                                  <EyeOff className="size-3" />
                                ) : (
                                  <Eye className="size-3" />
                                )}
                              </button>
                              <button
                                onClick={() => copyText(router.agent_key, "Agent key")}
                                className="text-muted-foreground hover:text-foreground p-0.5"
                                title="Copy agent key"
                              >
                                <Copy className="size-3" />
                              </button>
                            </div>
                          </TableCell>

                          <TableCell className="text-center font-mono">
                            <span className="text-primary font-bold">
                              {(router.active_hotspot_users || 0) +
                                (router.active_pppoe_users || 0)}
                            </span>
                            <span className="text-[10px] text-muted-foreground ml-1">
                              ({router.active_hotspot_users || 0} HS /{" "}
                              {router.active_pppoe_users || 0} PPPoE)
                            </span>
                          </TableCell>

                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-7">
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuLabel>Router Options</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    setEditingRouter(router);
                                    setRouterForm({
                                      name: router.name,
                                      location: router.location || "",
                                    });
                                  }}
                                  className="gap-2 text-xs"
                                >
                                  <Edit2 className="size-3.5" /> Edit Details
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => regenTokenMutation.mutate(router.id)}
                                  className="gap-2 text-xs"
                                >
                                  <RefreshCw className="size-3.5" /> Regenerate Token
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() =>
                                    setItemToDelete({
                                      type: "router",
                                      id: router.id,
                                      name: router.name,
                                    })
                                  }
                                  className="gap-2 text-xs text-rose-500 focus:text-rose-500"
                                >
                                  <Trash2 className="size-3.5" /> Delete Router
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SECTION: PACKAGES DATA GRID */}
      {(activeTab === "all" || activeTab === "packages") && (
        <Card className="border-border/80 bg-card/60 backdrop-blur-sm overflow-hidden">
          <CardHeader className="p-4 pb-3 flex flex-row items-center justify-between space-y-0 border-b border-border/50">
            <div className="flex items-center gap-2">
              <PackageIcon className="size-4 text-emerald-500" />
              <CardTitle className="text-sm font-bold">
                Package Definitions & Pricing ({filteredPackages.length})
              </CardTitle>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsAddingPackage(true)}
              className="h-7 text-xs gap-1"
            >
              <Plus className="size-3" /> Add Package
            </Button>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow className="text-[11px]">
                    <TableHead
                      className="w-[180px] cursor-pointer"
                      onClick={() => handleSort("name")}
                    >
                      <div className="flex items-center gap-1">
                        Package Name
                        <ArrowUpDown className="size-3 text-muted-foreground" />
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort("kind")}>
                      <div className="flex items-center gap-1">
                        Type
                        <ArrowUpDown className="size-3 text-muted-foreground" />
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort("price_kes")}>
                      <div className="flex items-center gap-1">
                        Price (KES)
                        <ArrowUpDown className="size-3 text-muted-foreground" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer"
                      onClick={() => handleSort("duration_hours")}
                    >
                      <div className="flex items-center gap-1">
                        Duration
                        <ArrowUpDown className="size-3 text-muted-foreground" />
                      </div>
                    </TableHead>
                    <TableHead>Speed (Down/Up)</TableHead>
                    <TableHead className="text-center">Devices</TableHead>
                    <TableHead className="text-center">Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPackages.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="h-24 text-center text-xs text-muted-foreground"
                      >
                        No packages found. Click "Add Package" to create a new billing tier.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPackages.map((pkg) => {
                      return (
                        <TableRow
                          key={pkg.id}
                          className={`${isCompact ? "h-10" : "h-14"} text-xs hover:bg-muted/30 transition-colors`}
                        >
                          <TableCell className="font-semibold text-foreground">
                            {pkg.name}
                          </TableCell>

                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-bold uppercase ${
                                pkg.kind === "pppoe"
                                  ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                                  : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                              }`}
                            >
                              {pkg.kind}
                            </Badge>
                          </TableCell>

                          <TableCell className="font-mono font-bold text-foreground">
                            KES {pkg.price_kes.toLocaleString()}
                          </TableCell>

                          <TableCell className="text-muted-foreground font-medium">
                            {formatPackageDuration(pkg.duration_hours)}
                          </TableCell>

                          <TableCell className="font-mono">
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                              ↓ {pkg.speed_down_mbps}M
                            </span>
                            <span className="text-muted-foreground ml-1.5">
                              ↑ {pkg.speed_up_mbps}M
                            </span>
                          </TableCell>

                          <TableCell className="text-center font-mono">
                            {pkg.device_limit || 1}
                          </TableCell>

                          <TableCell className="text-center">
                            <Switch
                              checked={pkg.is_active}
                              onCheckedChange={(checked) =>
                                togglePackageActiveMutation.mutate({
                                  id: pkg.id,
                                  isActive: checked,
                                })
                              }
                              className="scale-75"
                            />
                          </TableCell>

                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-7">
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuLabel>Package Actions</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    setEditingPackage(pkg);
                                    setPackageForm({
                                      name: pkg.name,
                                      kind: pkg.kind,
                                      priceKes: pkg.price_kes,
                                      durationHours: pkg.duration_hours,
                                      speedDownMbps: pkg.speed_down_mbps,
                                      speedUpMbps: pkg.speed_up_mbps,
                                      deviceLimit: pkg.device_limit || 1,
                                      isActive: pkg.is_active,
                                    });
                                  }}
                                  className="gap-2 text-xs"
                                >
                                  <Edit2 className="size-3.5" /> Edit Package
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() =>
                                    setItemToDelete({
                                      type: "package",
                                      id: pkg.id,
                                      name: pkg.name,
                                    })
                                  }
                                  className="gap-2 text-xs text-rose-500 focus:text-rose-500"
                                >
                                  <Trash2 className="size-3.5" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* DIALOG: EDIT ROUTER */}
      <Dialog open={!!editingRouter} onOpenChange={(open) => !open && setEditingRouter(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Radio className="size-4 text-primary" /> Edit Router Configuration
            </DialogTitle>
            <DialogDescription className="text-xs">
              Update name and physical location tag for this MikroTik router.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label htmlFor="edit-router-name">Router Name / Identifier</Label>
              <Input
                id="edit-router-name"
                value={routerForm.name}
                onChange={(e) => setRouterForm({ ...routerForm, name: e.target.value })}
                placeholder="e.g. Main Gateway RB4011"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-router-loc">Location Tag (Optional)</Label>
              <Input
                id="edit-router-loc"
                value={routerForm.location}
                onChange={(e) => setRouterForm({ ...routerForm, location: e.target.value })}
                placeholder="e.g. Building A - 2nd Floor Rack"
                className="h-9"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingRouter(null)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!routerForm.name.trim() || editRouterMutation.isPending}
              onClick={() =>
                editingRouter &&
                editRouterMutation.mutate({
                  id: editingRouter.id,
                  name: routerForm.name.trim(),
                  location: routerForm.location.trim() || null,
                })
              }
              className="text-xs"
            >
              {editRouterMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: ADD ROUTER */}
      <Dialog open={isAddingRouter} onOpenChange={setIsAddingRouter}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Radio className="size-4 text-primary" /> Register New MikroTik Router
            </DialogTitle>
            <DialogDescription className="text-xs">
              Add a new router to your business. We will generate unique cryptographic API tokens
              and a 1-click terminal setup script.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label htmlFor="add-router-name">Router Name *</Label>
              <Input
                id="add-router-name"
                value={routerForm.name}
                onChange={(e) => setRouterForm({ ...routerForm, name: e.target.value })}
                placeholder="e.g. Tower 1 - hEX S"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-router-loc">Location / Node (Optional)</Label>
              <Input
                id="add-router-loc"
                value={routerForm.location}
                onChange={(e) => setRouterForm({ ...routerForm, location: e.target.value })}
                placeholder="e.g. Downtown Highrise"
                className="h-9"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAddingRouter(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!routerForm.name.trim() || addRouterMutation.isPending}
              onClick={() =>
                addRouterMutation.mutate({
                  name: routerForm.name.trim(),
                  location: routerForm.location.trim() || undefined,
                })
              }
              className="text-xs font-semibold"
            >
              {addRouterMutation.isPending ? "Creating..." : "Register Router"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: EDIT PACKAGE */}
      <Dialog open={!!editingPackage} onOpenChange={(open) => !open && setEditingPackage(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <PackageIcon className="size-4 text-emerald-500" /> Edit Package Definition
            </DialogTitle>
            <DialogDescription className="text-xs">
              Modify pricing, bandwidth limits, duration, and device allowances in the database.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-2 text-xs">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="edit-pkg-name">Package Name</Label>
              <Input
                id="edit-pkg-name"
                value={packageForm.name}
                onChange={(e) => setPackageForm({ ...packageForm, name: e.target.value })}
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-pkg-kind">Type</Label>
              <Select
                value={packageForm.kind}
                onValueChange={(val: "hotspot" | "pppoe") =>
                  setPackageForm({ ...packageForm, kind: val })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hotspot">Hotspot (Vouchers / Captive)</SelectItem>
                  <SelectItem value="pppoe">PPPoE (Fiber / Home Wi-Fi)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-pkg-price">Price (KES)</Label>
              <Input
                id="edit-pkg-price"
                type="number"
                value={packageForm.priceKes}
                onChange={(e) =>
                  setPackageForm({ ...packageForm, priceKes: parseInt(e.target.value) || 0 })
                }
                className="h-9 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-pkg-dur">Duration (Hours)</Label>
              <Input
                id="edit-pkg-dur"
                type="number"
                step="0.1"
                value={packageForm.durationHours}
                onChange={(e) =>
                  setPackageForm({
                    ...packageForm,
                    durationHours: parseFloat(e.target.value) || 1,
                  })
                }
                className="h-9 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-pkg-dev">Device Limit</Label>
              <Input
                id="edit-pkg-dev"
                type="number"
                value={packageForm.deviceLimit}
                onChange={(e) =>
                  setPackageForm({ ...packageForm, deviceLimit: parseInt(e.target.value) || 1 })
                }
                className="h-9 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-pkg-down">Download Limit (Mbps)</Label>
              <Input
                id="edit-pkg-down"
                type="number"
                value={packageForm.speedDownMbps}
                onChange={(e) =>
                  setPackageForm({
                    ...packageForm,
                    speedDownMbps: parseInt(e.target.value) || 1,
                  })
                }
                className="h-9 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-pkg-up">Upload Limit (Mbps)</Label>
              <Input
                id="edit-pkg-up"
                type="number"
                value={packageForm.speedUpMbps}
                onChange={(e) =>
                  setPackageForm({ ...packageForm, speedUpMbps: parseInt(e.target.value) || 1 })
                }
                className="h-9 font-mono"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingPackage(null)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!packageForm.name.trim() || editPackageMutation.isPending}
              onClick={() =>
                editingPackage &&
                editPackageMutation.mutate({
                  id: editingPackage.id,
                  ...packageForm,
                })
              }
              className="text-xs"
            >
              {editPackageMutation.isPending ? "Saving..." : "Save Package"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: ADD PACKAGE */}
      <Dialog open={isAddingPackage} onOpenChange={setIsAddingPackage}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <PackageIcon className="size-4 text-emerald-500" /> Create New Wi-Fi Package
            </DialogTitle>
            <DialogDescription className="text-xs">
              Define rate limits, duration, device limits, and pricing in KES.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-2 text-xs">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="add-pkg-name">Package Name *</Label>
              <Input
                id="add-pkg-name"
                value={packageForm.name}
                onChange={(e) => setPackageForm({ ...packageForm, name: e.target.value })}
                placeholder="e.g. 24 Hours Unlimited (5Mbps)"
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-pkg-kind">Type</Label>
              <Select
                value={packageForm.kind}
                onValueChange={(val: "hotspot" | "pppoe") =>
                  setPackageForm({ ...packageForm, kind: val })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hotspot">Hotspot (Vouchers)</SelectItem>
                  <SelectItem value="pppoe">PPPoE (Fiber / Routers)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-pkg-price">Price (KES) *</Label>
              <Input
                id="add-pkg-price"
                type="number"
                value={packageForm.priceKes}
                onChange={(e) =>
                  setPackageForm({ ...packageForm, priceKes: parseInt(e.target.value) || 0 })
                }
                className="h-9 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-pkg-dur">Duration (Hours) *</Label>
              <Input
                id="add-pkg-dur"
                type="number"
                step="0.5"
                value={packageForm.durationHours}
                onChange={(e) =>
                  setPackageForm({
                    ...packageForm,
                    durationHours: parseFloat(e.target.value) || 1,
                  })
                }
                className="h-9 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-pkg-dev">Device Limit</Label>
              <Input
                id="add-pkg-dev"
                type="number"
                value={packageForm.deviceLimit}
                onChange={(e) =>
                  setPackageForm({ ...packageForm, deviceLimit: parseInt(e.target.value) || 1 })
                }
                className="h-9 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-pkg-down">Download (Mbps)</Label>
              <Input
                id="add-pkg-down"
                type="number"
                value={packageForm.speedDownMbps}
                onChange={(e) =>
                  setPackageForm({
                    ...packageForm,
                    speedDownMbps: parseInt(e.target.value) || 1,
                  })
                }
                className="h-9 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-pkg-up">Upload (Mbps)</Label>
              <Input
                id="add-pkg-up"
                type="number"
                value={packageForm.speedUpMbps}
                onChange={(e) =>
                  setPackageForm({ ...packageForm, speedUpMbps: parseInt(e.target.value) || 1 })
                }
                className="h-9 font-mono"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAddingPackage(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!packageForm.name.trim() || addPackageMutation.isPending}
              onClick={() => addPackageMutation.mutate(packageForm)}
              className="text-xs font-semibold"
            >
              {addPackageMutation.isPending ? "Creating..." : "Create Package"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: EDIT M-PESA TILL */}
      <Dialog open={isEditingMpesa} onOpenChange={setIsEditingMpesa}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <CreditCard className="size-4 text-emerald-500" /> Configure M-Pesa Shortcode
            </DialogTitle>
            <DialogDescription className="text-xs">
              Enter your Safaricom Till Number or Paybill shortcode where customer hotspot revenues
              will be received.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label htmlFor="mpesa-kind">Shortcode Type</Label>
              <Select
                value={mpesaForm.shortcodeKind}
                onValueChange={(val: "till" | "paybill") =>
                  setMpesaForm({ ...mpesaForm, shortcodeKind: val })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="till">Buy Goods Till Number (e.g. 5-7 Digits)</SelectItem>
                  <SelectItem value="paybill">Paybill Business Number (e.g. 6 Digits)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mpesa-code">
                {mpesaForm.shortcodeKind === "paybill" ? "Paybill Number" : "Till Number"} *
              </Label>
              <Input
                id="mpesa-code"
                placeholder={mpesaForm.shortcodeKind === "paybill" ? "e.g. 247247" : "e.g. 9876543"}
                value={mpesaForm.shortcode}
                onChange={(e) => setMpesaForm({ ...mpesaForm, shortcode: e.target.value })}
                className="h-9 font-mono"
              />
            </div>

            {mpesaForm.shortcodeKind === "paybill" && (
              <div className="space-y-1.5">
                <Label htmlFor="mpesa-acc">Account Number / Reference</Label>
                <Input
                  id="mpesa-acc"
                  placeholder="e.g. WIFI or Business Name"
                  value={mpesaForm.accountRef}
                  onChange={(e) => setMpesaForm({ ...mpesaForm, accountRef: e.target.value })}
                  className="h-9 font-mono"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditingMpesa(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={updateMpesaMutation.isPending}
              onClick={() => updateMpesaMutation.mutate(mpesaForm)}
              className="text-xs font-semibold"
            >
              {updateMpesaMutation.isPending ? "Saving..." : "Save Shortcode"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ALERT DIALOG: DELETE CONFIRMATION */}
      <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">
              Delete {itemToDelete?.type === "router" ? "Router" : "Package"}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Are you sure you want to delete <strong>{itemToDelete?.name}</strong> from the
              database? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700 text-xs"
              onClick={() => itemToDelete && deleteMutation.mutate(itemToDelete)}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
