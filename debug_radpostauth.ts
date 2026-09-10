import { Client } from 'pg';

async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();

  console.log("--- radpostauth Table ---");
  const rpa = await client.query("SELECT username, pass, reply, authdate, nasipaddress FROM radpostauth ORDER BY authdate DESC LIMIT 10;");
  console.log(rpa.rows);

  await client.end();
}
check();
