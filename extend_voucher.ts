import { Client } from 'pg';
async function run() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();
  console.log("Extending voucher...");
  await client.query("UPDATE vouchers SET expires_at = NOW() + interval '1 day' WHERE code = 'QS5L45';");
  
  const radreply = await client.query("SELECT * FROM radreply WHERE username = 'QS5L45';");
  console.log("radreply:", radreply.rows);
  const radcheck = await client.query("SELECT * FROM radcheck WHERE username = 'QS5L45';");
  console.log("radcheck:", radcheck.rows);
  await client.end();
}
run();
