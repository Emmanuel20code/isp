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
      await enqueueRouterCommands([
        {
          tenantId,
          routerId: data.router_id,
          action: "pppoe.create_user",
          payload: {
            username: data.username,
            password: data.password || data.username,
            profile: pkg?.name || "default",
            rate_limit: pkg
              ? `${pkg.speed_up_mbps || 10}M/${pkg.speed_down_mbps || 10}M`
              : undefined,
            disabled: (data.status || "active") !== "active",
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

    // Try reading active sessions from radacct table
    const { data: radSessions } = await (supabase as any)
      .from("radacct")
      .select("*")
      .eq("tenant_id", tenantId)
      .is("acctstoptime", null)
      .order("acctstarttime", { ascending: false });

    if (radSessions && radSessions.length > 0) {
      // Get associated customer metadata
      const usernames = radSessions.map((s: any) => s.username);
      const { data: custList } = await supabase
        .from("customers")
        .select("username, full_name, phone, packages(name)")
        .eq("tenant_id", tenantId)
        .in("username", usernames);

      const custMap = new Map((custList ?? []).map((c: any) => [c.username, c]));

      return radSessions.map((s: any) => {
        const cust = custMap.get(s.username);
        const inBytes = Number(s.acctinputoctets || 0);
        const outBytes = Number(s.acctoutputoctets || 0);
        const sessionSec = Number(s.acctsessiontime || 0);

        const formatBytes = (bytes: number) => {
          if (!bytes || bytes <= 0) return "0 B";
          const units = ["B", "KB", "MB", "GB", "TB"];
          const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
          return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
        };

        const formatDuration = (sec: number) => {
          if (sec < 60) return `${sec}s`;
          const m = Math.floor(sec / 60);
          if (m < 60) return `${m}m ${sec % 60}s`;
          const h = Math.floor(m / 60);
          const d = Math.floor(h / 24);
          if (d > 0) return `${d}d ${h % 24}h`;
          return `${h}h ${m % 60}m`;
        };

        return {
          id: s.radacctid?.toString() || s.acctsessionid,
          username: s.username,
          ip_address: s.framedipaddress || "PPPoE Dynamic",
          mac_address: s.callingstationid || "",
          nas_ip: s.nasipaddress || "",
          connected_at: s.acctstarttime,
          uptime: sessionSec > 0 ? formatDuration(sessionSec) : "Active",
          bytes_in_formatted: formatBytes(inBytes),
          bytes_out_formatted: formatBytes(outBytes),
          customers: {
            full_name: cust?.full_name || s.username,
            phone: cust?.phone || "N/A",
            packages: cust?.packages || null,
          },
        };
      });
    }

    // Fallback: fetch customers marked as active with PPPoE
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
      mac_address: c.mac_address || "",
      nas_ip: "",
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

export const disconnectPPPoECustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { username: string; routerId?: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);

    // 1. Mark session as stopped in radacct
    await (supabase as any)
      .from("radacct")
      .update({
        acctstoptime: new Date().toISOString(),
        acctterminatecause: "Admin-Reset",
      })
      .eq("tenant_id", tenantId)
      .eq("username", data.username)
      .is("acctstoptime", null);

    // 2. Fetch customer to resolve router_id if not provided
    let targetRouterId = data.routerId;
    if (!targetRouterId) {
      const { data: cust } = await supabase
        .from("customers")
        .select("router_id")
        .eq("tenant_id", tenantId)
        .eq("username", data.username)
        .maybeSingle();
      targetRouterId = cust?.router_id ?? undefined;
    }

    // 3. Enqueue router disconnect command
    if (targetRouterId) {
      await enqueueRouterCommands([
        {
          tenantId,
          routerId: targetRouterId,
          action: "pppoe.disconnect_user",
          payload: {
            username: data.username,
          },
        },
      ]);
    }

    return { success: true };
  });

export const renewPPPoECustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: { customerId: string; packageId?: string; additionalDays?: number }) => data,
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);

    const { data: customer } = await supabase
      .from("customers")
      .select("*, packages(id, name, duration_hours)")
      .eq("tenant_id", tenantId)
      .eq("id", data.customerId)
      .single();

    if (!customer) throw new Error("Subscriber not found");

    let hours = 24 * 30; // default 30 days
    let pkgId = data.packageId || customer.package_id;

    if (data.additionalDays) {
      hours = data.additionalDays * 24;
    } else if (pkgId) {
      const { data: pkg } = await supabase
        .from("packages")
        .select("duration_hours")
        .eq("id", pkgId)
        .single();
      if (pkg?.duration_hours) hours = pkg.duration_hours;
    }

    const now = Date.now();
    const currentExpiry = customer.expires_at ? new Date(customer.expires_at).getTime() : 0;
    const baseTime = currentExpiry > now ? currentExpiry : now;
    const newExpiresAt = new Date(baseTime + hours * 3600 * 1000).toISOString();

    const { error } = await supabase
      .from("customers")
      .update({
        package_id: pkgId,
        expires_at: newExpiresAt,
        status: "active",
      })
      .eq("id", data.customerId);

    if (error) throw error;

    // Enqueue command on router to ensure credentials and limits are live
    if (customer.router_id) {
      await enqueueRouterCommands([
        {
          tenantId,
          routerId: customer.router_id,
          action: "pppoe.update_user",
          payload: {
            username: customer.username,
            disabled: false,
            profile: customer.packages?.name || "default",
          },
        },
      ]);
    }

    return { success: true, newExpiresAt };
  });

