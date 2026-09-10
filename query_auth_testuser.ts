import { Client } from 'pg';
async function run() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();
  const radcheck = await client.query("SELECT * FROM radcheck WHERE username = 'testuser';");
  console.log("radcheck testuser:", radcheck.rows);
  const radpostauth = await client.query("SELECT * FROM radpostauth ORDER BY authdate DESC LIMIT 5;");
  console.log("radpostauth:", radpostauth.rows);
  await client.end();
}
run();
