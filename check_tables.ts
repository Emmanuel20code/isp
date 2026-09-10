
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    const { data, error } = await supabase.from('radpostauth').select('*').limit(1);
    if (error) {
        console.log("radpostauth check failed:", error.message);
    } else {
        console.log("radpostauth exists, count:", data.length);
    }

    const { data: tables, error: schemaErr } = await supabase.rpc('get_tables'); // if exists
    console.log("RPC get_tables error:", schemaErr?.message);
}

test();
