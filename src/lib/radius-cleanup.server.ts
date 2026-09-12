import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateRadiusCleanupCommand } from "@/lib/mikrotik";
import { RouterManagementService } from "@/lib/router-management.server";
import { z } from "zod";

export const disableRadiusOnAllRouters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = context.userId;

    // 1. Fetch all active routers for this tenant
    const { data: routers, error } = await supabaseAdmin
      .from("routers")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("is_disabled", false);

    if (error || !routers) throw new Error("Failed to fetch routers");

    const routerManager = new RouterManagementService(supabaseAdmin);
    const cleanupCmd = generateRadiusCleanupCommand();

    // 2. Enqueue the cleanup command for each router
    for (const router of routers) {
      console.log(`[RADIUS Cleanup] Enqueuing cleanup command for router: ${router.name}`);
      await (routerManager as any).enqueueCommand({
        tenantId,
        routerId: router.id,
        action: "raw.command",
        payload: { command: cleanupCmd }
      });
    }

    return { success: true, message: `Enqueued RADIUS cleanup for ${routers.length} routers.` };
  });
