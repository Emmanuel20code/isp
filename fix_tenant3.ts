import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const tenantId = "e058b19f-8bd0-464d-ae11-86e7fa8e0393";

  // Update tenant to correct expiry (2026-10-05)
  await supabase
    .from("tenants")
    .update({ subscription_end_at: "2026-10-05T11:30:55.787Z" })
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

  console.log("Fixed tenant three@gmail.com and cleaned up duplicate audit logs.");
}
run();
