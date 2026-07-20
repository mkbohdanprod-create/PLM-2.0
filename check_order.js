import pkg from 'pg';
const { Client } = pkg;
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  const res = await client.query("SELECT created_at FROM orders WHERE order_number = 'O-EA84B4';");
  console.log('Created at:', res.rows[0]);
  await client.end();
}
run();
