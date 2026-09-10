import { Client } from 'pg';

async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();

  console.log("--- Removing Auth-Type Reject fallback rule to isolate problem ---");
  await client.query(`DELETE FROM radcheck WHERE attribute = 'Auth-Type';`);
  console.log("Removed all Auth-Type explicit Reject rules from db.");

  await client.end();
}
check();
