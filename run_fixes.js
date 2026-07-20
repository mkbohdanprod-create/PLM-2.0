const { Client } = require('pg');
const fs = require('fs');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function runTests() {
  await client.connect();
  
  const fixSql = fs.readFileSync('fix_wave3.sql', 'utf8');
  await client.query(fixSql);
  
  console.log('--- Proacl Verify ---');
  let res = await client.query(`SELECT proname, prosecdef, proacl FROM pg_proc WHERE proname='appsheet_webhook_update';`);
  console.log(JSON.stringify(res.rows, null, 2));

  await client.query(`UPDATE status_transitions SET allowed_roles = array_append(allowed_roles, 'UNKNOWN') WHERE NOT ('UNKNOWN' = ANY(allowed_roles));`);
  let branchRes = await client.query('SELECT id FROM branches LIMIT 1');
  let valid_branch = branchRes.rows[0]?.id;

  console.log('--- B2 Verify after fix ---');
  try {
      res = await client.query(`INSERT INTO orders (order_number, branch_id, order_type, status) VALUES ('TEST-B2-FIX', $1, 'FULL_CYCLE', 'MEASUREMENT_SCHEDULED') RETURNING id;`, [valid_branch]);
      let test_order = res.rows[0].id;
      await client.query(`INSERT INTO measurement_tasks (order_id, outcome, scheduled_date, start_time, end_time) VALUES ($1, 'SCHEDULED', NOW(), NOW(), NOW() + interval '1 hour');`, [test_order]);
      
      await client.query(`SELECT change_order_status($1, 'MEASUREMENT_CANCELED_BY_MEASURER', 'test');`, [test_order]);
      
      res = await client.query(`SELECT outcome FROM measurement_tasks WHERE order_id=$1;`, [test_order]);
      console.log('Tasks:', JSON.stringify(res.rows, null, 2));
      
      res = await client.query(`SELECT status FROM orders WHERE id=$1;`, [test_order]);
      console.log('Order status:', JSON.stringify(res.rows, null, 2));
      
      await client.query(`DELETE FROM measurement_tasks WHERE order_id=$1;`, [test_order]);
      await client.query(`DELETE FROM order_status_history WHERE order_id=$1;`, [test_order]);
      await client.query(`DELETE FROM orders WHERE id=$1;`, [test_order]);
  } catch (e) { console.error("Error B2", e.message); }

  console.log('--- C1 Verify after fix ---');
  try {
      res = await client.query(`INSERT INTO orders (order_number, branch_id, order_type, base_readiness_date, internal_target_date, calc_readiness_date, status) VALUES ('TEST-C1-FIX', $1, 'FULL_CYCLE', '2026-09-01', '2026-08-25', '2026-09-01', 'MEASUREMENT_SCHEDULED') RETURNING id;`, [valid_branch]);
      let id = res.rows[0].id;
      
      await client.query(`SELECT change_order_status($1, 'MEASUREMENT_FAILED', 'клієнт відсутній');`, [id]);
      
      // Simulate Pause
      await client.query(`UPDATE orders SET status = 'PAUSED', previous_status = 'MEASUREMENT_SCHEDULING' WHERE id=$1;`, [id]);
      await client.query(`INSERT INTO order_status_history (order_id, from_status, to_status, reason, changed_at, source) VALUES ($1, 'MEASUREMENT_SCHEDULING', 'PAUSED', 'CLIENT_FAULT', NOW() - INTERVAL '3 days', 'UI');`, [id]);
      
      await client.query(`SELECT change_order_status($1, 'RESUME', 'відновлюємо');`, [id]);
      res = await client.query(`SELECT status, base_readiness_date, internal_target_date, calc_readiness_date FROM orders WHERE id=$1;`, [id]);
      console.log('After Resume:', JSON.stringify(res.rows, null, 2));
      
      await client.query(`DELETE FROM order_status_history WHERE order_id=$1;`, [id]);
      await client.query(`DELETE FROM orders WHERE id=$1;`, [id]);
  } catch(e) { console.error("Error C1", e.message); }

  await client.query(`UPDATE status_transitions SET allowed_roles = array_remove(allowed_roles, 'UNKNOWN');`);
  await client.end();
}

runTests().catch(console.error);
