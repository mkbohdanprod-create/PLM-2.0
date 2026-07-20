const { Client } = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  const res = await client.query("SELECT udt_name FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'allowed_view_regions'");
  console.log('Type:', res.rows[0].udt_name);
  await client.end();
}
run();
