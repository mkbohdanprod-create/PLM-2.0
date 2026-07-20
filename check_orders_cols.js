const { Client } = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  const cols = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'orders'");
  console.log(cols.rows.map(r => r.column_name).join(', '));
  await client.end();
}
run();
