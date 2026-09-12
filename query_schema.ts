import { Client } from 'pg';
async function run() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();
  
  const tables = ['radcheck', 'radreply', 'nas'];
  for (const table of tables) {
    const res = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${table}';`);
    console.log(`${table} columns:`, res.rows);
  }
  
  await client.end();
}
run();
