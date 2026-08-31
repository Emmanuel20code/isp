import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import crypto from "crypto";
import { computeRouterStatus } from "@/lib/mikrotik";

async function currentTenantId(supabase: Record<string, unknown>, userId: string): Promise<string> {
  const { data } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.tenant_id) throw new Error("No business found for this account");
  return data.tenant_id as string;
}

export const listNetwork = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: member } = await supabase
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userId)
      .maybeSingle();
    const tenantId = member?.tenant_id as string | undefined;
    if (!tenantId) return { tenantId: null, routers: [], packages: [] };
    const [{ data: routers }, { data: packages }] = await Promise.all([
      supabase
        .from("routers")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false }),
      supabase
        .from("packages")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("price_kes", { ascending: true }),
    ]);

    const mappedRouters = (routers ?? []).map((r) => ({
      ...r,
      status: computeRouterStatus(r),
    }));

    return { tenantId, routers: mappedRouters, packages: packages ?? [] };
  });

const routerSchema = z.object({
  name: z.string().min(2).max(60),
  location: z.string().max(80).optional(),
});

function generateShortOnboardCode(): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // Avoiding ambiguous characters like 1, 0, I, O
  const bytes = crypto.randomBytes(9);
  const part1 = Array.from({ length: 3 }, (_, idx) => chars[bytes[idx] % chars.length]).join("");
  const part2 = Array.from({ length: 6 }, (_, idx) => chars[bytes[idx + 3] % chars.length]).join(
    "",
  );
  return `${part1}-${part2}`;
}

export const createRouter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => routerSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await currentTenantId(supabase, userId);

    // Generate unique, collision-free, cryptographically secure keys and tokens
    const agentKey = crypto.randomBytes(24).toString("hex");
    const onboardToken = generateShortOnboardCode();
    const onboardExpiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(); // 1-hour expiration

    const { data: row, error } = await supabase
      .from("routers")
      .insert({
        tenant_id: tenantId,
        name: data.name,
        location: data.location ?? null,
        agent_key: agentKey,
        onboard_token: onboardToken,
        onboard_token_expires_at: onboardExpiresAt,
        status: "pending",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const regenerateRouterToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await currentTenantId(supabase, userId);

    const newToken = generateShortOnboardCode();
    const newExpiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(); // 1-hour expiration

    const { data: updated, error } = await supabase
      .from("routers")
      .update({
        onboard_token: newToken,
        onboard_token_expires_at: newExpiresAt,
      })
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return updated;
  });

export const deleteRouter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Check if user is super admin or regular tenant member
    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isSuperAdmin = (userRoles ?? []).some((r) => r.role === "super_admin");

    let tenantId: string | null = null;
    if (!isSuperAdmin) {
      tenantId = await currentTenantId(supabase, userId);
    }

    // Verify router exists and belongs to current tenant
    let query = supabaseAdmin.from("routers").select("id, name, tenant_id").eq("id", data.id);
    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }
    const { data: router, error: findError } = await query.maybeSingle();

    if (findError) {
      console.error("[deleteRouter] Error finding router:", findError);
      throw new Error(`Failed to locate router: ${findError.message}`);
    }
    if (!router) {
      throw new Error("Router not found or you do not have permission to delete it.");
    }

    // 1. Delete associated router commands first to prevent foreign key constraint violations
    const { error: cmdErr } = await supabaseAdmin
      .from("router_commands")
      .delete()
      .eq("router_id", data.id);
    if (cmdErr) {
      console.warn("[deleteRouter] Warning deleting router_commands:", cmdErr);
    }

    // 2. Unlink any customers referencing this router
    const { error: custErr } = await supabaseAdmin
      .from("customers")
      .update({ router_id: null })
      .eq("router_id", data.id);
    if (custErr) {
      console.warn("[deleteRouter] Warning unlinking customers:", custErr);
    }

    // 3. Unlink any vouchers referencing this router
    const { error: voucherErr } = await supabaseAdmin
      .from("vouchers")
      .update({ router_id: null })
      .eq("router_id", data.id);
    if (voucherErr) {
      console.warn("[deleteRouter] Warning unlinking vouchers:", voucherErr);
    }

    // 4. Delete the router record via service role admin client
    const { error: deleteError } = await supabaseAdmin.from("routers").delete().eq("id", data.id);

    if (deleteError) {
      console.error("[deleteRouter] Failed to delete router:", deleteError);
      throw new Error(`Failed to delete router: ${deleteError.message}`);
    }

    return { ok: true, id: data.id };
  });

