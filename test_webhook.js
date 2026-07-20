const { Client } = require('pg');
const fs = require('fs');

const connectionString = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  
  let output = '\n## B3. Webhook ідемпотентність\n\n';
  
  // Setup
  const setupRes = await client.query(`
    INSERT INTO orders (order_number, branch_id, order_type, status) 
    VALUES ('TEST-B3', (SELECT id FROM branches LIMIT 1), 'FULL_CYCLE', 'MEASUREMENT_SCHEDULED') 
    RETURNING id;
  `);
  const orderId = setupRes.rows[0].id;
  const taskRes = await client.query(`INSERT INTO measurement_tasks (order_id, scheduled_date, start_time, end_time, outcome) VALUES ('${orderId}', CURRENT_DATE, '09:00', '10:00', 'SCHEDULED') RETURNING id;`);
  const taskId = taskRes.rows[0].id;

  // Webhook calls
  const url = "http://127.0.0.1:54321/functions/v1/appsheet-webhook";
  const idempotency_key = "550e8400-e29b-41d4-a716-446655440000";
  const body = {
    idempotency_key,
    task_id: taskId,
    new_status: "MEASUREMENT_IN_PROGRESS",
    comment: "webhook test"
  };
  
  output += `**First request:**\n`;
  let req = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  output += `Status: ${req.status}, Response: ${await req.text()}\n\n`;

  output += `**Second request (idempotent):**\n`;
  req = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  output += `Status: ${req.status}, Response: ${await req.text()}\n\n`;

  // DB verification
  output += `**Query (webhook_events count):**\n`;
  let res = await client.query(`SELECT count(*) FROM webhook_events WHERE idempotency_key='${idempotency_key}';`);
  output += `\`\`\`json\n${JSON.stringify(res.rows, null, 2)}\n\`\`\`\n\n`;

  output += `**Query (order_status_history count):**\n`;
  res = await client.query(`SELECT count(*) FROM order_status_history WHERE order_id='${orderId}' AND to_status='MEASUREMENT_IN_PROGRESS';`);
  output += `\`\`\`json\n${JSON.stringify(res.rows, null, 2)}\n\`\`\`\n\n`;

  // B4
  output += `## B4. source='AppSheet' в audit_log\n\n`;
  output += `**Query:**\n`;
  res = await client.query(`SELECT source, action FROM audit_logs WHERE record_id='${orderId}' ORDER BY changed_at DESC LIMIT 1;`);
  output += `\`\`\`json\n${JSON.stringify(res.rows, null, 2)}\n\`\`\`\n\n`;

  fs.appendFileSync('WAVE_3_VERIFICATION.md', output);

  await client.end();
  console.log("Finished B3 and B4");
}
run().catch(console.error);
