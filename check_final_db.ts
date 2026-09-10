import { Client } from 'pg';
async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:5432/postgres' });
  await client.connect();
  const res = await client.query("SELECT * FROM radcheck WHERE username = '6JU2V5';");
  console.log(res.rows);
  const auths = await client.query("SELECT * FROM radpostauth ORDER BY authdate DESC LIMIT 5;");
  console.log("Postauth:", auths.rows);
  await client.end();
}
check();
