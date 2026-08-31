import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enqueueRouterCommands } from "@/lib/agent-commands.server";
import { startOfMonthUtc, startOfTodayUtc } from "@/lib/billing-helpers";

export const getPPPoEStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, tenantId } = context;

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
        .select("id, name, status, active_pppoe_users")
        .eq("tenant_id", tenantId),
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

    const sumTxns = (rows: { amount_kes: number }[] | null) =>
      (rows ?? []).reduce((acc, r) => acc + (r.amount_kes ?? 0), 0);

    const onlineCount = routers?.reduce((acc, r) => acc + (r.active_pppoe_users ?? 0), 0) ?? 0;

    return {
      total: total ?? 0,
      active: active ?? 0,
      expired: expired ?? 0,
      suspended: suspended ?? 0,
      online: onlineCount,
      incomeToday: sumTxns(todayTxns),
      incomeMonth: sumTxns(monthTxns),
      routers: routers ?? [],
    };
  });

export const getPPPoECustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, tenantId } = context;
    const { data } = await supabase
      .from("customers")
      .select(
        `
        *,
        packages(name, price_kes, duration_hours),
        routers(name)
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
    const { supabase, tenantId } = context;
    const isNew = !data.id;

    const payload = {
      tenant_id: tenantId,
      full_name: data.full_name,
      phone: data.phone,
      kind: "pppoe",
      username: data.username,
      password: data.password,
      package_id: data.package_id,
      router_id: data.router_id,
      status: data.status || "active",
      expires_at: data.expires_at,
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
      const { data: pkg } = await supabase
        .from("packages")
        .select("name")
        .eq("id", data.package_id)
        .single();

      await enqueueRouterCommands([
        {
          tenantId,
          routerId: data.router_id,
          action: "pppoe.create_user",
          payload: {
            username: data.username,
            password: data.password,
            profile: pkg?.name || "default",
            comment: `Tenant Cust: ${customerId}`,
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
    const { supabase, tenantId } = context;
    const { data: customer } = await supabase
      .from("customers")
      .select("*")
      .eq("id", data.id)
      .single();

    if (!customer) throw new Error("Customer not found");

    await supabase.from("customers").update({ status: data.status }).eq("id", data.id);

    if (customer.router_id) {
      // On MikroTik, we either disable the user or change profile to 'expired'
      await enqueueRouterCommands([
        {
          tenantId,
          routerId: customer.router_id,
          action: "pppoe.update_user",
          payload: {
            username: customer.username,
            disabled: data.status !== "active",
            profile: data.status === "active" ? undefined : "expired-limited",
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
    const { supabase, tenantId } = context;
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
    const { supabase, tenantId } = context;
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
    const { supabase, tenantId } = context;

    // In a real ISP app, the agent heartbeats these sessions into router_active_sessions
    // For this build, we'll try to find users marked as active in our DB
    // and match them with any sessions reported by routers.
    const { data: sessions } = await supabase
      .from("router_active_sessions")
      .select(
        `
        *,
        customers(full_name, phone, packages(name))
      `,
      )
      .eq("tenant_id", tenantId)
      .eq("kind", "pppoe")
      .order("connected_at", { ascending: false });

    return sessions ?? [];
  });
