import { supabaseAdmin } from "../integrations/supabase/client.server";

export async function generateVoucher(code: string, durationHours: number, price: number) {
  const { data, error } = await supabaseAdmin
    .from("vouchers")
    .insert([{ code, duration_hours: durationHours, price, status: 'unused', created_at: new Date().toISOString() }])
    .select();

  if (error) {
    throw new Error(`Failed to generate voucher: ${error.message}`);
  }
  return data;
}
