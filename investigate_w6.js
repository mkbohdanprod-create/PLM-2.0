const { Client } = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function investigate() {
  await client.connect();
  try {
    console.log("=== 1. engineering_tasks ===");
    const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'engineering_tasks'");
    if(res.rows.length) console.table(res.rows);
    else console.log("Table 'engineering_tasks' DOES NOT EXIST.");

    console.log("\n=== 2. orders statuses (ENGINEERING%) ===");
    const sRes = await client.query("SELECT DISTINCT status FROM orders WHERE status LIKE 'ENGINEERING%'");
    console.table(sRes.rows);

    console.log("\n=== 3. status_transitions (ENGINEERING%) ===");
    const trRes = await client.query("SELECT from_status, to_status, allowed_roles FROM status_transitions WHERE from_status LIKE 'ENGINEERING%' OR to_status LIKE 'ENGINEERING%'");
    console.table(trRes.rows);

    console.log("\n=== 4. check RPCs ===");
    const rpcRes = await client.query("SELECT proname FROM pg_proc WHERE proname IN ('assign_engineer', 'update_engineering_task_status')");
    console.table(rpcRes.rows);

  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
investigate();
