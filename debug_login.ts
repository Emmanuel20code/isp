import { Client } from 'pg';

async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();

  console.log("--- 1. Recent Vouchers ---");
  const v = await client.query("SELECT code, status, activated_at, expires_at FROM vouchers ORDER BY created_at DESC LIMIT 3;");
  console.log(v.rows);

  console.log("\n--- 2. Recent Customers (PPPoE/Hotspot) ---");
  const c = await client.query("SELECT username, kind, status, expires_at FROM customers ORDER BY created_at DESC LIMIT 3;");
  console.log(c.rows);

  console.log("\n--- 3. radcheck Table ---");
  const rc = await client.query("SELECT username, attribute, op, value FROM radcheck ORDER BY id DESC LIMIT 10;");
  console.log(rc.rows);
  
  console.log("\n--- 4. NAS Table (Routers) ---");
  const n = await client.query("SELECT nasname, shortname, secret FROM nas;");
  console.log(n.rows);

  console.log("\n--- 5. Recent Authentication Attempts (radpostauth) ---");
  const rpa = await client.query("SELECT username, pass, reply, authdate, nasipaddress FROM radpostauth ORDER BY authdate DESC LIMIT 5;");
  console.log(rpa.rows);

  await client.end();
}
check();
