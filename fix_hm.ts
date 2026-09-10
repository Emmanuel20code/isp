import { Client } from 'pg';
async function run() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();
  console.log("Fixing HMG8M5...");
  await client.query("UPDATE vouchers SET status = 'active', expires_at = NOW() + interval '1 day' WHERE code = 'HMG8M5';");
  await client.end();
}
run();
