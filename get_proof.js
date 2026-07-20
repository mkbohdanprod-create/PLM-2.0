const { Client } = require('pg');

const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });

async function getProof() {
  await client.connect();
  let res = await client.query(`
    SELECT pg_get_functiondef(oid) as def 
    FROM pg_proc 
    WHERE proname = 'change_order_status' AND pg_get_function_arguments(oid) LIKE '%p_reason text DEFAULT NULL%';
  `);
  let lines = res.rows[0].def.split('\\n');
  console.log("3. change_order_status logic (orphan fallback):");
  // find lines around "now() + interval '3 days'"
  let idx = lines.findIndex(l => l.includes("interval '3 days'"));
  if (idx !== -1) {
    console.log(lines.slice(idx - 3, idx + 4).join('\\n'));
  }
  await client.end();
}
getProof().catch(console.error);
