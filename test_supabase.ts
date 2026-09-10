
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

console.log("auth methods:", Object.keys(supabase.auth));
console.log("getClaims exists:", typeof (supabase.auth as any).getClaims === "function");
try {
    const claims = (supabase.auth as any).getClaims("dummy.token.here");
    console.log("getClaims call type:", typeof claims);
} catch (e) {
    console.log("getClaims call failed:", e.message);
}
