import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin as supabase } from "@/integrations/supabase/client.server";

export const getPublicStats = createServerFn({ method: "GET" }).handler(async () => {
  const [{ count: totalTenants }, { count: totalCustomers }] = await Promise.all([
    supabase.from("tenants").select("id", { count: "exact", head: true }),
    supabase.from("customers").select("id", { count: "exact", head: true }),
  ]);

  return {
    totalTenants: totalTenants ?? 0,
    totalCustomers: totalCustomers ?? 0,
  };
});

export const getPublicSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await supabase
    .from("platform_settings")
    .select("subscription_price_kes, trial_days, support_phone")
    .maybeSingle();

  return {
    subscriptionPriceKes: data?.subscription_price_kes ?? 1500,
    trialDays: data?.trial_days ?? 3,
    supportPhone: data?.support_phone ?? "254712345678",
  };
});
