import { Client } from 'pg';
async function run() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();
  const radcheck = await client.query("SELECT * FROM radcheck WHERE username = 'V6ZJAS';");
  console.log("radcheck:", radcheck.rows);
  const radreply = await client.query("SELECT * FROM radreply WHERE username = 'V6ZJAS';");
  console.log("radreply:", radreply.rows);
  const radgroupcheck = await client.query("SELECT * FROM radgroupcheck");
  console.log("radgroupcheck:", radgroupcheck.rows);
  const radusergroup = await client.query("SELECT * FROM radusergroup WHERE username = 'V6ZJAS';");
  console.log("radusergroup:", radusergroup.rows);
  await client.end();
}
run();
