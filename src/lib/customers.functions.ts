import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateVoucherCode, normalizeKePhone } from "@/lib/billing-helpers";

async function tenantOf(supabase: Record<string, unknown>, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.tenant_id as string | undefined) ?? null;
}

async function requireTenant(supabase: Record<string, unknown>, userId: string): Promise<string> {
  const id = await tenantOf(supabase, userId);
  if (!id) throw new Error("No business found for this account");
  return id;
}

function formatRemainingTime(expiresAt: string | null): {
  formatted: string;
  seconds: number | null;
  isOnline: boolean;
  isExpiringSoon: boolean;
} {
  if (!expiresAt) {
    return { formatted: "Never expires", seconds: null, isOnline: true, isExpiringSoon: false };
  }
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) {
    const agoSec = Math.floor(Math.abs(diffMs) / 1000);
    let agoStr = "just now";
    if (agoSec >= 86400) agoStr = `${Math.floor(agoSec / 86400)}d ago`;
    else if (agoSec >= 3600) agoStr = `${Math.floor(agoSec / 3600)}h ago`;
    else if (agoSec >= 60) agoStr = `${Math.floor(agoSec / 60)}m ago`;
    return { formatted: `Expired (${agoStr})`, seconds: 0, isOnline: false, isExpiringSoon: false };
  }

  const diffSec = Math.floor(diffMs / 1000);
  const days = Math.floor(diffSec / 86400);
  const hours = Math.floor((diffSec % 86400) / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);

  let formatted = "";
  if (days > 0) {
    formatted = `${days}d ${hours}h left`;
  } else if (hours > 0) {
    formatted = `${hours}h ${minutes}m left`;
  } else {
    formatted = `${minutes}m left`;
  }

  return {
    formatted,
    seconds: diffSec,
    isOnline: true,
    isExpiringSoon: diffSec < 3600, // less than 1 hour left
  };
}

