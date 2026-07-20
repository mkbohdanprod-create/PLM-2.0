const { Client } = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  console.log('--- Running reset_test_data ---');
  try {
    await client.query(`
BEGIN;

-- TRUNCATE TABLE public.audit_logs; -- LEAVING AUDIT LOGS FOR WAVE 8 HISTORY

TRUNCATE TABLE 
  public.webhook_events,
  public.order_status_history,
  public.engineering_tasks,
  public.delivery_tasks,
  public.measurement_tasks,
  public.order_activities,
  public.order_specifications,
  public.order_addresses,
  public.order_contacts,
  public.orders 
CASCADE;

COMMIT;
    `);
    const c = await client.query('SELECT count(*) FROM orders');
    console.log('Orders count:', c.rows[0].count);
  } catch(e) { console.error('Reset Error:', e.message); }
  await client.end();
}
run();
