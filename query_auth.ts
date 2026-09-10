import { Client } from 'pg';
async function run() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();
  const res = await client.query("SELECT * FROM radcheck WHERE username = 'V6ZJAS';");
  console.log("radcheck:", res.rows);
  const auths = await client.query("SELECT * FROM radpostauth WHERE username = 'V6ZJAS' ORDER BY authdate DESC LIMIT 5;");
  console.log("radpostauth:", auths.rows);
  const mpesa = await client.query("SELECT * FROM mpesa_payments ORDER BY created_at DESC LIMIT 5;");
  console.log("mpesa_payments:", mpesa.rows);
  await client.end();
}
run();
