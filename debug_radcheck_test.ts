import { Client } from 'pg';

async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();

  console.log("--- Updating radcheck cleartext attribute op ---");
  const res = await client.query(`
    UPDATE radcheck 
    SET op = '=='
    WHERE attribute = 'Cleartext-Password';
  `);
  console.log("Updated rows:", res.rowCount);

  await client.end();
}
check();
