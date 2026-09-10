import { Client } from 'pg';

async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();

  console.log("--- Inserting a test router to verify the trigger ---");
  const tenantId = 'c1182e11-6268-49b5-a6c7-55713772e66b'; // using existing tenant
  
  const resInsert = await client.query(`
    INSERT INTO routers (name, public_ip, tenant_id, radius_secret)
    VALUES ('Trigger Test Router', '1.2.3.4', $1, 'test_secret_123')
    RETURNING id;
  `, [tenantId]);
  
  const routerId = resInsert.rows[0].id;
  console.log("Inserted router ID:", routerId);
  
  const resNas = await client.query(`
    SELECT nasname, shortname, secret, router_id FROM nas WHERE router_id = $1;
  `, [routerId]);
  console.log("NAS entry created by trigger:", resNas.rows);
  
  console.log("--- Cleaning up test router ---");
  await client.query(`DELETE FROM routers WHERE id = $1;`, [routerId]);
  
  const resNasAfterDelete = await client.query(`
    SELECT * FROM nas WHERE router_id = $1;
  `, [routerId]);
  console.log("NAS entry after delete (should be empty):", resNasAfterDelete.rows);

  await client.end();
}
check();
