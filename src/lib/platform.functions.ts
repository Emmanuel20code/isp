import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SUPERADMIN_EMAILS = ["emmanueloyaro123@gmail.com", "emmanueloyaro3@gmail.com"];

async function assertSuperAdmin(
  supabase: Record<string, unknown>,
  userId: string,
  claims?: Record<string, unknown>,
) {
  if (claims?.email && SUPERADMIN_EMAILS.includes(String(claims.email).toLowerCase())) {
    return;
  }

  try {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();

    if (data) return;
  } catch (err) {
    console.warn("[assertSuperAdmin] user_roles table check warning:", err);
  }

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.email && SUPERADMIN_EMAILS.includes(profile.email.toLowerCase())) {
      return;
    }
  } catch (err) {
    console.warn("[assertSuperAdmin] profiles table check warning:", err);
  }

  throw new Error("Forbidden");
}

function mask(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length <= 4 ? "••••" : `${"•".repeat(6)}${value.slice(-4)}`;
}

export const getPlatformMpesaConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin;

    let data: Record<string, unknown> | null = null;
    try {
      const res = await db
        .from("platform_mpesa_config")
        .select(
          "environment, consumer_key, consumer_secret, passkey, shortcode, shortcode_kind, callback_base_url, updated_at",
        )
        .maybeSingle();
      data = res.data;
    } catch (err) {
      console.warn("[getPlatformMpesaConfig] platform_mpesa_config query warning:", err);
    }

    let platform: Record<string, unknown> | null = null;
    try {
      const res = await db
        .from("platform_settings")
        .select(
          "subscription_price_kes, subscription_days, trial_days, warning_days, saas_till_number, support_phone",
        )
        .maybeSingle();
      platform = res.data;
    } catch (err) {
      console.warn("[getPlatformMpesaConfig] platform_settings query warning:", err);
    }

    const { resolveCallbackUrl } = await import("@/lib/mpesa.server");
    const autoCallbackUrl = await resolveCallbackUrl().catch(() => "");

    return {
      environment: (data?.environment === "sandbox" ? "sandbox" : "production") as
        "sandbox" | "production",
      shortcode: data?.shortcode ?? "",
      transactionType: "CustomerBuyGoodsOnline" as const,
      callbackBaseUrl:
        (data as { callback_base_url?: string | null } | null)?.callback_base_url ?? "",
      autoCallbackUrl,
      consumerKeyMasked: mask(data?.consumer_key),
      consumerSecretMasked: mask(data?.consumer_secret),
      passkeyMasked: mask(data?.passkey),
      updatedAt: data?.updated_at ?? null,
      platform: platform ?? null,
    };
  });

const saveSchema = z.object({
  environment: z.enum(["production", "sandbox"]),
  shortcode: z.string().min(4).max(12),
  transactionType: z.literal("CustomerBuyGoodsOnline"),
  callbackBaseUrl: z.string().max(300).optional(),
  consumerKey: z.string().max(200).optional(),
  consumerSecret: z.string().max(200).optional(),
  passkey: z.string().max(200).optional(),
});

function isTableMissingError(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const msg = (err.message || "").toLowerCase();
  return (
    msg.includes("could not find the table") ||
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    err.code === "PGRST204" ||
    err.code === "42P01"
  );
}

