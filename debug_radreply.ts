import { Client } from 'pg';

async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();

  console.log("--- radreply for 6JU2V5 ---");
  const rc = await client.query("SELECT username, attribute, op, value FROM radreply WHERE username = '6JU2V5';");
  console.log(rc.rows);
  
  await client.end();
}
check();
