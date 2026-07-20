import pkg from 'pg';
const { Client } = pkg;
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  const res = await client.query("SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'assign_measurement' LIMIT 1;");
  console.log(res.rows[0]?.def);
  await client.end();
}
run();
