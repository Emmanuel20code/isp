import { Client } from 'pg';

async function check() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();

  console.log("--- Creating duplicate wildcard NAS to guarantee routing ---");
  const res = await client.query(`
    INSERT INTO nas (id, nasname, shortname, type, secret, "tenantId", description, "createdAt", "updatedAt")
    VALUES (
       gen_random_uuid(),
       '0.0.0.0/0', 
       'Wildcard Fallback', 
       'mikrotik', 
       'emmatech_radius_secret_2026', 
       'c1182e11-6268-49b5-a6c7-55713772e66b', 
       'Fallback wildcard to ensure no IP mismatch',
       NOW(),
       NOW()
    ) ON CONFLICT DO NOTHING;
  `);
  
  const res2 = await client.query(`SELECT nasname, secret FROM nas;`);
  console.log("Active NAS clients:", res2.rows);

  await client.end();
}
check();
