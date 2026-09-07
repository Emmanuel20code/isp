import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { startOfMonthUtc, startOfTodayUtc } from "@/lib/billing-helpers";
import { computeRouterStatus } from "@/lib/mikrotik";

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: membership } = await supabase
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userId)
      .maybeSingle();

    const tenantId = membership?.tenant_id ?? null;

    // Trigger background maintenance task (rate-limited internally)
    try {
      const { runBackgroundMaintenance } = await import("@/lib/maintenance.server");
      runBackgroundMaintenance().catch((err) =>
        console.error("[Dashboard] Background maintenance error:", err),
      );
    } catch (e) {
      // Ignore if server-side import fails or not available
    }

    if (!tenantId) {
      return {
        tenantId: null,
        routers: [],
        packages: [],
        stats: {
          incomeToday: 0,
          incomeMonth: 0,
          activeCustomers: 0,
          expiredCustomers: 0,
          totalCustomers: 0,
          vouchersUnused: 0,
          vouchersActive: 0,
          paymentsToday: 0,
        },
      };
    }

    const dayStart = startOfTodayUtc().toISOString();
    const monthStart = startOfMonthUtc().toISOString();

    const [
      { data: routers },
      { data: packages },
      { data: todayTxns },
      { data: monthTxns },
      { data: todayCashVouchers },
      { data: monthCashVouchers },
      { count: activeHotspot },
      { count: expiredHotspot },
      { count: activePPPoE },
      { count: expiredPPPoE },
      { count: totalCustomers },
      { count: vouchersUnused },
      { count: vouchersActive },
      { data: activeSessions },
    ] = await Promise.all([
      supabase
        .from("routers")
        .select(
          "id, name, location, status, last_seen_at, ros_version, active_hotspot_users, active_pppoe_users, cpu_load, public_ip",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false }),
      supabase
        .from("packages")
        .select("id, name, kind, price_kes, duration_hours, is_active")
        .eq("tenant_id", tenantId)
        .order("price_kes", { ascending: true }),
      supabase
        .from("transactions")
        .select("amount_kes, voucher_id")
        .eq("tenant_id", tenantId)
        .eq("kind", "customer_payment")
        .eq("status", "success")
        .gte("created_at", dayStart),
      supabase
        .from("transactions")
        .select("amount_kes, voucher_id")
        .eq("tenant_id", tenantId)
        .eq("kind", "customer_payment")
        .eq("status", "success")
        .gte("created_at", monthStart),
      // Vouchers created today that might be cash sales
      supabase
        .from("vouchers")
        .select("id, packages(price_kes)")
        .eq("tenant_id", tenantId)
        .gte("created_at", dayStart),
      // Vouchers created this month that might be cash sales
      supabase
        .from("vouchers")
        .select("id, packages(price_kes)")
        .eq("tenant_id", tenantId)
        .gte("created_at", monthStart),
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("kind", "hotspot")
        .eq("status", "active"),
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("kind", "hotspot")
        .eq("status", "expired"),
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("kind", "pppoe")
        .eq("status", "active"),
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("kind", "pppoe")
        .eq("status", "expired"),
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
      supabase
        .from("vouchers")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "unused"),
      supabase
        .from("vouchers")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "active"),
      supabase
        .from("customers")
        .select("id, phone, expires_at, status, packages(name)")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .order("expires_at", { ascending: true })
        .limit(10),
    ]);

    const sumTxns = (rows: { amount_kes: number }[] | null) =>
      (rows ?? []).reduce((acc, r) => acc + (r.amount_kes ?? 0), 0);

    type VoucherWithPackage = {
      id: string;
      packages: { price_kes?: number | null } | null;
    };

    const sumCashVouchers = (
      vouchers: VoucherWithPackage[] | null,
      txns: { voucher_id: string | null }[] | null,
    ) => {
      if (!vouchers) return 0;
      const linkedVoucherIds = new Set((txns ?? []).map((t) => t.voucher_id).filter(Boolean));
      return vouchers.reduce((acc, v) => {
        if (linkedVoucherIds.has(v.id)) return acc;
        const price = v.packages?.price_kes ?? 0;
        return acc + price;
      }, 0);
    };

    const incomeToday = sumTxns(todayTxns) + sumCashVouchers(todayCashVouchers, todayTxns);
    const incomeMonth = sumTxns(monthTxns) + sumCashVouchers(monthCashVouchers, monthTxns);

    const { calculateNetworkRevenue } = await import("@/lib/network.functions");
    const revenueMetrics = await calculateNetworkRevenue(
      supabase,
      tenantId,
      (routers ?? []) as any,
    );

    const mappedRouters = (routers ?? []).map((r) => {
      const rev = revenueMetrics.routers.find((ro) => ro.routerId === r.id);
      return {
        ...r,
        status: computeRouterStatus(r),
        revenue: {
          incomeToday: rev?.incomeToday ?? 0,
          txnCountToday: rev?.txnCountToday ?? 0,
          incomeYesterday: rev?.incomeYesterday ?? 0,
          incomeThisMonth: rev?.incomeThisMonth ?? 0,
          txnCountThisMonth: rev?.txnCountThisMonth ?? 0,
          incomeLastMonth: rev?.incomeLastMonth ?? 0,
          incomeTotal: rev?.incomeTotal ?? 0,
          txnCountTotal: rev?.txnCountTotal ?? 0,
          shareOfTotalMonth: rev?.shareOfTotalMonth ?? 0,
          shareOfTotalToday: rev?.shareOfTotalToday ?? 0,
        },
      };
    });

    return {
      tenantId,
      routers: mappedRouters,
      packages: packages ?? [],
      activeSessions: activeSessions ?? [],
      revenueMetrics,
      stats: {
        incomeToday,
        incomeMonth,
        activeHotspot: activeHotspot ?? 0,
        expiredHotspot: expiredHotspot ?? 0,
        activePPPoE: activePPPoE ?? 0,
        expiredPPPoE: expiredPPPoE ?? 0,
        totalCustomers: totalCustomers ?? 0,
        vouchersUnused: vouchersUnused ?? 0,
        vouchersActive: vouchersActive ?? 0,
        paymentsToday: (todayTxns ?? []).length,
      },
    };
  });

