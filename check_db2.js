const { Client } = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  
  // 1. check create_order signature
  const co = await client.query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'create_order'");
  console.log('--- create_order ---');
  if (co.rows.length > 0) console.log(co.rows[0].def.split('\n').slice(0, 5).join('\n'));
  
  // 2. check vehicles columns
  const ve = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'vehicles'");
  console.log('\n--- vehicles columns ---');
  console.log(ve.rows.map(r => r.column_name).join(', '));
  
  // 3. check roles
  const ro = await client.query("SELECT code FROM roles");
  console.log('\n--- roles ---');
  console.log(ro.rows.map(r => r.code).join(', '));
  
  // 4. check can_access_order
  const ca = await client.query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'can_access_order'");
  console.log('\n--- can_access_order snippet ---');
  if (ca.rows.length > 0) console.log(ca.rows[0].def.substring(0, 500));
  
  await client.end();
}
run();
