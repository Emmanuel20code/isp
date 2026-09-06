import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.from('audit_logs').select('id').eq('action', 'subscription.renewed').eq('entity_id', 'f69867e1-9aee-4da1-841d-7c6d0b50a427').maybeSingle();
  console.log("Data:", data);
  console.log("Error:", error);
}
run();
