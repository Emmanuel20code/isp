import { Client } from 'pg';
async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres:Jevish2026!@db.bzjvzfrlfplhmmobzhmw.supabase.co:5432/postgres' });
  await client.connect();
  const res = await client.query("SELECT * FROM nas;");
  console.log("NAS Table:", res.rows);
  const res2 = await client.query("SELECT username, pass, reply, authdate, nasipaddress FROM radpostauth ORDER BY authdate DESC LIMIT 10;");
  console.log("Recent Auth Logs:", res2.rows);
  await client.end();
}
check();
