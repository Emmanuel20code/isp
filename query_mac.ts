import { Client } from 'pg';
async function run() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();
  const res = await client.query("SELECT * FROM radcheck WHERE username = 'V6ZJAS';");
  console.log("radcheck for V6ZJAS:", res.rows);
  await client.end();
}
run();
