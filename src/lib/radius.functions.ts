import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getRadiusAuthLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = context.userId;

    // Fetch recent RADIUS auth logs from radpostauth for this tenant
    const { data: logs, error } = await supabaseAdmin
      .from("radpostauth")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("authdate", { ascending: false })
      .limit(100);

    // Derived connection info for the user to link their Contabo server
    const supabaseUrl = process.env.SUPABASE_URL || "https://bzjvzfrlfplhmmobzhmw.supabase.co";
    const dbHost = supabaseUrl.replace("https://", "").replace(".supabase.co", "") + ".pooler.supabase.com";

    if (error) {
      console.error("[RADIUS Logs] Error fetching logs:", error);
      return { logs: [], dbInfo: { host: dbHost, port: 6543, user: "postgres" } };
    }

    return {
      logs: logs || [],
      dbInfo: {
        host: dbHost,
        port: 6543,
        user: "postgres",
        dbName: "postgres",
      }
    };
  });

export const automateRouterRadiusConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ routerId: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenantId = context.userId;

    // 1. Fetch router details and current RADIUS settings
    const { data: router } = await supabaseAdmin
      .from("routers")
      .select("id, name, tenant_id")
      .eq("id", data.routerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!router) throw new Error("Router not found or unauthorized");

    const radiusSecret = process.env.RADIUS_SECRET || "emmatech_radius_secret_2026";
    // Strictly use the Contabo IP for this specific deployment
    const serverIp = "13.140.174.60"; 

    console.log(`[RADIUS Automation] Configuring router ${router.name} to use RADIUS server ${serverIp}`);

    // 2. Prepare MikroTik commands - Including cleanup for the 'random' cloud IPs and existing server entries
    const commands = [
      `/radius remove [find address~"69.46."]`, // Remove the 'random' cloud IPs
      `/radius remove [find address="${serverIp}"]`, // Remove if it already exists to avoid duplication errors
      `/radius add address=${serverIp} secret="${radiusSecret}" service=hotspot,ppp timeout=3000ms`,
      `/ip hotspot profile set [find where name="default"] use-radius=yes`,
      `/ppp profile set [find where name="default"] use-radius=yes`,
      `/ip hotspot profile set [find where name="hsprof1"] use-radius=yes`, // Common MikroTik hotspot profile name
      `/radius incoming set accept=yes port=3799`
    ];

    const { RouterManagementService } = await import("@/lib/router-management.server");
    const routerManager = new RouterManagementService(supabaseAdmin);

    // 3. Enqueue the commands
    for (const cmd of commands) {
      await routerManager.enqueueCommand({
        tenantId,
        routerId: router.id,
        action: "raw.command",
        payload: { command: cmd }
      });
    }

    return { success: true, message: `Configuration commands enqueued for ${router.name}. They will be applied within 10-20 seconds.` };
  });
