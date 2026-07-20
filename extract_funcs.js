const { Client } = require('pg');
const fs = require('fs');

const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });

async function run() {
  await client.connect();
  let res = await client.query(`
    SELECT pg_get_functiondef(oid) as def, oid::regprocedure as drop_sig 
    FROM pg_proc 
    WHERE proname IN ('create_order', 'change_order_status');
  `);
  
  let out = '';
  for(let row of res.rows) {
    out += `-- DROP FUNCTION IF EXISTS ${row.drop_sig};\n`;
    out += row.def + ';\n\n';
  }
  
  fs.writeFileSync('wave4_base_funcs.sql', out);
  console.log('Saved to wave4_base_funcs.sql');
  await client.end();
}
run().catch(console.error);