export const listCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const tenantId = await tenantOf(supabase, userId);
    if (!tenantId) {
      return {
        tenantId: null,
        customers: [],
        packages: [],
        routers: [],
        onlineVouchers: [],
        stats: {
          totalCustomers: 0,
          onlineCustomersCount: 0,
          onlineVouchersCount: 0,
          totalOnlineNow: 0,
          activePlansCount: 0,
          expiredCount: 0,
          disabledCount: 0,
          expiringSoonCount: 0,
        },
      };
    }

    const [
      { data: rawCustomers },
      { data: packages },
      { data: routers },
      { data: rawVouchers },
      { data: heartbeats },
    ] = await Promise.all([
      supabase
        .from("customers")
        .select(
          "id, full_name, phone, kind, status, username, mac_address, expires_at, package_id, router_id, created_at, updated_at, packages(id, name, kind, price_kes, duration_hours), routers(id, name, status, location)",
        )
        .eq("tenant_id", tenantId)
        .eq("kind", "hotspot")
        .order("created_at", { ascending: false }),
      supabase
        .from("packages")
        .select("id, name, kind, price_kes, duration_hours, is_active")
        .eq("tenant_id", tenantId)
        .eq("kind", "hotspot")
        .order("price_kes", { ascending: true }),
      supabase
        .from("routers")
        .select("id, name, status, location, active_hotspot_users, active_pppoe_users, last_seen_at")
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true }),
      supabase
        .from("vouchers")
        .select(
          "id, code, status, phone, package_id, router_id, expires_at, activated_at, created_at, packages(id, name, price_kes, duration_hours), routers(id, name, status, location)",
        )
        .eq("tenant_id", tenantId)
        .in("status", ["active", "used"])
        .order("expires_at", { ascending: false })
        .limit(100),
      supabase
        .from("router_heartbeats")
        .select("id, router_id, raw, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const routerMap = new Map((routers ?? []).map((r) => [r.id, r]));

    // Extract live active hosts from recent router heartbeats
    const activeHostMap = new Map<
      string,
      {
        ip?: string;
        mac?: string;
        uptime?: string;
        bytes_in?: number;
        bytes_out?: number;
        hostname?: string;
        last_seen?: string;
        router_name?: string;
      }
    >();

    for (const hb of heartbeats ?? []) {
      const raw = hb.raw as Record<string, unknown> | null;
      if (!raw) continue;
      const targetRouter = routerMap.get(hb.router_id);
      const rName = targetRouter?.name || "Router";

      const hostList: any[] = Array.isArray(raw.hosts)
        ? raw.hosts
        : Array.isArray((raw.body as Record<string, unknown>)?.hosts)
          ? ((raw.body as Record<string, unknown>).hosts as any[])
          : [];

      for (const h of hostList) {
        const rawMac = (h.mac || h.mac_address || h["mac-address"] || "")
          .toString()
          .trim()
          .toLowerCase();
        const rawIp = (h.ip || h.address || "").toString();
        const rawUser = (h.user || h.username || "").toString().trim();
        const telemetry = {
          ip: rawIp || undefined,
          mac: rawMac || undefined,
          uptime: h.uptime ? String(h.uptime) : undefined,
          bytes_in: Number(h.bytes_in || h["bytes-in"]) || undefined,
          bytes_out: Number(h.bytes_out || h["bytes-out"]) || undefined,
          hostname: h.hostname || h["host-name"] || undefined,
          last_seen: hb.created_at,
          router_name: rName,
        };

        if (rawMac) activeHostMap.set(`mac:${rawMac.replace(/[:-]/g, "")}`, telemetry);
        if (rawUser) activeHostMap.set(`user:${rawUser.toLowerCase()}`, telemetry);
        if (rawIp) activeHostMap.set(`ip:${rawIp}`, telemetry);
      }
    }

    let onlineCustomersCount = 0;
    let activePlansCount = 0;
    let expiredCount = 0;
    let disabledCount = 0;
    let expiringSoonCount = 0;

    const customers = (rawCustomers ?? []).map((c: any) => {
      const timeInfo = formatRemainingTime(c.expires_at);
      const isStatusActive = c.status === "active";
      const isOnline = isStatusActive && timeInfo.isOnline;

      if (isOnline) onlineCustomersCount++;
      if (isStatusActive) activePlansCount++;
      if (c.status === "expired" || (!timeInfo.isOnline && isStatusActive)) expiredCount++;
      if (c.status === "disabled") disabledCount++;
      if (isOnline && timeInfo.isExpiringSoon) expiringSoonCount++;

      // Try matching live telemetry
      const cleanMac = (c.mac_address || "").replace(/[:-]/g, "").toLowerCase();
      const cleanPhone = (c.phone || "").replace(/\D/g, "");
      const cleanUser = (c.username || "").toLowerCase();

      const live =
        (cleanMac ? activeHostMap.get(`mac:${cleanMac}`) : null) ||
        (cleanUser ? activeHostMap.get(`user:${cleanUser}`) : null) ||
        (cleanPhone ? activeHostMap.get(`user:${cleanPhone}`) : null) ||
        null;

      return {
        ...c,
        is_online: isOnline,
        time_left_seconds: timeInfo.seconds,
        time_left_formatted: timeInfo.formatted,
        is_expiring_soon: timeInfo.isExpiringSoon,
        live_telemetry: live,
      };
    });

    // Process online voucher sessions
    const now = Date.now();
    const onlineVouchers = (rawVouchers ?? [])
      .filter((v: any) => {
        if (!v.expires_at) return v.status === "active";
        return new Date(v.expires_at).getTime() > now;
      })
      .map((v: any) => {
        const timeInfo = formatRemainingTime(v.expires_at);
        const cleanPhone = (v.phone || "").replace(/\D/g, "");
        const cleanCode = (v.code || "").toLowerCase();

        const live =
          (cleanCode ? activeHostMap.get(`user:${cleanCode}`) : null) ||
          (cleanPhone ? activeHostMap.get(`user:${cleanPhone}`) : null) ||
          null;

        return {
          ...v,
          is_online: true,
          time_left_seconds: timeInfo.seconds,
          time_left_formatted: timeInfo.formatted,
          is_expiring_soon: timeInfo.isExpiringSoon,
          live_telemetry: live,
        };
      });

    const onlineVouchersCount = onlineVouchers.length;
    const totalOnlineNow = onlineCustomersCount + onlineVouchersCount;

    return {
      tenantId,
      customers,
      packages: packages ?? [],
      routers: routers ?? [],
      onlineVouchers,
      stats: {
        totalCustomers: customers.length,
        onlineCustomersCount,
        onlineVouchersCount,
        totalOnlineNow,
        activePlansCount,
        expiredCount,
        disabledCount,
        expiringSoonCount,
      },
    };
  });

const customerSchema = z.object({
  fullName: z.string().min(2).max(80),
  phone: z.string().min(9).max(20),
  kind: z.enum(["hotspot", "pppoe"]),
  packageId: z.string().uuid().nullable().optional(),
  routerId: z.string().uuid().nullable().optional(),
  username: z.string().max(40).optional(),
});

