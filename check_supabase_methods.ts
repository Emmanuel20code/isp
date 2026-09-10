
import { createClient } from "@supabase/supabase-js";

async function check() {
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || "";
  const supabase = createClient(url, key);
  console.log("supabase.auth keys:", Object.keys(supabase.auth));
  console.log("has getClaims:", typeof (supabase.auth as any).getClaims === 'function');
  console.log("has getUser:", typeof (supabase.auth as any).getUser === 'function');
}

check().catch(console.error);
