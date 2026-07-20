const { Client } = require('pg');

const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });

async function runTests() {
  await client.connect();

  let branchRes = await client.query('SELECT id FROM branches LIMIT 1');
  let valid_branch = branchRes.rows[0]?.id;

  console.log('1. --- Creating Test Order (MEASUREMENT_SCHEDULING) ---');
  let res = await client.query(`SELECT * FROM create_order('E2E-TEST', $1, 'FULL_CYCLE', 'Test Flow', '380991234567', 'Kyiv', 'St', '1', 'PVC', 10, true);`, [valid_branch]);
  let test_order = res.rows[0].create_order.order_id;
  
  res = await client.query(`SELECT id, title, activity_type, planned_at, status FROM order_activities WHERE order_id=$1;`, [test_order]);
  let first_call_id = res.rows[0].id;
  console.log(JSON.stringify(res.rows, null, 2));

  console.log('\\n2. --- Complete with NO_ANSWER ---');
  await client.query(`SELECT complete_activity($1, 'NO_ANSWER', 'Не взяли слухавку');`, [first_call_id]);
  
  res = await client.query(`SELECT id, title, activity_type, planned_at, status, outcome FROM order_activities WHERE order_id=$1 ORDER BY created_at ASC;`, [test_order]);
  console.log(JSON.stringify(res.rows, null, 2));
  
  let new_call_id = res.rows[1].id; // The new one is PENDING

  console.log('\\n3. --- Pause Order (PAUSED) ---');
  await client.query(`SELECT change_order_status($1, 'PAUSED', 'клієнт попросив', null, null, 'Сирота');`, [test_order]);
  
  res = await client.query(`SELECT title, planned_at, status, outcome_notes FROM order_activities WHERE order_id=$1 ORDER BY created_at ASC;`, [test_order]);
  console.log(JSON.stringify(res.rows, null, 2));

  console.log('\\n4. --- Resume Order (RESUME) ---');
  await client.query(`SELECT change_order_status($1, 'RESUME');`, [test_order]);
  
  res = await client.query(`SELECT status as order_status FROM orders WHERE id=$1;`, [test_order]);
  console.log("Order Status now:", res.rows[0].order_status);

  console.log('\\n--- Cleanup ---');
  await client.query(`DELETE FROM orders WHERE id=$1;`, [test_order]);

  await client.end();
}
runTests().catch(console.error);
