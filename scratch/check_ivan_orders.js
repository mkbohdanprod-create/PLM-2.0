const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  await client.connect();
  
  const res = await client.query(`
    SELECT t.id, t.measurer_id, t.scheduled_date, t.start_time, t.outcome, p.full_name, o.order_number, o.status, a.city
    FROM measurement_tasks t
    LEFT JOIN profiles p ON p.id = t.measurer_id
    LEFT JOIN orders o ON o.id = t.order_id
    LEFT JOIN order_addresses a ON a.order_id = o.id
    WHERE p.full_name ILIKE '%Іван%'
    AND t.scheduled_date IN ('2026-07-07', '2026-07-08')
    AND t.outcome IN ('SCHEDULED', 'IN_PROGRESS')
  `);
  
  console.log('Ivan active tasks:', JSON.stringify(res.rows, null, 2));

  await client.end();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
