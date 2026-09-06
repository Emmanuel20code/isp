import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import crypto from "crypto";
import {
  computeRouterStatus,
  generateUniversalOnboardingScript,
  generateModularScript,
  generateOnboardingCommand,
  getPublicBaseUrl,
  generateMikrotikPortalHtml,
} from "@/lib/mikrotik";
import { generateAIAssistedOnboardingScript } from "@/lib/mikrotik-ai";

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
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
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

    const agentKey = crypto.randomBytes(24).toString("hex");
    const onboardToken = generateShortOnboardCode();
    const onboardExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(); // 14 days

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
        configuration_version: 1,
        desired_configuration_version: 1,
        sync_status: "synced",
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
    const newExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

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

export const forceRouterSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenantId = await currentTenantId(supabase, userId);

    const { data: router } = await supabase
      .from("routers")
      .select("id, desired_configuration_version")
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .single();

    if (!router) throw new Error("Router not found");

    const newVersion = (router.desired_configuration_version || 1) + 1;

    await supabaseAdmin
      .from("routers")
      .update({
        desired_configuration_version: newVersion,
        sync_status: "sync_queued",
      })
      .eq("id", data.id);

    return { ok: true, desired_version: newVersion };
  });

export const toggleRouterDisabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), isDisabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await currentTenantId(supabase, userId);

    const { error } = await supabase
      .from("routers")
      .update({ is_disabled: data.isDisabled })
      .eq("id", data.id)
      .eq("tenant_id", tenantId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const fixRouterSsl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await currentTenantId(supabase, userId);

    const { data: router } = await supabase
      .from("routers")
      .select("id, onboard_token")
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .single();

    if (!router) throw new Error("Router not found");

    // Enqueue a direct command to fetch and import the Let's Encrypt Root CA
    // This allows the router to trust wifibilling.site certificates properly
    const { error } = await supabase.from("router_commands").insert({
      tenant_id: tenantId,
      router_id: data.id,
      action: "sys.terminal",
      payload: {
        command:
          ':do { /tool fetch url="https://letsencrypt.org/certs/isrgrootx1.pem" dst-path="isrgrootx1.pem" check-certificate=no; /certificate import file-name=isrgrootx1.pem passphrase=""; /file remove isrgrootx1.pem; :log info "WiFiBilling: SSL CA fix applied (ISRG Root X1)." } on-error={ :log error "WiFiBilling: SSL CA fix failed." }',
      },
      status: "queued",
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const hardenRouterHotspot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await currentTenantId(supabase, userId);

    const { data: router } = await supabase
      .from("routers")
      .select("id, name, onboard_token")
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .single();

    if (!router) throw new Error("Router not found");

    // Enqueue hotspot hardening command to eliminate unauthorized device connections
    const { error } = await supabase.from("router_commands").insert({
      tenant_id: tenantId,
      router_id: data.id,
      action: "hotspot.harden_security",
      payload: {
        reason: "dashboard_manual_hardening",
        timestamp: new Date().toISOString(),
      },
      status: "queued",
    });

    if (error) throw new Error(error.message);
    return { ok: true, message: "Hotspot hardening command queued for router." };
  });

export const deleteRouter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isSuperAdmin = (userRoles ?? []).some((r) => r.role === "super_admin");

    let tenantId: string | null = null;
    if (!isSuperAdmin) {
      tenantId = await currentTenantId(supabase, userId);
    }

    let query = supabaseAdmin.from("routers").select("id, name, tenant_id").eq("id", data.id);
    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }
    const { data: router, error: findError } = await query.maybeSingle();

    if (findError) throw new Error(`Failed to locate router: ${findError.message}`);
    if (!router) throw new Error("Router not found or you do not have permission to delete it.");

    await supabaseAdmin.from("router_commands").delete().eq("router_id", data.id);
    await supabaseAdmin.from("router_heartbeats").delete().eq("router_id", data.id);
    await supabaseAdmin.from("router_sync_logs").delete().eq("router_id", data.id);
    await supabaseAdmin.from("customers").update({ router_id: null }).eq("router_id", data.id);
    await supabaseAdmin.from("vouchers").update({ router_id: null }).eq("router_id", data.id);

    const { error: deleteError } = await supabaseAdmin.from("routers").delete().eq("id", data.id);
    if (deleteError) throw new Error(`Failed to delete router: ${deleteError.message}`);

    return { ok: true, id: data.id };
  });