export const getRadiusConfigAndLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);

    // 1. Fetch recent RADIUS auth logs from radpostauth
    const { data: logs } = await (supabase as any)
      .from("radpostauth")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("authdate", { ascending: false })
      .limit(30);

    // 2. Fetch routers with their radius secrets and NAS IP
    const { data: routers } = await supabase
      .from("routers")
      .select("id, name, public_ip, agent_key, is_disabled")
      .eq("tenant_id", tenantId);

    // 3. Compute server host & ports
    const radiusHost = process.env.RADIUS_SERVER_HOST || process.env.RAILWAY_PUBLIC_DOMAIN || "radius.emmatech.io";
    const authPort = Number(process.env.RADIUS_AUTH_PORT || 1812);
    const acctPort = Number(process.env.RADIUS_ACCT_PORT || 1813);
    const defaultSecret = process.env.RADIUS_SECRET || "emmatech_radius_secret_2026";

    // 4. Generate RouterOS setup script
    const mikrotikCliScript = [
      `# ==========================================`,
      `# EMMATECH FreeRADIUS RouterOS Configuration`,
      `# ==========================================`,
      `/radius add service=ppp address=${radiusHost} auth-port=${authPort} acct-port=${acctPort} secret="${defaultSecret}" authentication-port=${authPort} accounting-port=${acctPort} timeout=3000ms comment="EMMATECH FreeRADIUS"`,
      `/ppp aaa set use-radius=yes accounting=yes interim-update=5m`,
      `/radius incoming set accept=yes port=3799`,
      `/ip dns set allow-remote-requests=yes servers=8.8.8.8,1.1.1.1`,
    ].join("\n");

    return {
      radiusHost,
      authPort,
      acctPort,
      defaultSecret,
      mikrotikCliScript,
      logs: logs ?? [],
      routers: routers ?? [],
    };
  });

export const testRadiusLiveAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { username: string; password?: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);

    // Use internal radius-server test client
    try {
      const { testRadiusAuth, isRadiusServerRunning, startRadiusServer } = await import(
        "@/lib/radius-server.server"
      );
      if (!isRadiusServerRunning()) {
        await startRadiusServer();
      }

      const res = await testRadiusAuth({
        host: "127.0.0.1",
        username: data.username,
        password: data.password || "test",
        secret: "testing123",
      });

      return {
        success: res.success,
        code: res.code,
        attributes: res.attributes || {},
        latencyMs: res.latencyMs,
        error: res.error,
      };
    } catch (err: any) {
      return {
        success: false,
        code: "ServerUnreachable",
        latencyMs: 0,
        error: err.message || "Could not reach RADIUS daemon",
      };
    }
  });

