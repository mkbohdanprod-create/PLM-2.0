const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  await client.connect();
  
  const res = await client.query(`
    SELECT t.id, t.measurer_id, t.scheduled_date, t.start_time, t.outcome, o.order_number, o.status, o.resume_date
    FROM measurement_tasks t
    JOIN orders o ON o.id = t.order_id
    WHERE o.order_number = '77-100004'
  `);
  
  console.log('Task for 77-100004:', JSON.stringify(res.rows, null, 2));

  await client.end();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
