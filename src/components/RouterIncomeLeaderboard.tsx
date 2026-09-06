import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Server,
  Download,
  Search,
  ArrowUpDown,
  TrendingUp,
  Calendar,
  DollarSign,
  Layers,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import type { NetworkRevenueMetrics, RouterRevenueData } from "@/lib/network.functions";

interface RouterIncomeLeaderboardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metrics: NetworkRevenueMetrics | null;
  onSelectRouter?: (routerId: string) => void;
  currency?: string;
}

export function RouterIncomeLeaderboard({
  open,
  onOpenChange,
  metrics,
  onSelectRouter,
  currency = "KES",
}: RouterIncomeLeaderboardProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"today" | "month" | "total" | "name">("today");
  const [sortAsc, setSortAsc] = useState(false);

  const routers = useMemo(() => metrics?.routers ?? [], [metrics]);

  const filteredAndSorted = useMemo(() => {
    let list = [...routers];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.routerName.toLowerCase().includes(q) ||
          (r.location && r.location.toLowerCase().includes(q)) ||
          (r.model && r.model.toLowerCase().includes(q)),
      );
    }

    list.sort((a, b) => {
      let valA = 0;
      let valB = 0;
      if (sortBy === "today") {
        valA = a.incomeToday;
        valB = b.incomeToday;
      } else if (sortBy === "month") {
        valA = a.incomeThisMonth;
        valB = b.incomeThisMonth;
      } else if (sortBy === "total") {
        valA = a.incomeTotal;
        valB = b.incomeTotal;
      } else if (sortBy === "name") {
        return sortAsc
          ? a.routerName.localeCompare(b.routerName)
          : b.routerName.localeCompare(a.routerName);
      }
      return sortAsc ? valA - valB : valB - valA;
    });

    return list;
  }, [routers, searchQuery, sortBy, sortAsc]);

  const handleSort = (type: "today" | "month" | "total" | "name") => {
    if (sortBy === type) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(type);
      setSortAsc(false);
    }
  };

  const exportAllCsv = () => {
    if (!routers.length) return;
    const headers = [
      "Router Name",
      "Location",
      "Status",
      "Today Income (KES)",
      "Today Sales Count",
      "Yesterday Income (KES)",
      "This Month Income (KES)",
      "This Month Sales Count",
      "Last Month Income (KES)",
      "Total All-Time Income (KES)",
      "Total Sales Count",
      "Share of Month (%)",
    ];

    const rows = routers.map((r) => [
      `"${r.routerName.replace(/"/g, '""')}"`,
      `"${(r.location || "N/A").replace(/"/g, '""')}"`,
      r.status,
      r.incomeToday.toString(),
      r.txnCountToday.toString(),
      r.incomeYesterday.toString(),
      r.incomeThisMonth.toString(),
      r.txnCountThisMonth.toString(),
      r.incomeLastMonth.toString(),
      r.incomeTotal.toString(),
      r.txnCountTotal.toString(),
      `${r.shareOfTotalMonth}%`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `all_routers_income_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-0 gap-0 border-border bg-card">
        {/* Header */}
        <div className="p-5 border-b bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <Layers className="size-5 text-primary" />
                Router Income Leaderboard & Financial Report
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Side-by-side daily & monthly earnings breakdown across all MikroTik routers
              </DialogDescription>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exportAllCsv}
                disabled={!routers.length}
                className="h-8 text-xs gap-1.5"
              >
                <Download className="size-3.5" />
                Export Full Report (CSV)
              </Button>
            </div>
          </div>

          {/* Network Summary Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t">
            <div className="rounded-lg bg-card border p-2.5">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                Total Today
              </span>
              <p className="text-lg font-bold text-foreground">
                {currency} {(metrics?.totalIncomeToday ?? 0).toLocaleString()}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {metrics?.totalTxnsToday ?? 0} sales across routers
              </p>
            </div>

            <div className="rounded-lg bg-card border p-2.5">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                Total This Month
              </span>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {currency} {(metrics?.totalIncomeThisMonth ?? 0).toLocaleString()}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {metrics?.totalTxnsThisMonth ?? 0} sales this month
              </p>
            </div>

            <div className="rounded-lg bg-card border p-2.5">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                Top Earner Today
              </span>
              <p className="text-sm font-bold text-foreground truncate">
                {metrics?.topRouterToday?.name || "No sales yet"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {metrics?.topRouterToday
                  ? `${currency} ${metrics.topRouterToday.amount.toLocaleString()}`
                  : "—"}
              </p>
            </div>

            <div className="rounded-lg bg-card border p-2.5">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                Top Earner This Month
              </span>
              <p className="text-sm font-bold text-foreground truncate">
                {metrics?.topRouterMonth?.name || "No sales yet"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {metrics?.topRouterMonth
                  ? `${currency} ${metrics.topRouterMonth.amount.toLocaleString()}`
                  : "—"}
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search router name or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs bg-muted/30"
              />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-muted-foreground mr-1">Sort by:</span>
              <Button
                variant={sortBy === "today" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => handleSort("today")}
                className="h-7 text-xs gap-1"
              >
                Today's Income
                <ArrowUpDown className="size-3" />
              </Button>
              <Button
                variant={sortBy === "month" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => handleSort("month")}
                className="h-7 text-xs gap-1"
              >
                Month Income
                <ArrowUpDown className="size-3" />
              </Button>
              <Button
                variant={sortBy === "total" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => handleSort("total")}
                className="h-7 text-xs gap-1"
              >
                All-Time
                <ArrowUpDown className="size-3" />
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 text-muted-foreground border-b font-medium">
                  <tr>
                    <th className="py-3 px-3.5">Router</th>
                    <th className="py-3 px-3 text-right cursor-pointer" onClick={() => handleSort("today")}>
                      Today ({currency})
                    </th>
                    <th className="py-3 px-3 text-right">Yesterday</th>
                    <th className="py-3 px-3 text-right cursor-pointer" onClick={() => handleSort("month")}>
                      This Month ({currency})
                    </th>
                    <th className="py-3 px-3 text-right">Last Month</th>
                    <th className="py-3 px-3 text-right cursor-pointer" onClick={() => handleSort("total")}>
                      All-Time Total
                    </th>
                    <th className="py-3 px-3 text-center">Month Share</th>
                    <th className="py-3 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredAndSorted.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-muted-foreground">
                        No routers matching your criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredAndSorted.map((r) => (
                      <tr key={r.routerId} className="hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-3.5">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded bg-muted">
                              <Server className="size-3.5 text-primary" />
                            </div>
                            <div>
                              <p className="font-semibold text-foreground text-xs">{r.routerName}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {r.location || "Default Location"}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right">
                          <span className="font-bold text-foreground">
                            {currency} {r.incomeToday.toLocaleString()}
                          </span>
                          <span className="block text-[10px] text-muted-foreground">
                            {r.txnCountToday} sales
                          </span>
                        </td>

                        <td className="py-3 px-3 text-right text-muted-foreground">
                          <span>{currency} {r.incomeYesterday.toLocaleString()}</span>
                          <span className="block text-[10px]">
                            {r.txnCountYesterday} sales
                          </span>
                        </td>

                        <td className="py-3 px-3 text-right">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            {currency} {r.incomeThisMonth.toLocaleString()}
                          </span>
                          <span className="block text-[10px] text-muted-foreground">
                            {r.txnCountThisMonth} sales
                          </span>
                        </td>

                        <td className="py-3 px-3 text-right text-muted-foreground">
                          <span>{currency} {r.incomeLastMonth.toLocaleString()}</span>
                          <span className="block text-[10px]">
                            {r.txnCountLastMonth} sales
                          </span>
                        </td>

                        <td className="py-3 px-3 text-right">
                          <span className="font-semibold text-foreground">
                            {currency} {r.incomeTotal.toLocaleString()}
                          </span>
                          <span className="block text-[10px] text-muted-foreground">
                            {r.txnCountTotal} total sales
                          </span>
                        </td>

                        <td className="py-3 px-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <Badge variant="secondary" className="text-[10px] font-bold">
                              {r.shareOfTotalMonth}%
                            </Badge>
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full"
                                style={{ width: `${Math.min(r.shareOfTotalMonth, 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-center">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] gap-1 px-2 text-primary hover:bg-primary/10"
                            onClick={() => {
                              onOpenChange(false);
                              if (onSelectRouter) onSelectRouter(r.routerId);
                            }}
                          >
                            Details
                            <ChevronRight className="size-3" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
