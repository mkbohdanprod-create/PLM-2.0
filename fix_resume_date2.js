const { Client } = require('pg');
const fs = require('fs');

const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });

async function fixResumeDate() {
  await client.connect();
  
  // Now run the E2E test
  console.log("--- E2E DB Flow (Full Cycle) ---");
  await client.query('BEGIN;');
  // The correct way to mock Supabase role in this codebase:
  await client.query(`SET LOCAL "request.jwt.claims" = '{"role": "SUPER_ADMIN"}';`);
  // also set jwt.claim.role for fallback just in case
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
  await client.query(`SELECT complete_activity($1, 'NO_ANSWER', 'Не взяли слухавку');`, [first_call_id]);
  res = await client.query(`SELECT title, planned_at, status, outcome FROM order_activities WHERE order_id=$1 ORDER BY created_at ASC;`, [test_order]);
  console.log(JSON.stringify(res.rows, null, 2));
  
  console.log('\\n3. Pause Order (PAUSED):');
  await client.query(`SELECT change_order_status($1, 'PAUSED', 'клієнт попросив', null, null, 'Сирота');`, [test_order]);
  res = await client.query(`SELECT title, planned_at, status, outcome_notes FROM order_activities WHERE order_id=$1 ORDER BY created_at ASC;`, [test_order]);
  console.log(JSON.stringify(res.rows, null, 2));

  console.log('\\n4. Resume Order (RESUME):');
  await client.query(`SELECT change_order_status($1, 'RESUME');`, [test_order]);
  res = await client.query(`SELECT status as order_status, resume_date FROM orders WHERE id=$1;`, [test_order]);
  console.log("Order Status now:", res.rows[0].order_status);
  console.log("Resume Date updated:", res.rows[0].resume_date);

  res = await client.query(`SELECT title, planned_at, status, outcome_notes FROM order_activities WHERE order_id=$1 ORDER BY created_at ASC;`, [test_order]);
  console.log("Activities after resume:", JSON.stringify(res.rows, null, 2));

  await client.query('ROLLBACK;');
  await client.end();
}
fixResumeDate().catch(console.error);
