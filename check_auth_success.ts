import { Client } from 'pg';
async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:5432/postgres' });
  await client.connect();
  
  console.log("--- Recent Auth Logs ---");
  const res = await client.query("SELECT username, pass, reply, authdate, nasipaddress FROM radpostauth ORDER BY authdate DESC LIMIT 5;");
  console.log(res.rows);
  
  console.log("\n--- Active Sessions ---");
  const res2 = await client.query("SELECT username, nasipaddress, acctstarttime FROM radacct ORDER BY acctstarttime DESC LIMIT 5;");
  console.log(res2.rows);

  await client.end();
}
check();
