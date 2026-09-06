import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enqueueRouterCommands } from "@/lib/agent-commands.server";
import { startOfMonthUtc, startOfTodayUtc, normalizeKePhone } from "@/lib/billing-helpers";
import { computeRouterStatus } from "@/lib/mikrotik";
import { getTenantRoutersForDropdown } from "@/lib/network.functions";

export { getTenantRoutersForDropdown };

async function resolveTenantId(supabase: any, userId: string): Promise<string> {
  const { data: member } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (member?.tenant_id) return member.tenant_id as string;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (!tenant?.id) {
    throw new Error("No business tenant found for your account.");
  }

  return tenant.id as string;
}

export const getPPPoEStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const tenantId = await resolveTenantId(supabase, userId).catch(() => null);
    if (!tenantId) {
      return { total: 0, active: 0, expired: 0, suspended: 0, online: 0, incomeToday: 0, incomeMonth: 0, routers: [] };
    }

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
        .eq("status", "disabled"),
      supabase
        .from("routers")
        .select("id, name, status, last_seen_at, active_pppoe_users, public_ip, ros_version, onboarded_at, is_disabled, model")
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
    const tenantId = await resolveTenantId(supabase, userId).catch(() => null);
    if (!tenantId) return [];

    const { data: routers } = await supabase
      .from("routers")
      .select("id, name, status, last_seen_at, active_pppoe_users, public_ip, ros_version, onboarded_at, is_disabled, model")
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
    const tenantId = await resolveTenantId(supabase, userId).catch(() => null);
    if (!tenantId) return [];

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
  router_id: string; // Strictly required
  status?: string | null;
  expires_at?: string | null;
};

export const savePPPoECustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: any) => {
    const d = input?.data !== undefined ? input.data : input;
    return (d || {}) as PPPoECustomerInput;
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const tenantId = await resolveTenantId(supabase, userId);
    const inputData = data || ({} as PPPoECustomerInput);
    const isNew = !inputData.id;

    const cleanPackageId =
      inputData.package_id && inputData.package_id !== "none" && String(inputData.package_id).trim() !== ""
        ? String(inputData.package_id)
        : null;

    const cleanRouterId =
      inputData.router_id && inputData.router_id !== "none" && String(inputData.router_id).trim() !== ""
        ? String(inputData.router_id)
        : null;

    if (!cleanRouterId) {
      throw new Error("A target MikroTik router must be selected to manage this PPPoE customer.");
    }

    let calculatedExpiry = inputData.expires_at;
    let pkg: { name: string; duration_hours: number; speed_up_mbps: number; speed_down_mbps: number } | null = null;

    if (cleanPackageId) {
      const { data: pkgData, error: pkgErr } = await supabase
        .from("packages")
        .select("name, duration_hours, speed_up_mbps, speed_down_mbps")
        .eq("id", cleanPackageId)
        .maybeSingle();

      if (pkgErr) {
        console.warn("Failed to fetch package details:", pkgErr.message);
      } else {
        pkg = pkgData;
      }

      if (!calculatedExpiry && pkg?.duration_hours) {
        calculatedExpiry = new Date(Date.now() + pkg.duration_hours * 3600 * 1000).toISOString();
      }
    }

    const payload = {
      tenant_id: tenantId,
      full_name: inputData.full_name || "",
      phone: inputData.phone ? normalizeKePhone(inputData.phone) : "",
      kind: "pppoe",
      username: inputData.username || "",
      password: inputData.password || inputData.username || "",
      package_id: cleanPackageId,
      router_id: cleanRouterId,
      status: inputData.status || "active",
      expires_at: calculatedExpiry || null,
    };

    let customerId = inputData.id;

    if (isNew) {
      const { data: newCust, error } = await supabase
        .from("customers")
        .insert(payload)
        .select("id")
        .maybeSingle();

      if (error) {
        throw new Error(error.message || "Failed to create customer in database.");
      }
      if (!newCust || !newCust.id) {
        throw new Error("Customer creation returned no record from database.");
      }
      customerId = newCust.id;
    } else {
      const { error } = await supabase
        .from("customers")
        .update(payload)
        .eq("id", inputData.id);

      if (error) {
        throw new Error(error.message || "Failed to update customer in database.");
      }
    }

    // Sync with router
    if (cleanRouterId) {
      await enqueueRouterCommands([
        {
          tenantId,
          routerId: cleanRouterId,
          action: "pppoe.create_user",
          payload: {
            username: inputData.username,
            password: inputData.password || inputData.username,
            profile: pkg?.name || "default",
            rate_limit: pkg ? `${pkg.speed_up_mbps || 10}M/${pkg.speed_down_mbps || 10}M` : undefined,
            disabled: (inputData.status || "active") !== "active",
            comment: `PPPoE: ${inputData.full_name} (${inputData.phone})`,
          },
        },
      ]);
    }

    return { success: true, id: customerId };
  });

