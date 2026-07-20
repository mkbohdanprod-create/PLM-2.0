const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  await client.connect();
  
  const res = await client.query(`
    SELECT t.id, o.order_number, a.city, a.street, a.building
    FROM measurement_tasks t
    LEFT JOIN orders o ON o.id = t.order_id
    LEFT JOIN order_addresses a ON a.order_id = o.id
    WHERE o.order_number = 'TEST-LV3'
  `);
  
  console.log('TEST-LV3 order address:', JSON.stringify(res.rows, null, 2));

  await client.end();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
