import { Client } from 'pg';

async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres:Jevish2026!@db.bzjvzfrlfplhmmobzhmw.supabase.co:5432/postgres' });
  try {
    await client.connect();
    console.log("Direct connection successful");
    await client.end();
  } catch (err) {
    console.log("Direct connection failed:", err.message);
  }
}
check();
