import { supabaseAdmin } from "../integrations/supabase/client.server";

export async function createUser(username: string, plan: string) {
  const { data, error } = await supabaseAdmin
    .from("users") // Assuming 'users' table exists
    .insert([{ username, plan, created_at: new Date().toISOString() }])
    .select();

  if (error) {
    throw new Error(`Failed to create user: ${error.message}`);
  }
  return data;
}
