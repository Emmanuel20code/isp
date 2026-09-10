import { Client } from 'pg';
async function check() {
  const client = new Client({ 
    connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:5432/postgres',
    ssl: false // force no SSL
  });
  try {
    await client.connect();
    console.log("Connected WITHOUT SSL!");
  } catch (err) {
    console.log("Failed to connect without SSL:", err.message);
  }
  await client.end();
}
check();
