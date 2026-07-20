const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  await client.connect();
  const res = await client.query("SELECT trigger_name, action_statement FROM information_schema.triggers WHERE event_object_table = 'roles';");
  console.log('Triggers on roles:', res.rows);
  await client.end();
}
run().catch(console.error);
