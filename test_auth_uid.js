const { Client } = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT set_config('request.jwt.claims', '{"sub": "123e4567-e89b-12d3-a456-426614174000"}', true);
    SELECT auth.uid();
  `);
  console.log(res[1].rows[0]);
  await client.end();
}
run();
