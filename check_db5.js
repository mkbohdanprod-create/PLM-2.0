const { Client } = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  const res = await client.query("SELECT pg_get_function_arguments(oid) as args FROM pg_proc WHERE proname = 'create_order'");
  console.log(res.rows.map(r => r.args).join('\n---\n'));
  await client.end();
}
run();
