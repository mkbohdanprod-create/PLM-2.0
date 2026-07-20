const { Client } = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  try {
    const res = await client.query(`SELECT generation_expression FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'macro_stage'`);
    console.log(res.rows[0].generation_expression);
  } finally {
    await client.end();
  }
}
run();
