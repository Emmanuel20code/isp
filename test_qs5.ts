import { Client } from 'pg';
async function run() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();
  const radcheck = await client.query("SELECT * FROM radcheck WHERE username = 'QS5L45';");
  console.log("radcheck for QS5L45:", radcheck.rows);
  const vouchers = await client.query("SELECT * FROM vouchers WHERE code = 'QS5L45';");
  console.log("vouchers:", vouchers.rows);
  await client.end();
}
run();
