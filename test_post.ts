import { Client } from 'pg';
async function run() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();
  const radpostauth = await client.query("SELECT * FROM radpostauth ORDER BY authdate DESC LIMIT 5;");
  console.log("radpostauth:", radpostauth.rows);
  await client.end();
}
run();
