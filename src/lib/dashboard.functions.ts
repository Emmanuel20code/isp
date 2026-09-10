import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { startOfMonthUtc, startOfTodayUtc } from "@/lib/billing-helpers";
import { computeRouterStatus } from "@/lib/mikrotik";
import { z } from "zod";

export const disconnectActiveSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ customerId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { enqueueRouterCommands } = await import("@/lib/agent-commands.server");

    const { data: customer } = await supabase
      .from("customers")
      .select("id, tenant_id, router_id, username, phone, mac_address, kind")
      .eq("id", data.customerId)
      .maybeSingle();

    if (!customer) throw new Error("Session customer not found");

    if (customer.router_id) {
      await enqueueRouterCommands([
        {
          tenantId: customer.tenant_id,
          routerId: customer.router_id,
          action: customer.kind === "pppoe" ? "pppoe.disconnect" : "hotspot.disconnect",
          payload: {
            username: customer.username || customer.phone,
            mac: customer.mac_address,
          },
        },
      ]);
    }

    return {
      ok: true,
      message: `Disconnect command sent to MikroTik for ${customer.phone || customer.username || "session"}`,
    };
  });

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
    console.log(`[Dashboard] Fetching dashboard for user ${userId}, tenant ${tenantId}`);

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
      { data: heartbeats },
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
        .select(
          "id, phone, full_name, username, mac_address, kind, status, expires_at, created_at, router_id, packages(id, name, speed_down_mbps, speed_up_mbps), routers(id, name, location, status, public_ip)",
        )
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .order("expires_at", { ascending: true })
        .limit(20),
      supabase
        .from("router_heartbeats")
        .select("id, router_id, raw, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(30),
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

    const routerMap = new Map((routers ?? []).map((r) => [r.id, r]));
    const defaultRouter = routers && routers.length === 1 ? routers[0] : null;

    // Parse live telemetry from latest heartbeats to enrich active sessions
    const liveHosts = new Map<string, { ip?: string; uptime?: string; bytesIn?: number; bytesOut?: number }>();
    for (const hb of heartbeats ?? []) {
      const raw = hb.raw as any;
      if (!raw) continue;
      const hostList: any[] = Array.isArray(raw.hosts)
        ? raw.hosts
        : Array.isArray(raw.body?.hosts)
          ? raw.body.hosts
          : [];

      for (const h of hostList) {
        const rawMac = h.mac || h.mac_address || h["mac-address"];
        if (!rawMac || typeof rawMac !== "string") continue;
        const cleanMac = rawMac.toLowerCase().replace(/[^a-f0-9]/g, "");
        if (!cleanMac) continue;

        const uniqueKey = `${hb.router_id}-${cleanMac}`;
        if (!liveHosts.has(uniqueKey)) {
          liveHosts.set(uniqueKey, {
            ip: h.ip || h.address || undefined,
            uptime: h.uptime ? String(h.uptime) : undefined,
            bytesIn: Number(h.bytes_in || h["bytes-in"]) || undefined,
            bytesOut: Number(h.bytes_out || h["bytes-out"]) || undefined,
          });
        }
      }
    }

    const mappedActiveSessions = (activeSessions ?? []).map((session: any) => {
      const sessionRouter =
        session.routers ||
        (session.router_id ? routerMap.get(session.router_id) : null) ||
        defaultRouter;

      const cleanMac = session.mac_address
        ? session.mac_address.toLowerCase().replace(/[^a-f0-9]/g, "")
        : "";
      const telemetry = session.router_id && cleanMac
        ? liveHosts.get(`${session.router_id}-${cleanMac}`)
        : null;

      return {
        ...session,
        ip_address: telemetry?.ip || null,
        bytes_in: telemetry?.bytesIn || null,
        bytes_out: telemetry?.bytesOut || null,
        uptime: telemetry?.uptime || null,
        router_name: sessionRouter?.name || "All / Default Router",
        router_location: sessionRouter?.location || null,
        router_status: sessionRouter?.status || "online",
        routers: sessionRouter
          ? {
              id: sessionRouter.id,
              name: sessionRouter.name,
              location: sessionRouter.location,
              status: sessionRouter.status,
              public_ip: sessionRouter.public_ip,
            }
          : null,
      };
    });

    return {
      tenantId,
      routers: mappedRouters,
      packages: packages ?? [],
      activeSessions: mappedActiveSessions,
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