export const savePlatformMpesaConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin;

    const patch: Record<string, unknown> = {
      environment: data.environment,
      shortcode: data.shortcode.trim(),
      shortcode_kind: data.transactionType === "CustomerBuyGoodsOnline" ? "till" : "paybill",
      callback_base_url: data.callbackBaseUrl?.trim()
        ? data.callbackBaseUrl.trim().replace(/\/+$/, "")
        : null,
    };

    // Secret fields
    if (data.consumerKey?.trim()) patch["consumer_key"] = data.consumerKey.trim();
    if (data.consumerSecret?.trim()) patch["consumer_secret"] = data.consumerSecret.trim();
    if (data.passkey?.trim()) patch["passkey"] = data.passkey.trim();

    const { error: updateError, count } = await db
      .from("platform_mpesa_config")
      .update(patch as never, { count: "exact" })
      .eq("id", true);

    if (updateError) {
      console.error("[savePlatformMpesaConfig] Update error:", updateError.message || updateError);
      if (isTableMissingError(updateError)) {
        throw new Error(
          "Table 'platform_mpesa_config' does not exist in your Supabase project. Please run the SQL script in 'supabase/full_schema.sql' inside your Supabase SQL Editor.",
        );
      }
      throw new Error(updateError.message);
    }

    if (count === 0) {
      const insertPayload = {
        id: true,
        ...patch,
        consumer_key: data.consumerKey?.trim() || null,
        consumer_secret: data.consumerSecret?.trim() || null,
        passkey: data.passkey?.trim() || null,
      };
      const { error: insertError } = await db
        .from("platform_mpesa_config")
        .insert(insertPayload as never);
      if (insertError) {
        console.error(
          "[savePlatformMpesaConfig] Insert error:",
          insertError.message || insertError,
        );
        if (isTableMissingError(insertError)) {
          throw new Error(
            "Table 'platform_mpesa_config' does not exist in your Supabase project. Please run the SQL script in 'supabase/full_schema.sql' inside your Supabase SQL Editor.",
          );
        }
        throw new Error(insertError.message);
      }
    }
    return { ok: true };
  });

export const testPlatformMpesaConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId, context.claims);
    const { verifyPlatformCredentials } = await import("@/lib/mpesa.server");
    return verifyPlatformCredentials(context.supabase);
  });

const platformSchema = z.object({
  subscriptionPriceKes: z.number().int().min(0).max(1_000_000),
  subscriptionDays: z.number().int().min(1).max(365),
  trialDays: z.number().int().min(0).max(90),
  warningDays: z.number().int().min(0).max(30),
  saasTillNumber: z.string().max(12).optional(),
  supportPhone: z.string().max(15).optional(),
});

export const savePlatformSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => platformSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin;

    const payload = {
      subscription_price_kes: data.subscriptionPriceKes,
      subscription_days: data.subscriptionDays,
      trial_days: data.trialDays,
      warning_days: data.warningDays,
      saas_till_number: data.saasTillNumber?.trim() ? data.saasTillNumber.trim() : null,
      support_phone: data.supportPhone?.trim() ? data.supportPhone.trim() : null,
    };

    const { error: updateError, count } = await db
      .from("platform_settings")
      .update(payload as never, { count: "exact" })
      .eq("id", true);

    if (updateError) {
      console.error("[savePlatformSettings] Update error:", updateError.message || updateError);
      if (isTableMissingError(updateError)) {
        throw new Error(
          "Table 'platform_settings' does not exist in your Supabase project. Please run the SQL script in 'supabase/full_schema.sql' inside your Supabase SQL Editor.",
        );
      }
      throw new Error(updateError.message);
    }

    if (count === 0) {
      const insertPayload = {
        id: true,
        ...payload,
      };
      const { error: insertError } = await db
        .from("platform_settings")
        .insert(insertPayload as never);
      if (insertError) {
        console.error("[savePlatformSettings] Insert error:", insertError.message || insertError);
        if (isTableMissingError(insertError)) {
          throw new Error(
            "Table 'platform_settings' does not exist in your Supabase project. Please run the SQL script in 'supabase/full_schema.sql' inside your Supabase SQL Editor.",
          );
        }
        throw new Error(insertError.message);
      }
    }
    return { ok: true };
  });

const testStkSchema = z.object({
  phone: z.string().min(9),
  amount: z.number().int().min(1).optional(),
});

export const sendTestStkPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => testStkSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId, context.claims);
    const { normalizeKePhone, isValidKePhone } = await import("@/lib/billing-helpers");
    const phone = normalizeKePhone(data.phone);
    if (!isValidKePhone(phone)) {
      throw new Error("Enter a valid Safaricom phone number (e.g. 0712345678 or 0113745960)");
    }

    const { getRequest } = await import("@tanstack/react-start/server");
    const origin = new URL(getRequest().url).origin;
    const { stkPush, resolveCallbackUrl } = await import("@/lib/mpesa.server");
    const callbackUrl = await resolveCallbackUrl(origin, context.supabase);

    const result = await stkPush(
      {
        phone,
        amount: data.amount ?? 1,
        accountReference: "ADMINTEST",
        description: "Test Push",
        callbackUrl,
      },
      context.supabase,
    );

    return {
      success: true,
      checkoutRequestId: result.checkoutRequestId,
      merchantRequestId: result.merchantRequestId,
      message: result.customerMessage,
      phone,
      amount: data.amount ?? 1,
    };
  });

