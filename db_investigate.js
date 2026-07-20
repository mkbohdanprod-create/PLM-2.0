const { Client } = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');

async function run() {
  await client.connect();
  
  // 1. orders schema
  const orders = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'orders'");
  console.log('\\n--- orders columns ---');
  orders.rows.forEach(r => console.log(r.column_name + ' | ' + r.data_type));
  
  // 2. status 
  const status = await client.query("SELECT DISTINCT status FROM orders");
  console.log('\\n--- distinct statuses ---');
  console.log(status.rows.map(r => r.status).join(', '));
  
  // 3. order_specifications schema
  const spec = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'order_specifications'");
  console.log('\\n--- order_specifications columns ---');
  spec.rows.forEach(r => console.log(r.column_name + ' | ' + r.data_type));
  
  // 4. webhook_events schema
  const webhooks = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'webhook_events'");
  console.log('\\n--- webhook_events columns ---');
  webhooks.rows.forEach(r => console.log(r.column_name + ' | ' + r.data_type));
  
  // 5. related tables
  const related = await client.query("SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'order_%'");
  console.log('\\n--- related order tables ---');
  console.log(related.rows.map(r => r.table_name).join(', '));
  
  await client.end();
}
run();