export const createCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => customerSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);

    let expiresAt: string | null = null;
    if (data.packageId) {
      const { data: pkg } = await supabase
        .from("packages")
        .select("duration_hours")
        .eq("id", data.packageId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (pkg?.duration_hours) {
        expiresAt = new Date(Date.now() + pkg.duration_hours * 3_600_000).toISOString();
      }
    }

    const { data: row, error } = await supabase
      .from("customers")
      .insert({
        tenant_id: tenantId,
        full_name: data.fullName,
        phone: normalizeKePhone(data.phone),
        kind: data.kind,
        package_id: data.packageId ?? null,
        router_id: data.routerId ?? null,
        username: data.username || null,
        expires_at: expiresAt,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    if (data.routerId && row?.username) {
      const { enqueueRouterCommands } = await import("@/lib/agent-commands.server");
      await enqueueRouterCommands([
        {
          tenantId,
          routerId: data.routerId,
          action: data.kind === "pppoe" ? "pppoe.create_user" : "hotspot.create_user",
          payload: {
            username: row.username,
            password: row.phone,
            comment: `emmatech:${row.id}`,
          },
        },
      ]);
    }
    return row;
  });

export const setCustomerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ id: z.string().uuid(), status: z.enum(["active", "expired", "disabled"]) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("customers")
      .update({ status: data.status })
      .eq("id", data.id)
      .select("id, tenant_id, router_id, username, kind")
      .maybeSingle();
    if (error) throw new Error(error.message);

    if (row?.router_id && row.username) {
      const { enqueueRouterCommands } = await import("@/lib/agent-commands.server");
      const enabled = data.status === "active";
      await enqueueRouterCommands([
        row.kind === "pppoe"
          ? {
              tenantId: row.tenant_id,
              routerId: row.router_id,
              action: "pppoe.set_enabled",
              payload: { username: row.username, enabled },
            }
          : {
              tenantId: row.tenant_id,
              routerId: row.router_id,
              action: enabled ? "hotspot.create_user" : "hotspot.disconnect",
              payload: { username: row.username },
            },
      ]);
    }
    return { ok: true };
  });

export const renewCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        packageId: z.string().uuid().optional().nullable(),
        durationHours: z.number().positive().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);

    let hours = data.durationHours || 24;
    let pkgId = data.packageId;

    if (pkgId) {
      const { data: pkg } = await supabase
        .from("packages")
        .select("duration_hours")
        .eq("id", pkgId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (pkg?.duration_hours) {
        hours = pkg.duration_hours;
      }
    }

    const newExpiresAt = new Date(Date.now() + hours * 3_600_000).toISOString();

    const { data: updated, error } = await supabase
      .from("customers")
      .update({
        status: "active",
        expires_at: newExpiresAt,
        package_id: pkgId ?? undefined,
      })
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .select("id, tenant_id, router_id, username, phone, kind")
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (updated?.router_id && (updated.username || updated.phone)) {
      const { enqueueRouterCommands } = await import("@/lib/agent-commands.server");
      const userIdentifier = updated.username || updated.phone;
      await enqueueRouterCommands([
        {
          tenantId,
          routerId: updated.router_id,
          action: updated.kind === "pppoe" ? "pppoe.create_user" : "hotspot.create_user",
          payload: {
            username: userIdentifier,
            password: updated.phone,
            comment: `emmatech:${updated.id}`,
          },
        },
      ]);
    }

    return { ok: true, expiresAt: newExpiresAt };
  });

export const disconnectCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), markExpired: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);

    const { data: customer, error } = await supabase
      .from("customers")
      .select("id, tenant_id, router_id, username, phone, mac_address, kind")
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error || !customer) throw new Error(error?.message || "Customer not found");

    if (data.markExpired) {
      await supabase
        .from("customers")
        .update({ status: "expired" })
        .eq("id", data.id)
        .eq("tenant_id", tenantId);
    }

    if (customer.router_id) {
      const { enqueueRouterCommands } = await import("@/lib/agent-commands.server");
      await enqueueRouterCommands([
        {
          tenantId,
          routerId: customer.router_id,
          action: "hotspot.disconnect",
          payload: {
            username: customer.username || customer.phone,
            mac: customer.mac_address || undefined,
          },
        },
      ]);
    }

    return { ok: true };
  });

