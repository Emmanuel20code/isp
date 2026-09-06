import { slugify } from "./subscription";

type Provision = {
  name: string;
  businessPhone: string;
  businessEmail: string;
  county?: string | null;
};

/** Creates the tenant for a user if they don't have one yet. Idempotent. */
export async function provisionTenantForUser(userId: string, input: Provision) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const existingMember = await supabaseAdmin
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (existingMember.data?.[0]?.tenant_id) {
    return { tenantId: existingMember.data[0].tenant_id, created: false };
  }

  const owned = await supabaseAdmin
    .from("tenants")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (owned.data?.[0]?.id) {
    const tenantId = owned.data[0].id;
    await supabaseAdmin
      .from("tenant_members")
      .upsert(
        { tenant_id: tenantId, user_id: userId, role: "tenant_owner" },
        { onConflict: "user_id" },
      );
    return { tenantId, created: false };
  }

  const { data: platform } = await supabaseAdmin
    .from("platform_settings")
    .select("trial_days")
    .maybeSingle();
  const trialDays = platform?.trial_days ?? 3;

  let slug = slugify(input.name) || "isp";
  const { data: taken } = await supabaseAdmin.from("tenants").select("slug").eq("slug", slug);
  if (taken && taken.length > 0) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  const now = new Date();
  const trialEnd = new Date(now.getTime() + trialDays * 86_400_000);

  const { data: tenant, error } = await supabaseAdmin
    .from("tenants")
    .insert({
      name: input.name,
      slug,
      owner_id: userId,
      business_email: input.businessEmail,
      business_phone: input.businessPhone,
      county: input.county ?? null,
      trial_start_at: now.toISOString(),
      trial_end_at: trialEnd.toISOString(),
      subscription_status: "trialing",
    })
    .select("id")
    .single();

  if (error || !tenant) {
    const { data: mine } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true })
      .limit(1);
    if (mine?.[0]?.id) return { tenantId: mine[0].id, created: false };
    throw new Error(error?.message ?? "Could not create the business");
  }

  try {
    await supabaseAdmin
      .from("tenant_members")
      .upsert(
        { tenant_id: tenant.id, user_id: userId, role: "tenant_owner" },
        { onConflict: "user_id" },
      );
  } catch (e) {
    console.warn("[Tenancy] tenant_members upsert note:", e);
  }

  try {
    await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: userId, role: "tenant_owner", tenant_id: tenant.id },
        { onConflict: "user_id,role" },
      );
  } catch (e) {
    console.warn("[Tenancy] user_roles upsert note:", e);
  }

  try {
    await supabaseAdmin.from("tenant_settings").upsert(
      {
        tenant_id: tenant.id,
        portal_title: `${input.name} WiFi`,
        support_phone: input.businessPhone,
        support_email: input.businessEmail,
      },
      { onConflict: "tenant_id" },
    );
  } catch (e) {
    console.warn("[Tenancy] tenant_settings upsert note:", e);
  }

  try {
    await supabaseAdmin.from("audit_logs").insert({
      tenant_id: tenant.id,
      actor_id: userId,
      action: "tenant.created",
      entity_type: "tenant",
      entity_id: tenant.id,
      metadata: { name: input.name, trial_days: trialDays, auto: true },
    });
  } catch (e) {
    console.warn("[Tenancy] audit_logs insert note:", e);
  }

  return { tenantId: tenant.id, created: true };
}
