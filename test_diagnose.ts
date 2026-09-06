import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: tenants } = await supabase.from('tenants').select('id, name, slug, subscription_end_at, is_active');
  const tenant = tenants.find(t => t.name.includes('two') || t.slug.includes('two'));
  
  if (!tenant) {
    console.log("Tenant not found.");
    return;
  }
  
  console.log("Tenant:", tenant);
  
  const { data: txns } = await supabase.from('transactions').select('id, status, mpesa_receipt, amount_kes, created_at, kind').eq('tenant_id', tenant.id).order('created_at', { ascending: false });
  console.log("Txns:", txns);
  
  const { data: audits } = await supabase.from('audit_logs').select('id, entity_id, metadata').eq('tenant_id', tenant.id).eq('action', 'subscription.renewed');
  console.log("Audits:", audits);
}
run();
