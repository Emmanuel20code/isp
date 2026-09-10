import { Client } from 'pg';

async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();

  const res = await client.query("SELECT tgname FROM pg_trigger WHERE tgrelid = 'vouchers'::regclass;");
  console.log("Triggers on vouchers:", res.rows);
  
  // also let's look at radcheck table definition
  const res2 = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'radcheck';");
  console.log("Radcheck columns:", res2.rows);

  await client.end();
}
check();