export const deletePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenantId = await currentTenantId(supabase, userId);

    // Unlink customers, vouchers, and transactions referencing package
    await supabaseAdmin
      .from("customers")
      .update({ package_id: null })
      .eq("package_id", data.id)
      .eq("tenant_id", tenantId);

    await supabaseAdmin
      .from("transactions")
      .update({ package_id: null })
      .eq("package_id", data.id)
      .eq("tenant_id", tenantId);

    await supabaseAdmin
      .from("vouchers")
      .delete()
      .eq("package_id", data.id)
      .eq("tenant_id", tenantId);

    const { error } = await supabaseAdmin
      .from("packages")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", tenantId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

const packageSchema = z.object({
  name: z.string().min(2).max(60),
  kind: z.enum(["hotspot", "pppoe"]),
  priceKes: z.number().int().min(0).max(1_000_000),
  durationHours: z.number().positive().max(87600),
  speedDownMbps: z.number().int().min(1).max(1000),
  speedUpMbps: z.number().int().min(1).max(1000),
  deviceLimit: z.number().int().min(1).max(50),
});

export const createPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => packageSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await currentTenantId(supabase, userId);
    const { data: row, error } = await supabase
      .from("packages")
      .insert({
        tenant_id: tenantId,
        name: data.name,
        kind: data.kind,
        price_kes: data.priceKes,
        duration_hours: data.durationHours,
        speed_down_mbps: data.speedDownMbps,
        speed_up_mbps: data.speedUpMbps,
        device_limit: data.deviceLimit,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const setPackageActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), isActive: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("packages")
      .update({ is_active: data.isActive })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateRouter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(2).max(60),
        location: z.string().max(80).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await currentTenantId(supabase, userId);

    const { data: updated, error } = await supabase
      .from("routers")
      .update({
        name: data.name,
        location: data.location ?? null,
      })
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return updated;
  });

export const updatePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(2).max(60),
        kind: z.enum(["hotspot", "pppoe"]),
        priceKes: z.number().int().min(0).max(1_000_000),
        durationHours: z.number().positive().max(87600),
        speedDownMbps: z.number().int().min(1).max(1000),
        speedUpMbps: z.number().int().min(1).max(1000),
        deviceLimit: z.number().int().min(1).max(50),
        isActive: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await currentTenantId(supabase, userId);

    const updatePayload: Record<string, unknown> = {
      name: data.name,
      kind: data.kind,
      price_kes: data.priceKes,
      duration_hours: data.durationHours,
      speed_down_mbps: data.speedDownMbps,
      speed_up_mbps: data.speedUpMbps,
      device_limit: data.deviceLimit,
    };
    if (data.isActive !== undefined) {
      updatePayload.is_active = data.isActive;
    }

    const { data: updated, error } = await supabase
      .from("packages")
      .update(updatePayload)
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return updated;
  });

export const updateTenantMpesaConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        shortcode: z.string().max(12).nullable().optional(),
        shortcodeKind: z.enum(["till", "paybill"]).nullable().optional(),
        accountRef: z.string().max(30).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await currentTenantId(supabase, userId);

    const { error } = await supabase
      .from("tenants")
      .update({
        mpesa_shortcode: data.shortcode ? data.shortcode.trim() : null,
        mpesa_shortcode_kind: data.shortcodeKind ?? null,
        mpesa_account_ref: data.accountRef ? data.accountRef.trim() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getPackages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const tenantId = await currentTenantId(supabase, userId);
    const { data } = await supabase
      .from("packages")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("price_kes", { ascending: true });
    return data ?? [];
  });
