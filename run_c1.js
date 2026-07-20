const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
async function run() {
  await client.connect();
  await client.query(`UPDATE status_transitions SET allowed_roles = array_append(allowed_roles, 'UNKNOWN') WHERE NOT ('UNKNOWN' = ANY(allowed_roles));`);
  let branchRes = await client.query('SELECT id FROM branches LIMIT 1');
  let valid_branch = branchRes.rows[0]?.id;

  try {
      let res = await client.query(`INSERT INTO orders (order_number, branch_id, order_type, base_readiness_date, internal_target_date, calc_readiness_date, status) VALUES ('TEST-C1', $1, 'FULL_CYCLE', '2026-09-01', '2026-08-25', '2026-09-01', 'MEASUREMENT_SCHEDULED') RETURNING id;`, [valid_branch]);
      let id = res.rows[0].id;
      await client.query(`SELECT change_order_status($1, 'MEASUREMENT_FAILED', 'клієнт відсутній');`, [id]);
      
      // Simulate Pause
      await client.query(`UPDATE orders SET status = 'PAUSED', previous_status = 'MEASUREMENT_SCHEDULING' WHERE id=$1;`, [id]);
      await client.query(`INSERT INTO order_status_history (order_id, from_status, to_status, reason, changed_at, source) VALUES ($1, 'MEASUREMENT_SCHEDULING', 'PAUSED', 'CLIENT_FAULT', NOW() - INTERVAL '3 days', 'UI');`, [id]);
      
      await client.query(`SELECT change_order_status($1, 'RESUME', 'відновлюємо');`, [id]);
      res = await client.query(`SELECT status, base_readiness_date, internal_target_date, calc_readiness_date FROM orders WHERE id=$1;`, [id]);
      console.log('After Resume:', JSON.stringify(res.rows, null, 2));
  } catch(e) { console.error("Error C1", e.message); }

  await client.query(`UPDATE status_transitions SET allowed_roles = array_remove(allowed_roles, 'UNKNOWN');`);
  await client.query(`DELETE FROM order_status_history WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE 'TEST-%');`);
  await client.query(`DELETE FROM orders WHERE order_number LIKE 'TEST-%';`);
  await client.end();
}
run().catch(console.error);
