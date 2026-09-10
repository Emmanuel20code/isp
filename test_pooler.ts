import { Client } from 'pg';
async function check(port) {
  const client = new Client({ connectionString: `postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:${port}/postgres` });
  try {
    await client.connect();
    const res = await client.query("SELECT 1;");
    console.log(`Port ${port} success:`, res.rows);
  } catch (err) {
    console.log(`Port ${port} error:`, err.message);
  } finally {
    await client.end();
  }
}
async function run() {
  await check(6543);
  await check(5432);
}
run();
