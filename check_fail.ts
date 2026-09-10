import { Client } from 'pg';

async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();

  console.log("--- Checking 5 most recent vouchers ---");
  const res = await client.query("SELECT code, status, activated_at, expires_at FROM vouchers ORDER BY created_at DESC LIMIT 5;");
  console.log(res.rows);

  console.log("\n--- Checking radcheck for those vouchers ---");
  const codes = res.rows.map(r => `'${r.code}'`).join(',');
  if (codes) {
      const res2 = await client.query(`SELECT username, attribute, op, value FROM radcheck WHERE username IN (${codes});`);
      console.log(res2.rows);
  }

  await client.end();
}
check();
