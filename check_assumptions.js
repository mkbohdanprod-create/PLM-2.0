const { Client } = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  
  // 1. create_order definition
  console.log('--- create_order ---');
  try {
    const co = await client.query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'create_order'");
    if (co.rows.length > 0) {
      console.log(co.rows[0].def.split('\n').slice(0, 5).join('\n'));
    }
  } catch(e) { console.error(e.message); }

  // 2. auth.users NOT NULL columns
  console.log('\n--- auth.users columns ---');
  try {
    const au = await client.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND is_nullable = 'NO'");
    console.log(au.rows);
  } catch(e) { console.error(e.message); }

  // 3. profiles columns
  console.log('\n--- profiles columns ---');
  try {
    const pr = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles'");
    console.log(pr.rows.map(r => r.column_name).join(', '));
  } catch(e) { console.error(e.message); }

  // 4. Trigger definition
  console.log('\n--- trigger definition ---');
  try {
    const trg = await client.query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname IN ('handle_new_user', 'on_auth_user_created')");
    if (trg.rows.length > 0) {
      console.log(trg.rows[0].def);
    } else {
      console.log('Trigger function not found.');
    }
  } catch(e) { console.error(e.message); }
  
  await client.end();
}
run();
