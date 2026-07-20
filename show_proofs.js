const { Client } = require('pg');

const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });

async function showProofs() {
  await client.connect();

  console.log("--- Proof 1: orders.resume_date ---");
  let res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name='orders' AND column_name='resume_date';
  `);
  if (res.rows.length > 0) {
    console.log(JSON.stringify(res.rows, null, 2));
  } else {
    console.log("resume_date DOES NOT EXIST in orders.");
  }
  
  console.log("\\n--- Proof 2: installation_tasks table ---");
  res = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_name='installation_tasks';
  `);
  if (res.rows.length > 0) {
    console.log("Table exists:");
    console.log(JSON.stringify(res.rows, null, 2));
  } else {
    console.log("installation_tasks DOES NOT EXIST.");
  }

  await client.end();
}

showProofs().catch(console.error);
