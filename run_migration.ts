import { Client } from 'pg';
import * as fs from 'fs';

async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();

  try {
    const sql = fs.readFileSync('supabase/migrations/20260912000001_remove_duplicate_tenantid.sql', 'utf8');
    await client.query(sql);
    console.log("Migration applied successfully!");
  } catch (err) {
    console.error("Migration error:", err.message);
  }

  const res = await client.query("SELECT tgname FROM pg_trigger WHERE tgrelid = 'vouchers'::regclass;");
  console.log("Triggers on vouchers:", res.rows);

  await client.end();
}
check();
