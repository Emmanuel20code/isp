import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: tenants } = await supabase.from('tenants').select('id, name, slug, subscription_end_at, is_active');
  const tenant = tenants.find(t => t.name.includes('three') || t.slug.includes('three'));
  
  console.log("Tenant:", tenant);
  
  const { data: audits } = await supabase.from('audit_logs').select('id, metadata, action, created_at').eq('tenant_id', tenant.id).eq('action', 'subscription.renewed').order('created_at', { ascending: true });
  console.log("Audits:", audits);
}
run();
