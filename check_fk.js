import pkg from 'pg';
const { Client } = pkg;
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  const res = await client.query("SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.order_activities'::regclass;");
  console.log(res.rows);
  await client.end();
}
run();
