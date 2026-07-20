const { Client } = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  const ve = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'roles'");
  console.log(ve.rows.map(r => r.column_name).join(', '));
  await client.end();
}
run();
