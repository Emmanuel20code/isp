import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enqueueRouterCommands } from "@/lib/agent-commands.server";
import { startOfMonthUtc, startOfTodayUtc } from "@/lib/billing-helpers";
import { computeRouterStatus } from "@/lib/mikrotik";

async function requireTenant(supabase: Record<string, unknown>, userId: string): Promise<string> {
  const { data } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.tenant_id) throw new Error("No business found for this account");
  return data.tenant_id;
}

export const getPPPoEStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);

    const dayStart = startOfTodayUtc().toISOString();
    const monthStart = startOfMonthUtc().toISOString();

    const [
      { count: total },
      { count: active },
      { count: expired },
      { count: suspended },
      { data: routers },
      { data: todayTxns },
      { data: monthTxns },
    ] = await Promise.all([
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("kind", "pppoe"),
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
        .eq("tenant_id", tenantId)
        .eq("kind", "pppoe")
        .eq("status", "suspended"),
      supabase
        .from("routers")
        .select(
          "id, name, status, last_seen_at, active_pppoe_users, public_ip, ros_version, onboarded_at, is_disabled, model, lan_subnet",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false }),
      // Only get transactions for PPPoE customers
      supabase
        .from("transactions")
        .select("amount_kes, customers!inner(kind)")
        .eq("tenant_id", tenantId)
        .eq("kind", "customer_payment")
        .eq("status", "success")
        .eq("customers.kind", "pppoe")
        .gte("created_at", dayStart),
      supabase
        .from("transactions")
        .select("amount_kes, customers!inner(kind)")
        .eq("tenant_id", tenantId)
        .eq("kind", "customer_payment")
        .eq("status", "success")
        .eq("customers.kind", "pppoe")
        .gte("created_at", monthStart),
    ]);

    const mappedRouters = (routers ?? []).map((r) => ({
      ...r,
      status: computeRouterStatus(r),
    }));

    const sumTxns = (rows: { amount_kes: number }[] | null) =>
      (rows ?? []).reduce((acc, r) => acc + (r.amount_kes ?? 0), 0);

    const onlineCount = mappedRouters.reduce((acc, r) => acc + (r.active_pppoe_users ?? 0), 0);

    return {
      total: total ?? 0,
      active: active ?? 0,
      expired: expired ?? 0,
      suspended: suspended ?? 0,
      online: onlineCount,
      incomeToday: sumTxns(todayTxns),
      incomeMonth: sumTxns(monthTxns),
      routers: mappedRouters,
    };
  });

export const getPPPoERouters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);
    const { data: routers } = await supabase
      .from("routers")
      .select(
        "id, name, status, last_seen_at, active_pppoe_users, public_ip, ros_version, onboarded_at, is_disabled, model, lan_subnet",
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    return (routers ?? []).map((r) => ({
      ...r,
      status: computeRouterStatus(r),
    }));
  });

export const getPPPoECustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);
    const { data } = await supabase
      .from("customers")
      .select(
        `
        *,
        packages(name, price_kes, duration_hours, speed_up_mbps, speed_down_mbps),
        routers(name, status)
      `,
      )
      .eq("tenant_id", tenantId)
      .eq("kind", "pppoe")
      .order("created_at", { ascending: false });

    return data ?? [];
  });

export type PPPoECustomerInput = {
  id?: string | null;
  full_name: string;
  phone: string;
  username: string;
  password?: string | null;
  package_id?: string | null;
  router_id?: string | null;
  status?: string | null;
  expires_at?: string | null;
};

