import pkg from 'pg';
const { Client } = pkg;
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  const res = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'order_status_history';");
  console.log(res.rows);
  await client.end();
}
run();
