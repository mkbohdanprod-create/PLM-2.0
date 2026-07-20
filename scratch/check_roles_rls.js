const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  await client.connect();
  const res = await client.query("SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'roles'::regclass;");
  console.log('Policies on roles:', res.rows);
  await client.end();
}
run().catch(console.error);
