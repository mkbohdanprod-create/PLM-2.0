const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  await client.connect();
  
  const res = await client.query(`
    SELECT t.id, t.measurer_id, t.scheduled_date, t.start_time, t.outcome, o.order_number, a.city, a.lat, a.lng
    FROM measurement_tasks t
    JOIN profiles p ON p.id = t.measurer_id
    JOIN orders o ON o.id = t.order_id
    LEFT JOIN order_addresses a ON a.order_id = o.id
    WHERE p.full_name ILIKE '%Іван%'
    ORDER BY t.scheduled_date, t.start_time
  `);
  
  console.log('All Ivan Tasks:', JSON.stringify(res.rows, null, 2));

  await client.end();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
