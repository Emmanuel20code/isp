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
  TrendingUp,
  TrendingDown,
  Calendar,
  DollarSign,
  Download,
  Receipt,
  Search,
  Server,
  Activity,
  ArrowUpRight,
  Clock,
  Sparkles,
  PieChart as PieChartIcon,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { RouterRevenueData } from "@/lib/network.functions";

interface RouterRevenueModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  router: {
    id: string;
    name: string;
    location?: string | null;
    status?: string;
    revenue?: RouterRevenueData;
  } | null;
  currency?: string;
}

export function RouterRevenueModal({
  open,
  onOpenChange,
  router,
  currency = "KES",
}: RouterRevenueModalProps) {
  const [activeTab, setActiveTab] = useState<"daily" | "monthly">("daily");
  const [searchTxn, setSearchTxn] = useState("");

  const rev = router?.revenue;

  const todayVsYesterday = useMemo(() => {
    if (!rev) return { diff: 0, percent: 0, isUp: true };
    const diff = rev.incomeToday - rev.incomeYesterday;
    const percent =
      rev.incomeYesterday > 0
        ? Math.round((diff / rev.incomeYesterday) * 100)
        : rev.incomeToday > 0
          ? 100
          : 0;
    return { diff, percent, isUp: diff >= 0 };
  }, [rev]);

  const monthVsLastMonth = useMemo(() => {
    if (!rev) return { diff: 0, percent: 0, isUp: true };
    const diff = rev.incomeThisMonth - rev.incomeLastMonth;
    const percent =
      rev.incomeLastMonth > 0
        ? Math.round((diff / rev.incomeLastMonth) * 100)
        : rev.incomeThisMonth > 0
          ? 100
          : 0;
    return { diff, percent, isUp: diff >= 0 };
  }, [rev]);

  const filteredTransactions = useMemo(() => {
    if (!rev?.recentTransactions) return [];
    if (!searchTxn.trim()) return rev.recentTransactions;
    const q = searchTxn.toLowerCase();
    return rev.recentTransactions.filter(
      (t) =>
        t.phone.toLowerCase().includes(q) ||
        (t.receipt && t.receipt.toLowerCase().includes(q)) ||
        (t.packageName && t.packageName.toLowerCase().includes(q)) ||
        t.amountKes.toString().includes(q),
    );
  }, [rev, searchTxn]);

  const exportCsv = () => {
    if (!rev || !router) return;
    const rows = [
      ["Receipt", "Phone", "Package", "Amount (KES)", "Date/Time"],
      ...rev.recentTransactions.map((t) => [
        t.receipt || "N/A",
        t.phone,
        t.packageName || "Wi-Fi Plan",
        t.amountKes.toString(),
        new Date(t.createdAt).toLocaleString(),
      ]),
    ];

    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `${router.name.replace(/\s+/g, "_")}_sales_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!router) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-0 gap-0 border-border bg-card">
        {/* Header */}
        <div className="p-5 border-b bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Server className="size-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold flex items-center gap-2">
                    {router.name}
                    <Badge variant="outline" className="font-normal text-xs bg-muted/50">
                      {router.location || "Default Location"}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    Real-time revenue attribution & payment analytics for this router
                  </DialogDescription>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exportCsv}
                disabled={!rev?.recentTransactions?.length}
                className="h-8 text-xs gap-1.5"
              >
                <Download className="size-3.5" />
                Export CSV
              </Button>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-6">
          {/* Key Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Daily Income */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-2 shadow-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Income Today</span>
                <Calendar className="size-4 text-primary" />
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {currency} {(rev?.incomeToday ?? 0).toLocaleString()}
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{rev?.txnCountToday ?? 0} sales today</span>
                  <span
                    className={`flex items-center font-medium ${
                      todayVsYesterday.isUp
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {todayVsYesterday.isUp ? (
                      <TrendingUp className="size-3 mr-0.5" />
                    ) : (
                      <TrendingDown className="size-3 mr-0.5" />
                    )}
                    {todayVsYesterday.percent > 0 ? `${todayVsYesterday.percent}%` : "0%"} vs yest.
                  </span>
                </div>
              </div>
            </div>

            {/* Monthly Income */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-2 shadow-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Income This Month</span>
                <DollarSign className="size-4 text-emerald-500" />
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {currency} {(rev?.incomeThisMonth ?? 0).toLocaleString()}
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{rev?.txnCountThisMonth ?? 0} sales this month</span>
                  <span
                    className={`flex items-center font-medium ${
                      monthVsLastMonth.isUp
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {monthVsLastMonth.isUp ? (
                      <TrendingUp className="size-3 mr-0.5" />
                    ) : (
                      <TrendingDown className="size-3 mr-0.5" />
                    )}
                    {monthVsLastMonth.percent > 0 ? `${monthVsLastMonth.percent}%` : "0%"} vs last mo.
                  </span>
                </div>
              </div>
            </div>

            {/* Yesterday / Last Month Benchmark */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-2 shadow-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Prior Period</span>
                <Clock className="size-4 text-amber-500" />
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Yesterday:</span>
                  <span className="font-semibold text-foreground">
                    {currency} {(rev?.incomeYesterday ?? 0).toLocaleString()} ({rev?.txnCountYesterday ?? 0})
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-border/50">
                  <span className="text-muted-foreground">Last Month:</span>
                  <span className="font-semibold text-foreground">
                    {currency} {(rev?.incomeLastMonth ?? 0).toLocaleString()} ({rev?.txnCountLastMonth ?? 0})
                  </span>
                </div>
              </div>
            </div>

            {/* All Time & Contribution */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-2 shadow-xs">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">All-Time Totals</span>
                <PieChartIcon className="size-4 text-sky-500" />
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {currency} {(rev?.incomeTotal ?? 0).toLocaleString()}
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{rev?.txnCountTotal ?? 0} total sales</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                    {rev?.shareOfTotalMonth ?? 0}% of network
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Chart Section */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Activity className="size-4 text-primary" />
                  Revenue Trends & Growth
                </h3>
                <p className="text-xs text-muted-foreground">
                  {activeTab === "daily"
                    ? "Daily income breakdown for the past 14 days"
                    : "Monthly income performance over recent months"}
                </p>
              </div>

              <div className="flex items-center rounded-lg border bg-muted/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setActiveTab("daily")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    activeTab === "daily"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  14-Day Daily
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("monthly")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    activeTab === "monthly"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Monthly Trend
                </button>
              </div>
            </div>

            <div className="h-56 w-full pt-2">
              {activeTab === "daily" ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={rev?.dailyTrend ?? []}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorDaily" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      tickMargin={8}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      tickFormatter={(v) => `${v}`}
                    />
                    <Tooltip
                      formatter={(val: number | undefined) => [
                        `${currency} ${(val ?? 0).toLocaleString()}`,
                        "Income",
                      ]}
                      labelFormatter={(label) => `Date: ${label}`}
                      contentStyle={{
                        backgroundColor: "#090d16",
                        borderColor: "#1e293b",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      stroke="#0ea5e9"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#colorDaily)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={rev?.monthlyTrend ?? []}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      tickMargin={8}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      tickFormatter={(v) => `${v}`}
                    />
                    <Tooltip
                      formatter={(val: number | undefined) => [
                        `${currency} ${(val ?? 0).toLocaleString()}`,
                        "Income",
                      ]}
                      labelFormatter={(label) => `Month: ${label}`}
                      contentStyle={{
                        backgroundColor: "#090d16",
                        borderColor: "#1e293b",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Bar dataKey="amount" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Recent Payments Received on This Router */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-0.5">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Receipt className="size-4 text-primary" />
                  Recent Sales via {router.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Latest customer payments attributed to this router
                </p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Filter receipt, phone, package..."
                  value={searchTxn}
                  onChange={(e) => setSearchTxn(e.target.value)}
                  className="h-8 pl-8 text-xs bg-muted/30"
                />
              </div>
            </div>

            {filteredTransactions.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-xs rounded-lg border border-dashed p-4">
                No recent payment transactions found for this router.
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/40 text-muted-foreground border-b font-medium">
                      <tr>
                        <th className="py-2.5 px-3">Receipt / ID</th>
                        <th className="py-2.5 px-3">Customer Phone</th>
                        <th className="py-2.5 px-3">Package</th>
                        <th className="py-2.5 px-3">Amount</th>
                        <th className="py-2.5 px-3">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {filteredTransactions.map((txn) => (
                        <tr key={txn.id} className="hover:bg-muted/20 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-medium text-foreground">
                            {txn.receipt || txn.id.slice(0, 8)}
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground font-mono">
                            {txn.phone}
                          </td>
                          <td className="py-2.5 px-3 text-foreground font-medium">
                            {txn.packageName || "Wi-Fi Plan"}
                          </td>
                          <td className="py-2.5 px-3 text-emerald-600 dark:text-emerald-400 font-semibold">
                            {currency} {txn.amountKes.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground">
                            {new Date(txn.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              month: "short",
                              day: "numeric",
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
