import { Client } from 'pg';

async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:5432/postgres' });
  try {
    await client.connect();
    console.log("Pooler session connection successful");
    await client.end();
  } catch (err) {
    console.log("Pooler session connection failed:", err.message);
  }
}
check();
