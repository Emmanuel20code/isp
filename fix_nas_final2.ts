import { Client } from 'pg';

async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();

  console.log("--- Updating radcheck cleartext attribute spelling ---");
  const res = await client.query(`
    UPDATE radcheck 
    SET attribute = 'Cleartext-Password' 
    WHERE attribute = 'Cleartext-password' OR attribute = 'Password';
  `);
  console.log("Updated rows:", res.rowCount);

  await client.end();
}
check();
