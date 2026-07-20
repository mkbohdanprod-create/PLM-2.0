const { Client } = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  const res = await client.query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'get_user_role'");
  console.log(res.rows[0].def);
  await client.end();
}
run();