export const deleteCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenantId = await tenantOf(supabase, userId);

    // Unlink any transactions pointing to this customer before deletion
    if (tenantId) {
      await supabaseAdmin
        .from("transactions")
        .update({ customer_id: null })
        .eq("customer_id", data.id)
        .eq("tenant_id", tenantId);

      const { error } = await supabaseAdmin
        .from("customers")
        .delete()
        .eq("id", data.id)
        .eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("customers").delete().eq("id", data.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ ids: z.array(z.string().uuid()) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenantId = await tenantOf(supabase, userId);

    if (tenantId) {
      await supabaseAdmin
        .from("transactions")
        .update({ customer_id: null })
        .in("customer_id", data.ids)
        .eq("tenant_id", tenantId);

      const { error } = await supabaseAdmin
        .from("customers")
        .delete()
        .in("id", data.ids)
        .eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("customers").delete().in("id", data.ids);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const listVouchers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const tenantId = await tenantOf(supabase, userId);
    if (!tenantId) return { tenantId: null, vouchers: [], packages: [], routers: [] };
    const [{ data: vouchers }, { data: packages }, { data: routers }] = await Promise.all([
      supabase
        .from("vouchers")
        .select(
          "id, code, status, phone, package_id, router_id, expires_at, activated_at, created_at",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("packages")
        .select("id, name, price_kes, duration_hours")
        .eq("tenant_id", tenantId)
        .eq("kind", "hotspot"),
      supabase.from("routers").select("id, name").eq("tenant_id", tenantId),
    ]);
    return { tenantId, vouchers: vouchers ?? [], packages: packages ?? [], routers: routers ?? [] };
  });

export const generateVouchers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        packageId: z.string().uuid(),
        routerId: z.string().uuid().nullable().optional(),
        count: z.number().int().min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);

    const { data: pkg } = await supabase
      .from("packages")
      .select("id")
      .eq("id", data.packageId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!pkg) throw new Error("Package not found");

    const rows = Array.from({ length: data.count }, () => ({
      tenant_id: tenantId,
      package_id: data.packageId,
      router_id: data.routerId ?? null,
      code: generateVoucherCode(),
    }));

    const { data: inserted, error } = await supabase
      .from("vouchers")
      .insert(rows)
      .select("id, code");
    if (error) throw new Error(error.message);
    return { created: inserted?.length ?? 0 };
  });

export const deleteVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenantId = await tenantOf(supabase, userId);

    if (tenantId) {
      await supabaseAdmin
        .from("transactions")
        .update({ voucher_id: null })
        .eq("voucher_id", data.id)
        .eq("tenant_id", tenantId);

      const { error } = await supabaseAdmin
        .from("vouchers")
        .delete()
        .eq("id", data.id)
        .eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("vouchers").delete().eq("id", data.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const listTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const tenantId = await tenantOf(supabase, userId);
    if (!tenantId) return { tenantId: null, transactions: [], routers: [] };

    const [{ data: transactions }, { data: routers }] = await Promise.all([
      supabase
        .from("transactions")
        .select(
          `
          id,
          kind,
          status,
          phone,
          amount_kes,
          mpesa_receipt,
          failure_reason,
          created_at,
          package_id,
          voucher_id,
          customer_id,
          raw,
          packages (name, price_kes),
          vouchers (router_id, code, routers (id, name)),
          customers (router_id, full_name, phone, routers (id, name))
        `,
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(600),
      supabase
        .from("routers")
        .select("id, name, location, status")
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true }),
    ]);

    const routerMap = new Map((routers ?? []).map((r) => [r.id, r.name]));
    const singleRouterId = routers?.length === 1 ? routers[0].id : null;
    const singleRouterName = routers?.length === 1 ? routers[0].name : null;

    const mappedTransactions = (transactions ?? []).map((t) => {
      const raw = typeof t.raw === "object" && t.raw ? (t.raw as Record<string, unknown>) : {};
      const rawRouterId = (raw.router_id as string) || null;

      const vRouter = t.vouchers as unknown as {
        router_id?: string;
        routers?: { id?: string; name?: string } | null;
      } | null;
      const cRouter = t.customers as unknown as {
        router_id?: string;
        routers?: { id?: string; name?: string } | null;
      } | null;

      const resolvedRouterId =
        rawRouterId || vRouter?.router_id || cRouter?.router_id || singleRouterId || null;

      const resolvedRouterName =
        (resolvedRouterId ? routerMap.get(resolvedRouterId) : null) ||
        vRouter?.routers?.name ||
        cRouter?.routers?.name ||
        (singleRouterName && !resolvedRouterId ? singleRouterName : null) ||
        "All / Default";

      return {
        id: t.id,
        kind: t.kind,
        status: t.status,
        phone: t.phone,
        amount_kes: t.amount_kes,
        mpesa_receipt: t.mpesa_receipt,
        failure_reason: t.failure_reason,
        created_at: t.created_at,
        package_id: t.package_id,
        packages: t.packages,
        router_id: resolvedRouterId,
        router_name: resolvedRouterName,
        voucher_id: t.voucher_id,
        customer_id: t.customer_id,
      };
    });

    return {
      tenantId,
      transactions: mappedTransactions,
      routers: routers ?? [],
    };
  });
