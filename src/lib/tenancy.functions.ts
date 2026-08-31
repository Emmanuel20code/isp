import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { slugify } from "./subscription";
import { provisionTenantForUser } from "./tenancy.server";

const registerTenantSchema = z.object({
  name: z.string().min(2).max(80),
  businessPhone: z.string().min(7).max(20),
  businessEmail: z.string().email().max(120),
  county: z.string().max(60).optional(),
});

const SUPERADMIN_EMAILS = ["emmanueloyaro123@gmail.com", "emmanueloyaro3@gmail.com"];

export const getMyContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [{ data: profile }, { data: roles }, { data: memberships }, { data: settings }] =
      await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role, tenant_id").eq("user_id", userId),
        supabase
          .from("tenant_members")
          .select("tenant_id, role")
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),
        supabase.from("platform_settings").select("*").maybeSingle(),
      ]);

    let activeProfile = profile;
    const claims = (context.claims as Record<string, unknown>) || {};
    const claimEmail = (claims.email as string) || "";
    const claimMeta = (claims.user_metadata as Record<string, unknown>) || {};
    const claimName = (claimMeta.full_name as string) || "";
    const claimPhone = (claimMeta.phone as string) || "";

    if (!activeProfile) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: healed } = await supabaseAdmin
          .from("profiles")
          .upsert({
            id: userId,
            email: claimEmail,
            full_name: claimName,
            phone: claimPhone,
          })
          .select("*")
          .maybeSingle();
        if (healed) activeProfile = healed;
      } catch (err) {
        console.warn("Auto-heal profile error:", err);
      }
    }

    let isSuperAdmin = (roles ?? []).some((r) => r.role === "super_admin");
    const userEmail = (activeProfile?.email || claimEmail).toLowerCase();

    if (!isSuperAdmin && userEmail && SUPERADMIN_EMAILS.includes(userEmail)) {
      isSuperAdmin = true;
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("user_roles").insert({
          user_id: userId,
          role: "super_admin",
          tenant_id: null,
        });
      } catch (err) {
        console.error("Auto-assign super admin role error:", err);
      }
    }

    const tenantId = memberships?.[0]?.tenant_id ?? null;
    let tenant = tenantId
      ? (await supabase.from("tenants").select("*").eq("id", tenantId).maybeSingle()).data
      : null;
    const tenantSettings = tenantId
      ? (await supabase.from("tenant_settings").select("*").eq("tenant_id", tenantId).maybeSingle())
          .data
      : null;

    // Automate maintenance check & immediate subscription recovery
    if (tenantId) {
      try {
        const { runBackgroundMaintenance, recoverPendingSaaSPayment } =
          await import("./maintenance.server");

        // If the tenant is expired/suspended, try to recover any recent payment synchronously
        // to ensure "immediate" activation feel after user pays.
        if (tenant && tenant.subscription_status !== "active") {
          const recovered = await recoverPendingSaaSPayment(tenantId);
          if (recovered) {
            // Re-fetch tenant if recovered to get the active status
            const fresh = await supabase
              .from("tenants")
              .select("*")
              .eq("id", tenantId)
              .maybeSingle();
            if (fresh.data) tenant = fresh.data;
          }
        }

        runBackgroundMaintenance().catch((e) =>
          console.error("[maintenance] background task failed:", e),
        );
      } catch (err) {
        // likely on client side or build time
      }
    }

    return {
      userId,
      profile: activeProfile ?? null,
      tenant,
      tenantSettings: tenantSettings ?? null,
      tenantRole: memberships?.[0]?.role ?? null,
      isSuperAdmin,
      platform: settings ?? null,
    };
  });

