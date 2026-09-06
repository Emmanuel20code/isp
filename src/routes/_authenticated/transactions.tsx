import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { listTransactions } from "@/lib/customers.functions";
import { getMyContext } from "@/lib/tenancy.functions";
import { getCurrencyByCountry } from "@/lib/payment-providers";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TrendingUp,
  Download,
  DollarSign,
  CheckCircle,
  Clock,
  XCircle,
  Search,
  Filter,
  Calendar,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({
    meta: [
      { title: "Transactions & Reports · Wifi Billing Wi-Fi Billing" },
      {
        name: "description",
        content:
          "Detailed real-time reports, M-Pesa transaction histories, and business analytics.",
      },
    ],
  }),
  component: TransactionsPage,
});

const statusColors: Record<string, string> = {
  success: "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20",
  pending: "bg-amber-500/10 text-amber-500 border border-amber-500/20",
  failed: "bg-rose-500/10 text-rose-500 border border-rose-500/20",
  cancelled: "bg-slate-500/10 text-slate-400 border border-slate-500/20",
};

const CHART_COLORS = ["#0ea5e9", "#10b981", "#6366f1", "#f59e0b", "#ec4899", "#8b5cf6"];

function TransactionsPage() {
  const fetchList = useServerFn(listTransactions);
  const fetchContext = useServerFn(getMyContext);

  const ctx = useQuery({ queryKey: ["my-context"], queryFn: () => fetchContext() });
  const currency = getCurrencyByCountry(ctx.data?.tenant?.country);
  const { data, isPending } = useQuery({ queryKey: ["transactions"], queryFn: () => fetchList() });

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const transactions = useMemo(() => data?.transactions ?? [], [data]);

  // Compute stats on actual transaction history
  const stats = useMemo(() => {
    const successPayments = transactions.filter(
      (t) => t.status === "success" && t.kind === "customer_payment",
    );
    const totalRev = successPayments.reduce((sum, t) => sum + t.amount_kes, 0);

    // Compute today's revenue (from local midnight of current day)
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayPayments = successPayments.filter(
      (t) => new Date(t.created_at).getTime() >= startOfToday,
    );
    const todayRev = todayPayments.reduce((sum, t) => sum + (t.amount_kes ?? 0), 0);
    const todayCount = todayPayments.length;

    const successCount = transactions.filter((t) => t.status === "success").length;
    const totalCount = transactions.length;
    const successRate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 100;

    const pendingCount = transactions.filter((t) => t.status === "pending").length;
    const failedCount = transactions.filter((t) => t.status === "failed").length;

    return {
      todayRevenue: todayRev,
      todayCount,
      totalRevenue: totalRev,
      successRate,
      successCount,
      pendingCount,
      failedCount,
      totalCount,
    };
  }, [transactions]);

  // Group success payments by date for last 14 days chart
  const dailyChartData = useMemo(() => {
    const successPayments = transactions.filter(
      (t) => t.status === "success" && t.kind === "customer_payment",
    );

    const grouped: Record<string, number> = {};
    // Seed last 7 days to ensure graph always has sequential dates
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      grouped[dateStr] = 0;
    }

    successPayments.forEach((t) => {
      const dateStr = new Date(t.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      if (grouped[dateStr] !== undefined) {
        grouped[dateStr] += t.amount_kes;
      } else {
        // Only keep track if it is within our target dates
        grouped[dateStr] = t.amount_kes;
      }
    });

    return Object.entries(grouped).map(([date, amount]) => ({
      date,
      amount,
    }));
  }, [transactions]);

  // Group success payments by package name
  const packageChartData = useMemo(() => {
    const successPayments = transactions.filter(
      (t) => t.status === "success" && t.kind === "customer_payment",
    );

    const counts: Record<string, number> = {};
    successPayments.forEach((t) => {
      const pkgName = t.packages?.name || "Custom / Direct Voucher";
      counts[pkgName] = (counts[pkgName] || 0) + t.amount_kes;
    });

    return Object.entries(counts).map(([name, value]) => ({
      name,
      value,
    }));
  }, [transactions]);

  // Filter list by status, search query, and date range
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = startOfToday - 6 * 24 * 60 * 60 * 1000;

    return transactions.filter((t) => {
      const tTime = new Date(t.created_at).getTime();
      if (dateFilter === "today" && tTime < startOfToday) return false;
      if (dateFilter === "week" && tTime < startOfWeek) return false;

      const matchesStatus = statusFilter === "all" || t.status === statusFilter;
      const cleanQuery = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !cleanQuery ||
        t.phone.toLowerCase().includes(cleanQuery) ||
        (t.mpesa_receipt && t.mpesa_receipt.toLowerCase().includes(cleanQuery)) ||
        (t.failure_reason && t.failure_reason.toLowerCase().includes(cleanQuery));

      return matchesStatus && matchesSearch;
    });
  }, [transactions, statusFilter, searchQuery, dateFilter]);

  // Total revenue of currently filtered successful payments
  const filteredRevenue = useMemo(() => {
    return filteredTransactions
      .filter((t) => t.status === "success" && t.kind === "customer_payment")
      .reduce((sum, t) => sum + t.amount_kes, 0);
  }, [filteredTransactions]);

  // CSV Export utility
  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) return;

    const headers = [
      "ID",
      "Date/Time",
      "Customer Phone",
      "Type",
      `Amount (${currency})`,
      "M-Pesa Receipt",
      "Status",
      "Package Name",
      "Failure Reason",
    ];

    const rows = filteredTransactions.map((t) => [
      t.id,
      new Date(t.created_at).toISOString(),
      t.phone,
      t.kind,
      t.amount_kes,
      t.mpesa_receipt || "",
      t.status,
      t.packages?.name || (t.kind === "saas_subscription" ? "SaaS Renewal" : "Direct Code"),
      t.failure_reason || "",
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [
        headers.join(","),
        ...rows.map((row) =>
          row
            .map((val) => {
              const stringVal = typeof val === "string" ? val : String(val);
              return `"${stringVal.replace(/"/g, '""')}"`;
            })
            .join(","),
        ),
      ].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const filterSuffix = dateFilter === "today" ? "today_" : dateFilter === "week" ? "week_" : "";
    link.setAttribute(
      "download",
      `revenue_report_${filterSuffix}${new Date().toISOString().split("T")[0]}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <AppShell isSuperAdmin={ctx.data?.isSuperAdmin ?? false}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports &amp; Transactions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Analyze revenue trends, customer plans, and export historical payment ledger data.
          </p>
        </div>
        <Button
          onClick={handleExportCSV}
          disabled={filteredTransactions.length === 0}
          className="gap-2 shrink-0 border border-primary/20 bg-primary/10 text-primary hover:bg-primary/20"
          variant="outline"
          size="sm"
        >
          <Download className="size-4" /> Export Filtered to CSV
        </Button>
      </div>

      {isPending ? (
        <div className="mt-8 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="h-64 col-span-2" />
            <Skeleton className="h-64" />
          </div>
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {/* Statistical Highlights */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* 1. Today's Revenue */}
            <Card className="border border-emerald-500/30 bg-emerald-500/[0.04] col-span-2 sm:col-span-1">
              <CardContent className="p-5 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      Today's Revenue
                    </p>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      Live
                    </span>
                  </div>
                  <p className="text-xl font-bold text-foreground">
                    {currency} {stats.todayRevenue.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {stats.todayCount} {stats.todayCount === 1 ? "sale" : "sales"} today
                  </p>
                </div>
                <div className="p-2.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                  <Calendar className="size-5" />
                </div>
              </CardContent>
            </Card>

            {/* 2. Total Revenue */}
            <Card className="border border-border/80">
              <CardContent className="p-5 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Total Revenue</p>
                  <p className="text-xl font-bold">
                    {currency} {stats.totalRevenue.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-muted-foreground">All-time customer sales</p>
                </div>
                <div className="p-2.5 rounded-lg bg-sky-500/10 text-sky-500 shrink-0">
                  <DollarSign className="size-5" />
                </div>
              </CardContent>
            </Card>

            {/* 3. Success Rate */}
            <Card className="border border-border/80">
              <CardContent className="p-5 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Success Rate</p>
                  <p className="text-xl font-bold">{stats.successRate}%</p>
                  <p className="text-[11px] text-muted-foreground">Completed vs. total</p>
                </div>
                <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-500 shrink-0">
                  <TrendingUp className="size-5" />
                </div>
              </CardContent>
            </Card>

            {/* 4. Completed Sales Count */}
            <Card className="border border-border/80">
              <CardContent className="p-5 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Completed Sales</p>
                  <p className="text-xl font-bold">{stats.successCount}</p>
                  <p className="text-[11px] text-muted-foreground">Successful transactions</p>
                </div>
                <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0">
                  <CheckCircle className="size-5" />
                </div>
              </CardContent>
            </Card>

            {/* 5. Pending / Failed */}
            <Card className="border border-border/80 col-span-2 md:col-span-1">
              <CardContent className="p-5 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Pending / Failed</p>
                  <p className="text-xl font-bold">
                    {stats.pendingCount} / {stats.failedCount}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Uncompleted attempts</p>
                </div>
                <div className="p-2.5 rounded-lg bg-rose-500/10 text-rose-500 shrink-0">
                  <XCircle className="size-5" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Graphical Analytics */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Daily Revenue trend */}
            <Card className="lg:col-span-2 border border-border/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="size-4 text-sky-500" /> Daily Revenue (Past 7 Days)
                </CardTitle>
                <CardDescription className="text-xs">
                  Successful customer Wi-Fi plan purchases in {currency}.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-1 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyChartData}>
                    <defs>
                      <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      stroke="#888888"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#888888"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `KES ${v}`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0f172a",
                        border: "1px solid #334155",
                        borderRadius: "8px",
                        fontSize: "11px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      name="Revenue (KES)"
                      stroke="#0ea5e9"
                      fillOpacity={1}
                      fill="url(#colorAmount)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Plan Breakdown */}
            <Card className="border border-border/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <DollarSign className="size-4 text-emerald-500" /> Revenue by Package Plan
                </CardTitle>
                <CardDescription className="text-xs">
                  Distribution of Wi-Fi sales by package.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-1 h-64 flex flex-col items-center justify-center">
                {packageChartData.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No package sales recorded.</p>
                ) : (
                  <>
                    <div className="w-full h-[180px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={packageChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={65}
                            paddingAngle={4}
                            dataKey="value"
                          >
                            {packageChartData.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={CHART_COLORS[index % CHART_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              background: "#0f172a",
                              border: "1px solid #334155",
                              borderRadius: "8px",
                              fontSize: "11px",
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 w-full mt-2 overflow-y-auto max-h-16 text-[10px]">
                      {packageChartData.map((entry, index) => (
                        <div key={entry.name} className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="size-2 rounded-full shrink-0"
                            style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                          />
                          <span className="truncate text-muted-foreground">{entry.name}</span>
                          <span className="font-semibold ml-auto shrink-0">
                            {currency} {entry.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Interactive Ledger list */}
          <Card className="border border-border/80">
            <CardHeader className="pb-3 border-b border-border/60">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-semibold">Ledger Entries</CardTitle>
                    {dateFilter === "today" && (
                      <Badge
                        variant="outline"
                        className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px]"
                      >
                        Today's View: {currency} {filteredRevenue.toLocaleString()}
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs">
                    {dateFilter === "today"
                      ? `Showing transactions received today. Total: ${currency} ${filteredRevenue.toLocaleString()} (${filteredTransactions.length} records).`
                      : dateFilter === "week"
                        ? `Showing transactions from the past 7 days. Total: ${currency} ${filteredRevenue.toLocaleString()} (${filteredTransactions.length} records).`
                        : "Every transaction received or created by Safaricom Daraja integrations."}
                  </CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-full sm:w-44">
                    <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search phone or receipt..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 h-8 text-xs w-full"
                    />
                  </div>

                  {/* Date Period Filter */}
                  <div className="flex items-center gap-0.5 bg-muted p-1 rounded-md border border-border/50">
                    {[
                      { id: "all", label: "All Time" },
                      { id: "today", label: "Today" },
                      { id: "week", label: "7 Days" },
                    ].map((d) => (
                      <button
                        key={d.id}
                        onClick={() => setDateFilter(d.id as "all" | "today" | "week")}
                        className={`text-[10px] font-medium py-1 px-2.5 rounded-sm transition-all ${
                          dateFilter === d.id
                            ? "bg-background text-foreground shadow-sm font-semibold"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>

                  {/* Status Filter */}
                  <div className="flex items-center gap-0.5 bg-muted p-1 rounded-md border border-border/50">
                    {["all", "success", "pending", "failed"].map((st) => (
                      <button
                        key={st}
                        onClick={() => setStatusFilter(st)}
                        className={`text-[10px] capitalize font-medium py-1 px-2 rounded-sm transition-all ${
                          statusFilter === st
                            ? "bg-background text-foreground shadow-sm font-semibold"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/60 max-h-[400px] overflow-y-auto">
                {filteredTransactions.length === 0 ? (
                  <div className="text-center py-12 text-sm text-muted-foreground">
                    No ledger entries matched your filter parameters.
                  </div>
                ) : (
                  filteredTransactions.map((t) => (
                    <div
                      key={t.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-muted/30 transition-colors"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm text-foreground">
                            {currency} {t.amount_kes.toLocaleString()}
                          </p>
                          <Badge
                            variant="outline"
                            className={`px-1.5 py-0.5 text-[9px] rounded-sm font-medium ${
                              t.kind === "saas_subscription"
                                ? "bg-indigo-500/10 text-indigo-500 border-indigo-500/20"
                                : "bg-sky-500/10 text-sky-500 border-sky-500/20"
                            }`}
                          >
                            {t.kind === "saas_subscription" ? "SaaS Subscription" : "WiFi Customer"}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground text-[11px]">
                          <span className="font-medium text-foreground">{t.phone}</span>
                          {t.mpesa_receipt && (
                            <>
                              {" "}
                              · Receipt: <code className="text-foreground">{t.mpesa_receipt}</code>
                            </>
                          )}
                          {t.packages?.name && (
                            <>
                              {" "}
                              · Plan: <span className="text-foreground">{t.packages.name}</span>
                            </>
                          )}
                        </p>
                        {t.failure_reason && (
                          <p className="text-rose-500/90 text-[10px] leading-relaxed">
                            Error: {t.failure_reason}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center sm:text-right sm:flex-col gap-2 sm:gap-1.5 shrink-0 ml-auto sm:ml-0">
                        <Badge
                          className={`px-1.5 py-0.5 text-[9px] ${statusColors[t.status] || ""}`}
                        >
                          {t.status}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(t.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
