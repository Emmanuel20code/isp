import { Client } from 'pg';
async function run() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();
  try {
    await client.query("INSERT INTO radreply (username, attribute, op, value, tenant_id, \"tenantId\") VALUES ('QS5L45', 'Port-Limit', '=', '1', 'c1182e11-6268-49b5-a6c7-55713772e66b', 'c1182e11-6268-49b5-a6c7-55713772e66b')");
    console.log("Success");
  } catch (err) {
    console.error(err);
  }
  await client.end();
}
run();