export const getAllTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin;

    // Fetch all tenants with their subscription info and counts
    const { data: tenants, error } = await db
      .from("tenants")
      .select(
        `
        id, 
        name, 
        is_active, 
        subscription_end_at, 
        created_at,
        customers:customers(count),
        routers:routers(count)
      `,
      )
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return (
      tenants as Array<{
        id: string;
        name: string;
        is_active: boolean;
        subscription_end_at: string | null;
        created_at: string;
        customers: Array<{ count: number }>;
        routers: Array<{ count: number }>;
      }>
    ).map((t) => ({
      id: t.id,
      name: t.name,
      isActive: t.is_active,
      expiresAt: t.subscription_end_at,
      createdAt: t.created_at,
      customerCount: t.customers?.[0]?.count ?? 0,
      routerCount: t.routers?.[0]?.count ?? 0,
    }));
  });

const updateTenantSchema = z.object({
  tenantId: z.string().uuid(),
  isActive: z.boolean().optional(),
  expiresAt: z.string().nullable().optional(),
});

export const updateTenantByAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateTenantSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin;

    const patch: Record<string, unknown> = {};
    if (data.isActive !== undefined) patch.is_active = data.isActive;
    if (data.expiresAt !== undefined) patch.subscription_end_at = data.expiresAt;

    const { error } = await db.from("tenants").update(patch).eq("id", data.tenantId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

const deleteTenantSchema = z.object({
  tenantId: z.string().uuid(),
});

export const deleteTenantByAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => deleteTenantSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin;

    // Delete dependent tables manually since ON DELETE CASCADE is likely not configured
    // Order is crucial to avoid foreign key violation errors
    const dependentTables = [
      "transactions", // depends on customers, vouchers
      "router_commands", // depends on routers
      "vouchers", // depends on packages
      "customers", // depends on packages, routers
      "routers",
      "packages",
      "audit_logs",
      "tenant_members",
      "tenant_settings",
      "subscriptions",
      "user_roles",
    ];

    for (const table of dependentTables) {
      const { error } = await db.from(table).delete().eq("tenant_id", data.tenantId);
      if (error) {
        console.error(`Error deleting from ${table}:`, error);
        throw new Error(`Failed to delete ${table}: ${error.message}`);
      }
    }

    const { error } = await db.from("tenants").delete().eq("id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getSuperAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin;

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [
      { count: totalTenants },
      { count: activeSubscriptions },
      { data: platformRevenue },
      { data: todayRevenue },
      { data: monthRevenue },
    ] = await Promise.all([
      db.from("tenants").select("id", { count: "exact", head: true }),
      db
        .from("tenants")
        .select("id", { count: "exact", head: true })
        .gt("subscription_end_at", new Date().toISOString()),
      db
        .from("transactions")
        .select("amount_kes")
        .eq("kind", "saas_subscription")
        .eq("status", "success"),
      db
        .from("transactions")
        .select("amount_kes")
        .eq("kind", "saas_subscription")
        .eq("status", "success")
        .gte("created_at", dayStart.toISOString()),
      db
        .from("transactions")
        .select("amount_kes")
        .eq("kind", "saas_subscription")
        .eq("status", "success")
        .gte("created_at", monthStart.toISOString()),
    ]);

    const sum = (rows: Array<{ amount_kes: number | null }> | null) =>
      (rows ?? []).reduce((acc, r) => acc + (r.amount_kes ?? 0), 0);

    return {
      totalTenants: totalTenants ?? 0,
      activeSubscriptions: activeSubscriptions ?? 0,
      totalRevenue: sum(platformRevenue),
      todayRevenue: sum(todayRevenue),
      monthRevenue: sum(monthRevenue),
    };
  });