export const savePPPoECustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: PPPoECustomerInput) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);
    const isNew = !data.id;

    let calculatedExpiry = data.expires_at;
    let pkg: {
      name: string;
      duration_hours: number;
      speed_up_mbps: number;
      speed_down_mbps: number;
    } | null = null;

    if (data.package_id) {
      const { data: pkgData } = await supabase
        .from("packages")
        .select("name, duration_hours, speed_up_mbps, speed_down_mbps")
        .eq("id", data.package_id)
        .single();
      pkg = pkgData;
      if (!calculatedExpiry && pkg?.duration_hours) {
        calculatedExpiry = new Date(Date.now() + pkg.duration_hours * 3600 * 1000).toISOString();
      }
    }

    const payload = {
      tenant_id: tenantId,
      full_name: data.full_name,
      phone: data.phone,
      kind: "pppoe",
      username: data.username,
      password: data.password || data.username,
      package_id: data.package_id || null,
      router_id: data.router_id || null,
      status: data.status || "active",
      expires_at: calculatedExpiry || null,
    };

    let customerId = data.id;

    if (isNew) {
      const { data: newCust, error } = await supabase
        .from("customers")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      customerId = newCust.id;
    } else {
      const { error } = await supabase.from("customers").update(payload).eq("id", data.id);
      if (error) throw error;
    }

    // Sync with router
    if (data.router_id) {
      const isSuspended = (data.status || "active") !== "active";
      await enqueueRouterCommands([
        {
          tenantId,
          routerId: data.router_id,
          action: "pppoe.create_user",
          payload: {
            username: data.username,
            password: data.password || data.username,
            profile: isSuspended ? "wfb-ppp-expired" : (pkg?.name || "default"),
            rate_limit: pkg
              ? `${pkg.speed_up_mbps || 10}M/${pkg.speed_down_mbps || 10}M`
              : undefined,
            disabled: false,
            comment: `PPPoE: ${data.full_name} (${data.phone})`,
          },
        },
      ]);
    }

    return { success: true, id: customerId };
  });

export const suspendPPPoECustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string; status: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);
    const { data: customer } = await supabase
      .from("customers")
      .select("*")
      .eq("id", data.id)
      .single();

    if (!customer) throw new Error("Customer not found");

    await supabase.from("customers").update({ status: data.status }).eq("id", data.id);

    if (customer.router_id) {
      // On MikroTik, we assign the expired profile instead of disabling so they can be redirected
      await enqueueRouterCommands([
        {
          tenantId,
          routerId: customer.router_id,
          action: "pppoe.update_user",
          payload: {
            username: customer.username,
            disabled: false,
            profile: data.status === "active" ? (customer.package_id || "default") : "wfb-ppp-expired",
          },
        },
      ]);
    }

    return { success: true };
  });

export const resetPPPoEPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string; password?: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);
    const password = data.password || Math.random().toString(36).slice(-8);

    const { data: customer } = await supabase
      .from("customers")
      .select("*")
      .eq("id", data.id)
      .single();
    if (!customer) throw new Error("Customer not found");

    await supabase.from("customers").update({ password }).eq("id", data.id);

    if (customer.router_id) {
      await enqueueRouterCommands([
        {
          tenantId,
          routerId: customer.router_id,
          action: "pppoe.update_user",
          payload: {
            username: customer.username,
            password: password,
          },
        },
      ]);
    }

    return { success: true, password };
  });

export const syncPPPoERouter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { routerId: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);
    const { data: customers } = await supabase
      .from("customers")
      .select("*, packages(name)")
      .eq("tenant_id", tenantId)
      .eq("router_id", data.routerId)
      .eq("kind", "pppoe");

    if (!customers || customers.length === 0) return { success: true, synced: 0 };

    const commands = customers.map((c) => ({
      tenantId,
      routerId: data.routerId,
      action: "pppoe.create_user",
      payload: {
        username: c.username,
        password: c.password,
        profile: c.packages?.name || "default",
        disabled: c.status !== "active",
        comment: `Sync: ${c.id}`,
      },
    }));

    await enqueueRouterCommands(commands);

    return { success: true, synced: commands.length };
  });

export const getPPPoEActiveSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);

    // Fetch customers marked as active with PPPoE
    const { data: activeCustomers } = await supabase
      .from("customers")
      .select(
        `
        id,
        username,
        full_name,
        phone,
        mac_address,
        status,
        expires_at,
        created_at,
        packages(name)
      `,
      )
      .eq("tenant_id", tenantId)
      .eq("kind", "pppoe")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    return (activeCustomers ?? []).map((c) => ({
      id: c.id,
      username: c.username,
      ip_address: "PPPoE Dynamic",
      connected_at: c.created_at,
      uptime: "Active",
      bytes_in_formatted: "0 B",
      bytes_out_formatted: "0 B",
      customers: {
        full_name: c.full_name,
        phone: c.phone,
        packages: c.packages,
      },
    }));
  });
