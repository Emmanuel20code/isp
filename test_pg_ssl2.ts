import { Client } from 'pg';
async function check() {
  const client = new Client({ 
    connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:5432/postgres',
    ssl: false
  });
  try {
    await client.connect();
    const res = await client.query("SELECT 1 as val;");
    console.log("Query result WITHOUT SSL:", res.rows);
  } catch (err) {
    console.log("Failed to connect without SSL:", err.message);
  }
  await client.end();
}
check();
