const { Client } = require('pg');

const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });

async function getProofs() {
  await client.connect();
  try {
    console.log("=== 1. TABLES ===");
    console.log("\\n--- vehicles ---");
    let res = await client.query("SELECT column_name, data_type, character_maximum_length, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'vehicles'");
    console.table(res.rows);

    console.log("\\n--- delivery_tasks ---");
    res = await client.query("SELECT column_name, data_type, character_maximum_length, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'delivery_tasks'");
    console.table(res.rows);

    console.log("\\n=== 2. ORDERS (delivery_method & macro_stage) ===");
    res = await client.query("SELECT column_name, data_type, generation_expression FROM information_schema.columns WHERE table_name = 'orders' AND column_name IN ('delivery_method', 'macro_stage')");
    console.table(res.rows);

    res = await client.query("SELECT pg_get_constraintdef(oid) as check_constraint FROM pg_constraint WHERE conrelid = 'orders'::regclass AND conname LIKE '%delivery_method%'");
    if(res.rows.length) console.log("Check constraint: ", res.rows[0].check_constraint);

    console.log("\\n=== 3. order_type & macro_stage ===");
    res = await client.query("SELECT DISTINCT order_type FROM orders");
    console.log("Distinct order_type values:", res.rows.map(r => r.order_type));
    
    res = await client.query("SELECT DISTINCT status, macro_stage FROM orders WHERE status LIKE 'DELIVERY%' OR status='READY_FOR_PICKUP'");
    console.table(res.rows);

    console.log("\\n=== 4. RPC Signatures ===");
    res = await client.query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'assign_delivery'");
    if(res.rows.length) console.log(res.rows[0].def);

    res = await client.query("SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'create_vehicle'");
    if(res.rows.length) console.log(res.rows[0].def);

    console.log("\\n=== 5. RLS Policies ===");
    res = await client.query("SELECT policyname, cmd, qual FROM pg_policies WHERE tablename IN ('delivery_tasks', 'vehicles')");
    console.table(res.rows);

    console.log("\\n=== 6. E2E OUT ===");
    // Will run E2E separately or just print the previous E2E output.

    console.log("\\n=== 7. RPCS EXIST ===");
    res = await client.query("SELECT proname FROM pg_proc WHERE proname IN ('assign_delivery','create_vehicle','unassign_delivery','hide_vehicle')");
    console.table(res.rows);

  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

getProofs();
