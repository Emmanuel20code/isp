import { Client } from 'pg';
async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres:Jevish2026!@db.bzjvzfrlfplhmmobzhmw.supabase.co:5432/postgres' });
  await client.connect();
  const res = await client.query("SELECT username, pass, reply, authdate, nasipaddress FROM radpostauth ORDER BY authdate DESC LIMIT 5;");
  console.log("Recent Auth Logs:");
  console.log(res.rows);
  await client.end();
}
check();
