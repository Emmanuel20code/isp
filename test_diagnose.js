import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: tenants } = await supabase.from('tenants').select('id, name, slug, subscription_end_at, is_active');
  const tenant = tenants.find(t => t.name.includes('two@gmail.com') || t.slug.includes('two') || JSON.stringify(t).includes('two@gmail'));
  
  if (!tenant) {
    console.log("Tenant not found.");
    return;
  }
  
  console.log("Tenant:", tenant);
  
  const { data: txns } = await supabase.from('transactions').select('*').eq('tenant_id', tenant.id);
  console.log("Txns:", txns.length);
  
  const { data: audits } = await supabase.from('audit_logs').select('*').eq('tenant_id', tenant.id).eq('action', 'subscription.renewed');
  console.log("Audits:", audits.length);
}
run();