export const deletePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenantId = await currentTenantId(supabase, userId);

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
        name: z
          .string()
          .trim()
          .min(2, "Router name must be at least 2 characters")
          .max(60, "Router name must be 60 characters or less"),
        location: z.string().trim().max(80).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await currentTenantId(supabase, userId);

    const newName = data.name.trim();
    const newLocation = data.location ? data.location.trim() : null;

    const { data: updated, error } = await supabase
      .from("routers")
      .update({
        name: newName,
        location: newLocation,
      })
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    try {
      const sanitizedIdentity = newName.replace(/["\r\n\\]/g, "");
      await supabase.from("router_commands").insert({
        tenant_id: tenantId,
        router_id: data.id,
        action: "raw.command",
        payload: {
          command: `:do { /system identity set name="${sanitizedIdentity}"; } on-error={};`,
        },
        status: "queued",
      });
    } catch {
      // Non-fatal if command queue fails
    }

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

export const getRouterScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        routerId: z.string(),
        scriptType: z.enum(["monolithic", "modular", "portal"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await currentTenantId(supabase, userId);

    const { data: router, error } = await supabase
      .from("routers")
      .select("id, name, tenant_id, agent_key, onboard_token, walled_garden_domains")
      .eq("id", data.routerId)
      .eq("tenant_id", tenantId)
      .single();

    if (error || !router) throw new Error("Router not found");

    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, name, slug")
      .eq("id", tenantId)
      .maybeSingle();

    const baseUrl = getPublicBaseUrl();
    const tenantSlug = tenant?.slug || tenant?.id || router.tenant_id;
    const tenantName = tenant?.name || "WiFi Hotspot";
    const scriptType = data.scriptType || "monolithic";

    const params = {
      routerId: router.id,
      tenantId: router.tenant_id,
      tenantSlug,
      tenantName,
      onboardToken: router.onboard_token || "DEMO-TOKEN",
      agentKey: router.agent_key,
      baseUrl,
      customWalledGarden: router.walled_garden_domains || [],
    };

    const scriptContent =
      scriptType === "modular"
        ? generateModularScript("master", params)
        : scriptType === "portal"
          ? generateMikrotikPortalHtml("login", params.tenantSlug, params.routerId, params.baseUrl)
          : generateUniversalOnboardingScript(params);

    const cleanBaseUrl = baseUrl.replace(/\/+$/, "");
    const command =
      scriptType === "modular"
        ? `/tool fetch url="${cleanBaseUrl}/scripts/mainhotspot.rsc\\?token=${router.onboard_token || ""}" dst-path="mainhotspot.rsc" check-certificate=no; :delay 2s; /import mainhotspot.rsc`
        : scriptType === "portal"
          ? `# Manually copy the HTML above and place it in your router's hotspot/login.html file`
          : generateOnboardingCommand(baseUrl, router.onboard_token || "");

    return {
      script: scriptContent,
      command,
      routerName: router.name,
      onboardToken: router.onboard_token,
    };
  });

export const getAICustomRouterScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        routerId: z.string(),
        wifiName: z.string().optional(),
        lanInterface: z.string().optional(),
        wanInterface: z.string().optional(),
        hotspotSubnet: z.string().optional(),
        gatewayIp: z.string().optional(),
        pppoeSubnet: z.string().optional(),
        enableFastPath: z.boolean().optional(),
        enableFailover: z.boolean().optional(),
        autoRebootHour: z.number().nullable().optional(),
        customPrompt: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await currentTenantId(supabase, userId);

    const { data: router, error } = await supabase
      .from("routers")
      .select("id, name, tenant_id, agent_key, onboard_token, walled_garden_domains")
      .eq("id", data.routerId)
      .eq("tenant_id", tenantId)
      .single();

    if (error || !router) throw new Error("Router not found");

    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, name, slug")
      .eq("id", tenantId)
      .maybeSingle();

    const baseUrl = getPublicBaseUrl();
    const tenantSlug = tenant?.slug || tenant?.id || router.tenant_id;
    const tenantName = tenant?.name || "WiFi Hotspot";

    // Generate reference script
    const referenceScript = generateUniversalOnboardingScript({
      routerId: router.id,
      tenantId: router.tenant_id,
      tenantSlug,
      tenantName,
      onboardToken: router.onboard_token || "DEMO-TOKEN",
      agentKey: router.agent_key,
      baseUrl,
      customWalledGarden: router.walled_garden_domains || [],
    });

    const scriptContent = await generateAIAssistedOnboardingScript({
      routerId: router.id,
      tenantId: router.tenant_id,
      tenantSlug,
      tenantName,
      onboardToken: router.onboard_token || "DEMO-TOKEN",
      agentKey: router.agent_key,
      baseUrl,
      wifiName: data.wifiName,
      lanInterface: data.lanInterface,
      wanInterface: data.wanInterface,
      hotspotSubnet: data.hotspotSubnet,
      gatewayIp: data.gatewayIp,
      pppoeSubnet: data.pppoeSubnet,
      customWalledGarden: router.walled_garden_domains || [],
      enableFastPath: data.enableFastPath,
      enableFailover: data.enableFailover,
      autoRebootHour: data.autoRebootHour,
      customPrompt: data.customPrompt,
      referenceScript,
    });

    return {
      script: scriptContent,
      routerName: router.name,
    };
  });
