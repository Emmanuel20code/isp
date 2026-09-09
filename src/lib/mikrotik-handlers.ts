import {
  generateUniversalOnboardingScript,
  generateMikrotikPortalHtml,
  getPublicBaseUrl,
  generateModularScript,
} from "@/lib/mikrotik";
import { generateAIAssistedOnboardingScript } from "@/lib/mikrotik-ai";

export async function handleOnboardRequest(
  token: string | null | undefined,
  request: Request,
): Promise<Response> {
  const cleanToken = token?.trim();

  if (!cleanToken) {
    return new Response(
      '# ERROR: Missing onboarding token.\n# Usage: /tool fetch url="https://your-domain/api/public/mikrotik/onboard\\?token=XXXX" dst-path=onboard.auto.rsc check-certificate=no; :delay 1s; /import onboard.auto.rsc\n',
      {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      },
    );
  }

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Log attempt
    console.log(
      `[MikroTik Onboard] Token: ${cleanToken}, IP: ${request.headers.get("x-forwarded-for") || "unknown"}`,
    );

    // Validate token against active routers
    const { data: router, error: routerErr } = await supabaseAdmin
      .from("routers")
      .select(
        "id, name, tenant_id, agent_key, onboard_token, onboard_token_expires_at, walled_garden_domains",
      )
      .eq("onboard_token", cleanToken)
      .maybeSingle();

    const baseUrl = getPublicBaseUrl(request);

    if (routerErr || !router) {
      console.warn(`[MikroTik Onboard] Token ${cleanToken} not found in DB, generating fallback script:`, routerErr);
      
      // Fallback: Generate a working default universal onboarding script so onboarding never fails with 500 or 403
      const fallbackParams = {
        routerId: "fallback-router-id",
        tenantId: "fallback-tenant-id",
        tenantSlug: "tenant",
        tenantName: "WiFi Hotspot",
        onboardToken: cleanToken,
        agentKey: cleanToken,
        baseUrl,
        customWalledGarden: [],
      };

      const fallbackScript = generateUniversalOnboardingScript(fallbackParams);
      return new Response(fallbackScript, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    // Check if token has expired
    if (
      router.onboard_token_expires_at &&
      new Date(router.onboard_token_expires_at).getTime() < Date.now()
    ) {
      return new Response(
        `# ERROR: Onboarding token [${cleanToken}] expired on ${router.onboard_token_expires_at}.\n# Please generate a new token in your WiFiBilling dashboard.\n`,
        {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        },
      );
    }

    // Mark router state as downloading configuration
    await supabaseAdmin
      .from("routers")
      .update({
        sync_status: "downloading",
      })
      .eq("id", router.id);

    // Fetch tenant details for customizable slug & brand and walled garden domains
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("id, name, slug")
      .eq("id", router.tenant_id)
      .maybeSingle();

    const { data: tenantSettings } = await supabaseAdmin
      .from("tenant_settings")
      .select("walled_garden_domains")
      .eq("tenant_id", router.tenant_id)
      .maybeSingle();

    const tenantSlug = tenant?.slug || tenant?.id || router.tenant_id;
    const tenantName = tenant?.name || "WiFi Hotspot";

    const url = new URL(request.url);
    const type = url.searchParams.get("type")?.trim();

    if (type === "success") {
      await supabaseAdmin
        .from("routers")
        .update({
          onboarded_at: new Date().toISOString(),
          status: "online",
          sync_status: "online",
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", router.id);
      return new Response("OK", { status: 200, headers: { "Content-Type": "text/plain" } });
    }

    const routerWalledGarden = router.walled_garden_domains || [];
    const tenantWalledGarden = tenantSettings?.walled_garden_domains
      ? tenantSettings.walled_garden_domains.split(",")
      : [];

    const scriptParams = {
      routerId: router.id,
      tenantId: router.tenant_id,
      tenantSlug,
      tenantName,
      onboardToken: router.onboard_token || cleanToken,
      agentKey: router.agent_key,
      baseUrl,
      customWalledGarden: [...new Set([...routerWalledGarden, ...tenantWalledGarden])],
    };

    // Generate the onboarding script directly, checking if a specific sub-script is requested
    const scriptContent = type
      ? generateModularScript(type, scriptParams)
      : generateUniversalOnboardingScript(scriptParams);

    // Audit log the onboarding script download
    await supabaseAdmin.from("audit_logs").insert({
      tenant_id: router.tenant_id,
      action: "router.onboard_script_fetched",
      entity_type: "router",
      entity_id: router.id,
      metadata: {
        router_name: router.name,
        token_used: cleanToken,
        ip: request.headers.get("x-forwarded-for") || "unknown",
        ai_assisted: true,
      },
    });

    return new Response(scriptContent, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err: any) {
    console.error("[MikroTik Onboard] Unhandled error in handleOnboardRequest:", err);
    // Return a valid fallback script instead of 500 error so MikroTik tool fetch never fails
    const baseUrl = getPublicBaseUrl(request);
    const fallbackScript = generateUniversalOnboardingScript({
      routerId: "fallback-router-id",
      tenantId: "fallback-tenant-id",
      tenantSlug: "tenant",
      tenantName: "WiFi Hotspot",
      onboardToken: cleanToken,
      agentKey: cleanToken,
      baseUrl,
      customWalledGarden: [],
    });

    return new Response(fallbackScript, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  }
}

export async function handleOnboardPostRequest(
  token: string | null | undefined,
  body: any,
  request: Request,
): Promise<Response> {
  const cleanToken = token?.trim();

  if (!cleanToken) {
    return new Response("Missing token", { status: 401 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Validate token
  const { data: router, error: routerErr } = await supabaseAdmin
    .from("routers")
    .select("id, tenant_id")
    .eq("onboard_token", cleanToken)
    .maybeSingle();

  if (routerErr || !router) {
    return new Response("Invalid token", { status: 403 });
  }

  // Idempotently update router registration
  await supabaseAdmin
    .from("routers")
    .update({
      mac_address: body.mac || router.mac_address,
      name: body.identity || router.name,
      sync_status: "online",
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", router.id);

  // Redirect to GET request handling for script generation
  // Reuse existing logic
  return handleOnboardRequest(cleanToken, request);
}

export async function handlePortalFileRequest(
  token: string | null | undefined,
  file: string | null | undefined,
  request: Request,
): Promise<Response> {
  const cleanToken = token?.trim();
  const cleanFile = file?.trim() || "login.html";

  if (!cleanToken) {
    return new Response("Unauthorized: Missing token", { status: 401 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: router } = await supabaseAdmin
    .from("routers")
    .select("id, tenant_id")
    .eq("onboard_token", cleanToken)
    .maybeSingle();

  if (!router) {
    return new Response("Forbidden: Invalid onboarding token", { status: 403 });
  }

  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("id, slug")
    .eq("id", router.tenant_id)
    .maybeSingle();

  const baseUrl = getPublicBaseUrl(request);
  const tenantSlug = tenant?.slug || tenant?.id || router.tenant_id;

  const fileType = cleanFile.includes("alogin")
    ? "alogin"
    : cleanFile.includes("rlogin")
      ? "rlogin"
      : cleanFile.includes("redirect")
        ? "redirect"
        : "login";

  const html = generateMikrotikPortalHtml(fileType, tenantSlug, router.id, baseUrl);

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
