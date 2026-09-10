import { Client } from 'pg';
async function run() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();
  const res = await client.query("SELECT username, LENGTH(username), value, LENGTH(value) FROM radcheck WHERE username LIKE '%V6Z%';");
  console.log(res.rows);
  await client.end();
}
run();
