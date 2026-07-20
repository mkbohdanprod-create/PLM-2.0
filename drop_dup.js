const { Client } = require('pg');

const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });

async function fix() {
  await client.connect();
  await client.query(`DROP FUNCTION IF EXISTS public.create_order(text,uuid,text,text,text,text,text,text,text,numeric,boolean);`);
  console.log("Dropped 11-arg signature");
  await client.end();
}
fix().catch(console.error);
