const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:54322/postgres' });
client.connect().then(() => 
  client.query("SELECT proname, proargnames FROM pg_proc WHERE proname = 'complete_activity'")
).then(res => { 
  console.log(res.rows);
  return client.query("NOTIFY pgrst, 'reload schema'");
}).then(() => {
  console.log("Schema reloaded");
  process.exit(0); 
}).catch(e => { 
  console.error(e); 
  process.exit(1); 
});