/** Dedicated server-side registration function to bypass public GoTrue DB errors and auto-confirm accounts */
export const registerAccountFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().email().max(120),
        password: z.string().min(8).max(100),
        fullName: z.string().min(1).max(80),
        phone: z.string().min(5).max(20),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const cleanEmail = data.email.trim().toLowerCase();
    const cleanName = data.fullName.trim();
    const cleanPhone = data.phone.trim();

    // 1. Create user in Supabase Auth via Admin API
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: cleanName,
        phone: cleanPhone,
      },
    });

    if (createError) {
      const errMsg = createError.message || "";
      if (
        errMsg.toLowerCase().includes("already registered") ||
        errMsg.toLowerCase().includes("duplicate") ||
        errMsg.toLowerCase().includes("exists")
      ) {
        throw new Error("An account with this email already exists. Please sign in instead.");
      }
      throw new Error(errMsg || "Failed to create account. Please try again.");
    }

    if (!userData.user?.id) {
      throw new Error("User creation failed. Please try again.");
    }

    const userId = userData.user.id;

    // 2. Upsert profile table record
    try {
      await supabaseAdmin.from("profiles").upsert(
        {
          id: userId,
          email: cleanEmail,
          full_name: cleanName,
          phone: cleanPhone,
        },
        { onConflict: "id" },
      );
    } catch (profileErr) {
      console.warn("Profile creation note:", profileErr);
    }

    // 3. Auto-provision tenant
    try {
      const baseName = cleanName || "My Wi-Fi";
      const name = `${baseName.split(" ")[0]} Networks`;
      await provisionTenantForUser(userId, {
        name,
        businessPhone: cleanPhone,
        businessEmail: cleanEmail,
      });
    } catch (tenantErr) {
      console.warn("Tenant provisioning note:", tenantErr);
    }

    return { ok: true, userId };
  });

/** Auto-creates the user's business on first dashboard visit (post sign-up). Idempotent. */
export const ensureMyTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, phone, email")
      .eq("id", userId)
      .maybeSingle();

    const claims = (context.claims as Record<string, unknown>) || {};
    const claimEmail = (claims.email as string) || "";
    const claimMeta = (claims.user_metadata as Record<string, unknown>) || {};
    const claimName = (claimMeta.full_name as string) || "";
    const claimPhone = (claimMeta.phone as string) || "";

    const baseName = (profile?.full_name || claimName || "").trim();
    const name = baseName ? `${baseName.split(" ")[0]} Networks` : "My Wi-Fi Business";

    const { tenantId } = await provisionTenantForUser(userId, {
      name,
      businessPhone: profile?.phone || claimPhone || "",
      businessEmail: profile?.email || claimEmail || "",
    });
    return { tenantId };
  });

export const registerTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => registerTenantSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const existing = await supabase
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1);
    if (existing.data?.[0]?.tenant_id) {
      return { tenantId: existing.data[0].tenant_id, created: false };
    }

    const owned = await supabase
      .from("tenants")
      .select("id")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true })
      .limit(1);
    if (owned.data?.[0]?.id) {
      return { tenantId: owned.data[0].id, created: false };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: platform } = await supabaseAdmin
      .from("platform_settings")
      .select("trial_days")
      .maybeSingle();
    const trialDays = platform?.trial_days ?? 3;

    let slug = slugify(data.name) || "isp";
    const { data: taken } = await supabaseAdmin.from("tenants").select("slug").eq("slug", slug);
    if (taken && taken.length > 0) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

    const now = new Date();
    const trialEnd = new Date(now.getTime() + trialDays * 86_400_000);

    const { data: tenant, error } = await supabaseAdmin
      .from("tenants")
      .insert({
        name: data.name,
        slug,
        owner_id: userId,
        business_email: data.businessEmail,
        business_phone: data.businessPhone,
        county: data.county ?? null,
        trial_start_at: now.toISOString(),
        trial_end_at: trialEnd.toISOString(),
        subscription_status: "trialing",
      })
      .select("id")
      .single();
    if (error || !tenant) {
      if (error?.code === "23505") {
        const { data: mine } = await supabaseAdmin
          .from("tenants")
          .select("id")
          .eq("owner_id", userId)
          .order("created_at", { ascending: true })
          .limit(1);
        if (mine?.[0]?.id) return { tenantId: mine[0].id, created: false };
      }
      throw new Error(error?.message ?? "Could not create the business");
    }

    await supabaseAdmin.from("tenant_members").insert({
      tenant_id: tenant.id,
      user_id: userId,
      role: "tenant_owner",
    });
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "tenant_owner", tenant_id: tenant.id });
    await supabaseAdmin.from("tenant_settings").insert({
      tenant_id: tenant.id,
      portal_title: `${data.name} WiFi`,
      support_phone: data.businessPhone,
      support_email: data.businessEmail,
    });
    await supabaseAdmin.from("audit_logs").insert({
      tenant_id: tenant.id,
      actor_id: userId,
      action: "tenant.created",
      entity_type: "tenant",
      entity_id: tenant.id,
      metadata: { name: data.name, trial_days: trialDays },
    });

    return { tenantId: tenant.id, created: true };
  });

const tenantSettingsSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(2).max(80),
  businessPhone: z.string().min(7).max(20),
  businessEmail: z.string().email().max(120),
  country: z.string().min(2).optional(),
  mpesaShortcode: z.string().max(12).nullable().optional(),
  mpesaShortcodeKind: z.enum(["till", "paybill"]).nullable().optional(),
  mpesaAccountRef: z.string().max(12).nullable().optional(),
});

export const updateTenantProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => tenantSettingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const updatePayload: Record<string, unknown> = {
      name: data.name,
      business_phone: data.businessPhone,
      business_email: data.businessEmail,
      mpesa_shortcode: data.mpesaShortcode ?? null,
      mpesa_shortcode_kind: data.mpesaShortcodeKind ?? null,
      mpesa_account_ref: data.mpesaAccountRef ?? null,
    };
    if (data.country) {
      updatePayload.country = data.country;
    }
    const { error } = await context.supabase
      .from("tenants")
      .update(updatePayload)
      .eq("id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getPlatformOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: adminRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!adminRow) throw new Error("Forbidden");

    const { data: tenants } = await context.supabase
      .from("tenants")
      .select(
        "id, name, slug, business_phone, subscription_status, trial_end_at, subscription_end_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);

    return { tenants: tenants ?? [] };
  });

export const updatePortalSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tenantId: z.string().uuid(),
        portalTitle: z.string().max(100).nullable().optional(),
        portalSubtitle: z.string().max(250).nullable().optional(),
        brandColor: z.string().max(30).optional(),
        accentColor: z.string().max(30).optional(),
        themePreset: z.enum(["midnight", "obsidian", "sapphire", "light"]).optional(),
        announcementText: z.string().max(300).nullable().optional(),
        cardStyle: z.enum(["pill", "modern", "minimal"]).optional(),
        logoUrl: z.string().url().max(1000).nullable().or(z.literal("")).optional(),
        supportPhone: z.string().max(30).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const updatePayload: Record<string, unknown> = {};
    if (data.portalTitle !== undefined) updatePayload.portal_title = data.portalTitle;
    if (data.portalSubtitle !== undefined) updatePayload.portal_subtitle = data.portalSubtitle;
    if (data.brandColor !== undefined) updatePayload.brand_color = data.brandColor;
    if (data.accentColor !== undefined) updatePayload.accent_color = data.accentColor;
    if (data.themePreset !== undefined) updatePayload.theme_preset = data.themePreset;
    if (data.announcementText !== undefined)
      updatePayload.announcement_text = data.announcementText;
    if (data.cardStyle !== undefined) updatePayload.card_style = data.cardStyle;
    if (data.logoUrl !== undefined) {
      updatePayload.logo_url = data.logoUrl === "" ? null : data.logoUrl;
    }
    if (data.supportPhone !== undefined) updatePayload.support_phone = data.supportPhone;

    const { error } = await context.supabase
      .from("tenant_settings")
      .update(updatePayload)
      .eq("tenant_id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
