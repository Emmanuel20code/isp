import { Client } from 'pg';

async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();

  console.log("--- Creating test voucher ---");
  const expiresAt = new Date(Date.now() + 60 * 60000).toISOString();
  
  await client.query(`
    INSERT INTO vouchers (tenant_id, package_id, code, status, phone, activated_at, expires_at)
    VALUES ('c1182e11-6268-49b5-a6c7-55713772e66b', '19a9231b-3ceb-44b5-8050-0973a10a46fb', 'RADTEST1', 'active', '000000', NOW(), $1)
  `, [expiresAt]);

  const rc = await client.query("SELECT * FROM radcheck WHERE username = 'RADTEST1';");
  console.log("Radcheck for RADTEST1:", rc.rows);
  
  await client.end();
}
check();
