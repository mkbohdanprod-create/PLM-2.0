const { Client } = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  const fn = await client.query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'next_activity_at'");
  if(fn.rows.length > 0) {
      console.log(fn.rows[0].def);
  } else {
      console.log('Function not found.');
  }
  await client.end();
}
run();
