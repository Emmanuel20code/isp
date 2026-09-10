import { Client } from 'pg';

async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();

  const res2 = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'radpostauth';");
  console.log(res2.rows);

  await client.end();
}
check();
