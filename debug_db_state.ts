import { Client } from 'pg';
async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();
  const res = await client.query("SELECT * FROM radcheck WHERE username = '6JU2V5';");
  console.log("radcheck 6JU2V5:", res.rows);
  const res2 = await client.query("SELECT * FROM radcheck WHERE username = 'RADTEST1';");
  console.log("radcheck RADTEST1:", res2.rows);
  await client.end();
}
check();
