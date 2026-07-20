const { Client } = require('pg');
const connectionString = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  const res = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'orders'");
  console.log(res.rows.map(r => r.column_name));
  await client.end();
}
run().catch(console.error);
