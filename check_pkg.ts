import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
  const { data: pkg } = await supabase.from("packages").select("*").eq("id", "19a9231b-3ceb-44b5-8050-0973a10a46fb");
  console.log(pkg);
}
check();
