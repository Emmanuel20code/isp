import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const updateWalledGarden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tenantId: z.string().uuid(),
        domains: z.array(z.string()),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Store as comma-separated string
    const domains = data.domains.join(",");
    const { error } = await context.supabase
      .from("tenant_settings")
      .update({ walled_garden_domains: domains })
      .eq("tenant_id", data.tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getWalledGarden = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ tenantId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: settings, error } = await context.supabase
      .from("tenant_settings")
      .select("walled_garden_domains")
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      domains: settings?.walled_garden_domains ? settings.walled_garden_domains.split(",") : [],
    };
  });
