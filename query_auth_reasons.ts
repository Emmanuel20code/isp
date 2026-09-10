import { Client } from 'pg';
async function run() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();
  const auths = await client.query("SELECT * FROM radpostauth ORDER BY authdate DESC LIMIT 5;");
  console.log("Recent radpostauth:", auths.rows);
  const vouchers = await client.query("SELECT * FROM vouchers WHERE code = 'V6ZJAS';");
  console.log("Vouchers:", vouchers.rows);
  await client.end();
}
run();
