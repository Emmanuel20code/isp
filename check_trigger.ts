import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
  const { data, error } = await supabase.rpc('execute_sql', { sql_statement: "SELECT tgname FROM pg_trigger WHERE tgrelid = 'vouchers'::regclass;" });
  console.log("RPC Error:", error);
  console.log("Triggers on vouchers:", data);
}
check();
