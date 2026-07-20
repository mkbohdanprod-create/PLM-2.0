const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
async function run() {
  await client.connect();
  let res = await client.query(`SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'measurement_tasks_outcome_check';`);
  console.log('B2 Constraint:', res.rows[0]?.pg_get_constraintdef);
  res = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name='order_status_history';`);
  console.log('C1 Columns:', res.rows.map(r=>r.column_name).join(', '));
  await client.end();
}
run().catch(console.error);
