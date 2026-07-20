const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  await client.connect();
  
  const res = await client.query(`
    SELECT o.order_number, a.city, a.lat, a.lng
    FROM orders o
    JOIN order_addresses a ON a.order_id = o.id
    WHERE a.lng::numeric > 32
  `);
  
  console.log('East orders:', JSON.stringify(res.rows, null, 2));

  await client.end();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
