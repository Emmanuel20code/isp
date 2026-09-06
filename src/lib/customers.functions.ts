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

export const listCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const tenantId = await tenantOf(supabase, userId);
    if (!tenantId) return { tenantId: null, customers: [], packages: [], routers: [] };
    const [{ data: customers }, { data: packages }, { data: routers }] = await Promise.all([
      supabase
        .from("customers")
        .select(
          "id, full_name, phone, kind, status, username, expires_at, package_id, router_id, created_at",
        )
        .eq("tenant_id", tenantId)
        .eq("kind", "hotspot")
        .order("created_at", { ascending: false }),
      supabase
        .from("packages")
        .select("id, name, kind, price_kes, duration_hours")
        .eq("tenant_id", tenantId)
        .eq("kind", "hotspot"),
      supabase.from("routers").select("id, name").eq("tenant_id", tenantId),
    ]);
    return {
      tenantId,
      customers: customers ?? [],
      packages: packages ?? [],
      routers: routers ?? [],
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
