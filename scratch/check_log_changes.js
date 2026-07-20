const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  await client.connect();
  const res = await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'log_changes';");
  console.log('Function log_changes:', res.rows[0]?.prosrc);
  await client.end();
}
run().catch(console.error);
