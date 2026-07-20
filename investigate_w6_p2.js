const { Client } = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function investigate2() {
  await client.connect();
  try {
    console.log("=== 1. order_status enum & current status ===");
    // Wait, is it an enum or text?
    const tRes = await client.query("SELECT data_type FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'status'");
    console.log("Status column type:", tRes.rows[0]?.data_type);
    
    if (tRes.rows[0]?.data_type === 'USER-DEFINED') {
      const enumRes = await client.query("SELECT enum_range(NULL::order_status)");
      console.log("Enum range:", enumRes.rows[0]?.enum_range);
    } else {
      console.log("Status is just text, checking table constraints:");
      const cRes = await client.query("SELECT pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid = 'orders'::regclass AND conname LIKE '%status%'");
      cRes.rows.forEach(r => console.log(r.def));
    }
    
    const sRes = await client.query("SELECT DISTINCT status FROM orders WHERE status LIKE 'ENGINEERING%'");
    console.log("Current ENGINEERING statuses in DB:", sRes.rows.map(r => r.status));

    console.log("\n=== 2. materials table ===");
    const mRes = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'materials'");
    if(mRes.rows.length) {
      console.table(mRes.rows);
      const catRes = await client.query("SELECT DISTINCT category FROM materials");
      console.log("Material categories:", catRes.rows.map(r => r.category));
    } else {
      console.log("Table 'materials' DOES NOT EXIST.");
    }

  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
investigate2();
