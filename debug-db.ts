import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRouters() {
  const { data, error } = await supabase
    .from("routers")
    .select("id, name, status, last_seen_at, active_pppoe_users, public_ip, ros_version, onboarded_at, is_disabled, model");

  if (error) {
    console.error("Error fetching routers:", error);
  } else {
    console.log("Routers:", data);
  }
}
checkRouters();
