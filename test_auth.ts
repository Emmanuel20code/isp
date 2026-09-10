import { Client } from 'pg';

async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();

  console.log("--- Checking radreply for active vouchers ---");
  const res2 = await client.query(`SELECT username, attribute, op, value FROM radreply WHERE username IN ('5BND72', '7GYM7K');`);
  console.log(res2.rows);

  await client.end();
}
check();
