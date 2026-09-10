import { Client } from 'pg';

async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();

  console.log("--- Syncing routers to NAS with Gen random uuid ---");
  const res = await client.query(`
    INSERT INTO nas (id, nasname, shortname, type, secret, "tenantId", tenant_id, router_id, description)
    SELECT 
       gen_random_uuid(),
       COALESCE(r.public_ip, '0.0.0.0/0'), 
       r.name, 
       'mikrotik', 
       COALESCE(r.radius_secret, 'emmatech_radius_secret_2026'), 
       r.tenant_id, 
       r.tenant_id, 
       r.id, 
       'Auto-synced router ' || r.name
    FROM routers r
    WHERE NOT EXISTS (SELECT 1 FROM nas n WHERE n.router_id = r.id);
  `);
  console.log("NAS inserted rows:", res.rowCount);
  
  const res2 = await client.query(`SELECT nasname, secret FROM nas;`);
  console.log("Active NAS clients:", res2.rows);

  await client.end();
}
check();
