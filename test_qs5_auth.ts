import { Client } from 'pg';
async function run() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();
  const auths = await client.query("SELECT * FROM radpostauth WHERE username = 'QS5L45' ORDER BY authdate DESC;");
  console.log("radpostauth recent:", auths.rows);
  await client.end();
}
run();
