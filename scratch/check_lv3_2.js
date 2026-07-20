const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  await client.connect();
  
  const res = await client.query(`
    SELECT id, scheduled_date, start_time, outcome
    FROM measurement_tasks
    WHERE id = '300b2a3c-f6bb-42b1-9a00-bcf59da35a39'
  `);
  
  console.log('Task 2:', JSON.stringify(res.rows, null, 2));

  await client.end();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
