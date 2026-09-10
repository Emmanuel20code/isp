import { Client } from 'pg';
async function run() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();
  const radcheck = await client.query("SELECT * FROM radcheck WHERE username = 'HMG8M5';");
  console.log("radcheck:", radcheck.rows);
  const radpostauth = await client.query("SELECT * FROM radpostauth WHERE username = 'HMG8M5' ORDER BY authdate DESC LIMIT 3;");
  console.log("radpostauth:", radpostauth.rows);
  const vouchers = await client.query("SELECT * FROM vouchers WHERE code = 'HMG8M5';");
  console.log("vouchers:", vouchers.rows);
  await client.end();
}
run();
