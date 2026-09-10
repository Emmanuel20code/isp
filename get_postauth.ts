import { Client } from 'pg';
async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:5432/postgres' });
  await client.connect();
  const res = await client.query("SELECT username, pass, reply, authdate, nasipaddress FROM radpostauth ORDER BY authdate DESC LIMIT 5;");
  console.log(res.rows);
  await client.end();
}
check();
