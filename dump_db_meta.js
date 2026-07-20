const { Client } = require('pg');
const fs = require('fs');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  let dump = "";

  // 1. All actual statuses
  const statusRes = await client.query("SELECT DISTINCT from_status as status FROM status_transitions UNION SELECT DISTINCT to_status FROM status_transitions ORDER BY status");
  dump += "--- ACTUAL STATUSES IN DB ---\n";
  dump += statusRes.rows.map(r => r.status).join(', ') + "\n\n";

  // 2. Macro stage expression (computed column or function)
  dump += "--- MACRO STAGE LOGIC ---\n";
  const stageRes = await client.query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'macro_stage'");
  if (stageRes.rows.length > 0) dump += stageRes.rows[0].def + "\n\n";
  
  // 3. Tables & Columns
  dump += "--- TABLES & COLUMNS ---\n";
  const tables = ['orders', 'profiles', 'order_status_history', 'engineering_tasks', 'measurement_tasks', 'delivery_tasks', 'order_activities', 'status_transitions'];
  for (let t of tables) {
    const cols = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${t}'`);
    dump += `Table: ${t}\n` + cols.rows.map(c => `  ${c.column_name}: ${c.data_type}`).join('\n') + "\n\n";
  }

  // 4. RPCs
  dump += "--- RPCs ---\n";
  const rpcs = await client.query(`SELECT proname, pg_get_function_arguments(pg_proc.oid) as args FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE nspname = 'public'`);
  dump += rpcs.rows.map(r => `${r.proname}(${r.args})`).join('\n') + "\n\n";
  
  // 5. Triggers
  dump += "--- TRIGGERS ---\n";
  const trigs = await client.query(`SELECT trigger_name, event_manipulation, event_object_table, action_statement FROM information_schema.triggers WHERE trigger_schema = 'public'`);
  dump += trigs.rows.map(r => `${r.trigger_name} ON ${r.event_object_table} (${r.event_manipulation}) -> ${r.action_statement}`).join('\n') + "\n\n";

  fs.writeFileSync('c:/hhgh/PLM module/db_dump.txt', dump);
  console.log('Saved db_dump.txt');
  await client.end();
}
run();
