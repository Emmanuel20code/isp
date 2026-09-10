
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    const { data, error } = await supabase.from('radpostauth').select('*').limit(1);
    if (data && data.length > 0) {
        console.log("radpostauth columns:", Object.keys(data[0]));
    } else {
        console.log("radpostauth empty or error:", error?.message);
    }
}

test();
