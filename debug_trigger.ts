import { Client } from 'pg';

async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();

  console.log("--- radpostauth triggers ---");
  const res = await client.query("SELECT tgname FROM pg_trigger WHERE tgrelid = 'radpostauth'::regclass;");
  console.log(res.rows);

  await client.end();
}
check();
