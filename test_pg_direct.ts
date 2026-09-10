import { Client } from 'pg';
async function check() {
  const client = new Client({ 
    connectionString: 'postgresql://postgres:Jevish2026!@db.bzjvzfrlfplhmmobzhmw.supabase.co:5432/postgres',
    ssl: false
  });
  try {
    await client.connect();
    const res = await client.query("SELECT 1 as val;");
    console.log("Direct Query result WITHOUT SSL:", res.rows);
  } catch (err) {
    console.log("Direct Failed to connect without SSL:", err.message);
  }
  await client.end();
}
check();
