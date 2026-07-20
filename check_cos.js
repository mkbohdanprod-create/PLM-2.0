const { Client } = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  const res = await client.query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'change_order_status'");
  if (res.rows.length > 0) console.log(res.rows[0].def.substring(0, 200));
  else console.log('Not found');
  await client.end();
}
run();
