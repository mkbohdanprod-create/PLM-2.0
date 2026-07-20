const { Client } = require('pg');
const fs = require('fs');

const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });

async function fixResumeDate() {
  await client.connect();

  let changeOrderRes = await client.query(`SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'change_order_status' AND pg_get_function_arguments(oid) LIKE '%p_reason text DEFAULT NULL%';`);
  let changeOrderDef = changeOrderRes.rows[0].def;
  
  // We need to update resume_date = p_planned_call_date when pausing
  changeOrderDef = changeOrderDef.replace(
    /planned_call_date = CASE/g,
    `resume_date = CASE 
        WHEN p_planned_call_date IS NOT NULL THEN p_planned_call_date
        WHEN v_target_status = 'PAUSED' AND p_planned_call_date IS NULL THEN now() + interval '3 days'
        ELSE resume_date
      END,
      planned_call_date = CASE`
  );
  
  await client.query(changeOrderDef);
  
  // Now run the E2E test (with SUPER_ADMIN override using a function wrapper or pure SQL transaction)
  console.log("--- E2E DB Flow (Full Cycle) ---");
  await client.query('BEGIN;');
  await client.query(`SET LOCAL "request.jwt.claim.role" = 'SUPER_ADMIN';`);

  let branchRes = await client.query('SELECT id FROM branches LIMIT 1');
  let valid_branch = branchRes.rows[0]?.id;

  let res = await client.query(`
    SELECT * FROM create_order('E2E-TEST-FINAL', $1, 'FULL_CYCLE', 'Test Flow Final', '380991234562', 'Kyiv', 'St', '1', 'PVC', 10, true, null, null, null, null, null, null);
  `, [valid_branch]);
  let test_order = res.rows[0].create_order.order_id;
  
  console.log('1. Ordered created. Activities:');
  res = await client.query(`SELECT id, title, activity_type, planned_at, status FROM order_activities WHERE order_id=$1;`, [test_order]);
  let first_call_id = res.rows[0].id;
  console.log(JSON.stringify(res.rows, null, 2));

  console.log('\\n2. Complete with NO_ANSWER:');
  // Need to bypass auth checks in node script by using postgres or just call it directly since we're postgres
  // Wait, I am postgres, but the function has IF current_user != 'postgres', so postgres bypasses it!
  await client.query(`SELECT complete_activity($1, 'NO_ANSWER', 'Не взяли слухавку');`, [first_call_id]);
  res = await client.query(`SELECT title, planned_at, status, outcome FROM order_activities WHERE order_id=$1 ORDER BY created_at ASC;`, [test_order]);
  console.log(JSON.stringify(res.rows, null, 2));
  
  console.log('\\n3. Pause Order (PAUSED):');
  // Using postgres bypasses the transition RLS check but fails at `IF v_role != 'SUPER_ADMIN'` because `v_role` is UNKNOWN!
  // To fix this in the test script, we created a wrapper or just use `SET LOCAL request.jwt.claim.role = 'SUPER_ADMIN'` which we DID do!
  // BUT `current_setting('request.jwt.claim.role', true)` inside get_user_role() works now?
  // Let's create a temporary dummy function to bypass everything, or just execute `change_order_status`.
  // Wait, we did `SET LOCAL`, so `get_user_role()` SHOULD return SUPER_ADMIN. Let's see!
  try {
    await client.query(`SELECT change_order_status($1, 'PAUSED', 'клієнт попросив', null, null, 'Сирота');`, [test_order]);
  } catch(e) {
    console.log("Error pausing:", e.message);
  }
  res = await client.query(`SELECT title, planned_at, status, outcome_notes FROM order_activities WHERE order_id=$1 ORDER BY created_at ASC;`, [test_order]);
  console.log(JSON.stringify(res.rows, null, 2));

  console.log('\\n4. Resume Order (RESUME):');
  try {
    await client.query(`SELECT change_order_status($1, 'RESUME');`, [test_order]);
  } catch(e) {
    console.log("Error resuming:", e.message);
  }
  res = await client.query(`SELECT status as order_status FROM orders WHERE id=$1;`, [test_order]);
  console.log("Order Status now:", res.rows[0].order_status);

  // Check if orphan activity was cancelled
  res = await client.query(`SELECT title, planned_at, status, outcome_notes FROM order_activities WHERE order_id=$1 ORDER BY created_at ASC;`, [test_order]);
  console.log("Activities after resume:", JSON.stringify(res.rows, null, 2));

  await client.query('ROLLBACK;');
  await client.end();
}
fixResumeDate().catch(console.error);
