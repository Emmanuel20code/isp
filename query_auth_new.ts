import { Client } from 'pg';
async function run() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();
  const radcheck = await client.query("SELECT * FROM radcheck WHERE username = '42AN2H';");
  console.log("radcheck:", radcheck.rows);
  const auths = await client.query("SELECT * FROM radpostauth ORDER BY authdate DESC LIMIT 5;");
  console.log("radpostauth:", auths.rows);
  await client.end();
}
run();