export const suspendPPPoECustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: any) => {
    const d = input?.data !== undefined ? input.data : input;
    return (d || {}) as { id: string; status: string };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const tenantId = await resolveTenantId(supabase, userId);
    if (!data?.id) throw new Error("Customer ID is required");

    const { data: customer } = await supabase
      .from("customers")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();

    if (!customer) throw new Error("Customer not found");

    await supabase.from("customers").update({ status: data.status }).eq("id", data.id);

    if (customer.router_id) {
      const { RouterManagementService } = await import("@/lib/router-management.server");
      const service = new RouterManagementService(supabase);

      // Resolve package profile and rate limits for proper sync
      let profileName = "default";
      let rateLimit: string | undefined = undefined;

      if (customer.package_id) {
        const { data: pkg } = await supabase
          .from("packages")
          .select("name, speed_up_mbps, speed_down_mbps")
          .eq("id", customer.package_id)
          .maybeSingle();
        if (pkg) {
          profileName = pkg.name;
          rateLimit = `${pkg.speed_up_mbps || 10}M/${pkg.speed_down_mbps || 10}M`;
        }
      }

      await service.togglePPPoEUserState({
        tenantId,
        routerId: customer.router_id,
        username: customer.username,
        enabled: data.status === "active",
        profileName,
        rateLimit,
      });
    }

    return { success: true };
  });

export const resetPPPoEPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: any) => {
    const d = input?.data !== undefined ? input.data : input;
    return (d || {}) as { id: string; password?: string };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const tenantId = await resolveTenantId(supabase, userId);
    if (!data?.id) throw new Error("Customer ID is required");
    const password = data.password || Math.random().toString(36).slice(-8);

    const { data: customer } = await supabase
      .from("customers")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
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
  .validator((input: any) => {
    const d = input?.data !== undefined ? input.data : input;
    return (d || {}) as { routerId: string };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const tenantId = await resolveTenantId(supabase, userId);
    if (!data?.routerId) throw new Error("Router ID is required");

    const { data: customers } = await supabase
      .from("customers")
      .select("*, packages(name)")
      .eq("tenant_id", tenantId)
      .eq("router_id", data.routerId)
      .eq("kind", "pppoe");

    if (!customers || customers.length === 0) return { success: true, synced: 0 };

    const commands = [
      {
        tenantId,
        routerId: data.routerId,
        action: "pppoe.setup_pool",
        payload: {
          activePool: "PPPOE ACTIVE POOL",
          activeRange: "10.0.0.2-10.9.255.255,10.11.0.1-10.255.255.254",
          capacity: "16M+",
          localAddress: "10.0.0.1",
        },
      },
      ...customers.map((c) => ({
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
      })),
    ];

    await enqueueRouterCommands(commands);

    return { success: true, synced: commands.length };
  });

export const deployMillionPPPoEPool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: any) => {
    const d = input?.data !== undefined ? input.data : input;
    return (d || {}) as { routerId: string };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const tenantId = await resolveTenantId(supabase, userId);
    if (!data?.routerId) throw new Error("Router ID is required");

    const { RouterManagementService } = await import("@/lib/router-management.server");
    const service = new RouterManagementService(supabase);
    await service.setupHighCapacityPPPoEPool(tenantId, data.routerId);

    return {
      success: true,
      message: "High-capacity PPPoE IP pool (16,711,676 active + 1,048,574 expired IPs) deployed to router.",
    };
  });

export const getPPPoEActiveSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const tenantId = await resolveTenantId(supabase, userId).catch(() => null);
    if (!tenantId) return [];

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
