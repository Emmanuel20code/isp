import { Client } from 'pg';
async function run() {
  const client = new Client({ connectionString: 'postgresql://postgres.bzjvzfrlfplhmmobzhmw:Jevish2026!@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' });
  await client.connect();
  await client.query("INSERT INTO radcheck (username, attribute, op, value) VALUES ('test1', 'Cleartext-Password', ':=', 'test1')");
  await client.query("INSERT INTO radcheck (username, attribute, op, value) VALUES ('test2', 'Cleartext-Password', '==', 'test2')");
  console.log("Inserted");
  await client.end();
}
run();
