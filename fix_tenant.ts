import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const tenantId = "f7267de1-b3b0-466d-8153-294025a40b92";

  // Update tenant
  await supabase
    .from("tenants")
    .update({ subscription_end_at: "2026-10-05T09:53:42.644Z" })
    .eq("id", tenantId);

  // Keep only the first audit log (postgres trigger), delete the rest
  const { data: audits } = await supabase
    .from("audit_logs")
    .select("id, metadata")
    .eq("tenant_id", tenantId)
    .eq("action", "subscription.renewed")
    .order("created_at", { ascending: true });

  if (audits && audits.length > 1) {
    const idsToDelete = audits.slice(1).map((a) => a.id);
    await supabase.from("audit_logs").delete().in("id", idsToDelete);
  }

  console.log("Fixed tenant and cleaned up audit logs.");
}
run();
