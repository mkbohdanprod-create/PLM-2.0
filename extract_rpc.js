const { Client } = require('pg');
const fs = require('fs');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  const res = await client.query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'change_order_status' ORDER BY pronargs DESC LIMIT 1");
  fs.writeFileSync('c:/hhgh/PLM module/change_order_status.sql', res.rows[0].def);
  await client.end();
}
run();
