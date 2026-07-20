const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  await client.connect();
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260708100000_departure_points.sql'), 'utf8');
  await client.query(sql);
  console.log('Migration applied successfully');
  await client.end();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
