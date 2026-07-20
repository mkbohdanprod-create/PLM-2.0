const { Client } = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function getSigs() {
  await client.connect();
  try {
    const rpcRes = await client.query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname IN ('assign_engineer', 'update_engineering_task_status')");
    rpcRes.rows.forEach(r => console.log(r.def));
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
getSigs();
