const { Client } = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  
  const orders = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'is_reclamation_frozen'");
  console.log('\\n--- orders is_reclamation_frozen ---');
  orders.rows.forEach(r => console.log(r.column_name + ' | ' + r.data_type));
  
  const fn = await client.query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'create_reclamation' ORDER BY pronargs DESC LIMIT 1");
  console.log('\\n--- create_reclamation def ---');
  console.log(fn.rows[0].def);
  
  await client.end();
}
run();
