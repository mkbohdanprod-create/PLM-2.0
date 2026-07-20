const { Client } = require('pg');
const fs = require('fs');

const connectionString = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  
  let orderId;
  const existing = await client.query(`SELECT id FROM orders WHERE order_number='TEST-B3'`);
  if (existing.rows.length > 0) {
    orderId = existing.rows[0].id;
  } else {
    const setupRes = await client.query(`
      INSERT INTO orders (order_number, branch_id, order_type, status) 
      VALUES ('TEST-B3', (SELECT id FROM branches LIMIT 1), 'FULL_CYCLE', 'MEASUREMENT_SCHEDULED') 
      RETURNING id;
    `);
    orderId = setupRes.rows[0].id;
  }
  
  let taskId;
  const existingTask = await client.query(`SELECT id FROM measurement_tasks WHERE order_id='${orderId}'`);
  if (existingTask.rows.length > 0) {
    taskId = existingTask.rows[0].id;
  } else {
    const taskRes = await client.query(`INSERT INTO measurement_tasks (order_id, scheduled_date, start_time, end_time, outcome) VALUES ('${orderId}', CURRENT_DATE, '09:00', '10:00', 'SCHEDULED') RETURNING id;`);
    taskId = taskRes.rows[0].id;
  }
  
  fs.writeFileSync('b3_task_id.txt', taskId);
  fs.writeFileSync('b3_order_id.txt', orderId);

  await client.end();
}

run().catch(console.error);