export const getDailyIncomeMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { days: number }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: membership } = await supabase
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userId)
      .maybeSingle();
    const tenantId = membership?.tenant_id ?? null;
    if (!tenantId) return [];

    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - data.days + 1);
    startDate.setUTCHours(0, 0, 0, 0);

    const { data: txns } = await supabase
      .from("transactions")
      .select("amount_kes, created_at")
      .eq("tenant_id", tenantId)
      .eq("kind", "customer_payment")
      .eq("status", "success")
      .gte("created_at", startDate.toISOString());

    const dailyData: Record<string, number> = {};

    for (let i = 0; i < data.days; i++) {
      const d = new Date(startDate.getTime());
      d.setUTCDate(d.getUTCDate() + i);
      const dayString = d.toISOString().split("T")[0];
      dailyData[dayString] = 0;
    }

    if (txns) {
      for (const txn of txns) {
        if (!txn.created_at) continue;
        const dayString = new Date(txn.created_at).toISOString().split("T")[0];
        if (dailyData[dayString] !== undefined) {
          dailyData[dayString] += txn.amount_kes || 0;
        }
      }
    }

    return Object.entries(dailyData)
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date));
  });

export const updateDashboardSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { order: string[] }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: membership } = await supabase
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership?.tenant_id) throw new Error("No tenant found");

    const { data: tenant } = await supabase
      .from("tenants")
      .select("settings")
      .eq("id", membership.tenant_id)
      .maybeSingle();

    const settings = (tenant?.settings as Record<string, unknown>) || {};
    settings.dashboard_order = data.order;

    await supabase.from("tenants").update({ settings }).eq("id", membership.tenant_id);

    return { success: true };
  });
