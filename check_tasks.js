import pkg from 'pg';
const { Client } = pkg;
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  const tasks = await client.query("SELECT id, order_id, scheduled_date, start_time FROM measurement_tasks WHERE order_id = 'd8fe5bb5-fce2-409b-8e3c-25e94b6d44d0';");
  console.log('Measurement Tasks:', tasks.rows);
  const acts = await client.query("SELECT id, order_id, planned_at, status, title FROM order_activities WHERE order_id = 'd8fe5bb5-fce2-409b-8e3c-25e94b6d44d0';");
  console.log('Activities:', acts.rows);
  await client.end();
}
run();
