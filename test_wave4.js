const { Client } = require('pg');

const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });

async function runTests() {
  await client.connect();

  let branchRes = await client.query('SELECT id FROM branches LIMIT 1');
  let valid_branch = branchRes.rows[0]?.id;

  console.log('--- Creating Test Order ---');
  let res = await client.query(`SELECT * FROM create_order('EXT-W4-1', $1, 'FULL_CYCLE', 'Test W4', '380991234567', 'Kyiv', 'Хрещатик', '1', 'Пластик', 10, true);`, [valid_branch]);
  let test_order = res.rows[0].create_order.order_id;
  console.log('Order ID:', test_order);

  console.log('--- Checking Auto-Created Activity ---');
  res = await client.query(`SELECT title, activity_type, planned_at, status FROM order_activities WHERE order_id=$1;`, [test_order]);
  console.log(JSON.stringify(res.rows, null, 2));

  console.log('--- Checking next_activity_at RPC ---');
  res = await client.query(`SELECT next_activity_at(t.*) as next_act FROM orders t WHERE id=$1;`, [test_order]);
  console.log(res.rows[0]);

  console.log('--- Creating INTERNAL_NOTE ---');
  await client.query(`SELECT create_activity($1, 'INTERNAL_NOTE', now() + interval '1 hour', 'Перевірити креслення', 'Треба глянути', 'ENGINEER');`, [test_order]);
  
  res = await client.query(`SELECT title, activity_type, assigned_to_role FROM order_activities WHERE order_id=$1 ORDER BY planned_at DESC LIMIT 1;`, [test_order]);
  console.log(JSON.stringify(res.rows, null, 2));

  console.log('--- Cleanup ---');
  await client.query(`DELETE FROM orders WHERE id=$1;`, [test_order]);

  await client.end();
}
runTests().catch(console.error);
