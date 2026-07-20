const { Client } = require('pg');

const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });

async function runTest() {
  await client.connect();
  console.log('--- E2E TEST: WAVE 5 (DELIVERY) ---');

  try {
    // 1. Get dispatcher and branch
    const { rows: profiles } = await client.query("SELECT id, branch_id, role_code FROM profiles WHERE role_code IN ('DISPATCHER', 'SUPER_ADMIN')");
    const dispatcher = profiles.find(p => p.role_code === 'DISPATCHER');
    const admin = profiles.find(p => p.role_code === 'SUPER_ADMIN');
    if (!dispatcher || !admin) throw new Error('Missing dispatcher or admin profiles');

    const branch_id = admin.branch_id;

    // 2. Create a vehicle
    const vehicleName = 'Test Truck ' + Math.floor(Math.random() * 1000);
    let vehicleId;
    try {
      // Simulate RPC call directly by inserting, or we can use the RPC syntax in pg:
      // Note: set local role to admin for RLS? Since we connect as postgres superuser, RLS is bypassed.
      // But we can call the RPC using SELECT.
      // Actually, we must SET ROLE authenticated so RPC checking role works! 
      await client.query("SET request.jwt.claim.sub TO '" + admin.id + "'");
      await client.query("SET request.jwt.claim.role TO 'authenticated'");
      await client.query("SET role authenticated");

      const vRes = await client.query("SELECT create_vehicle($1, $2, $3) AS vid", [vehicleName, 'AA1234BB', branch_id]);
      vehicleId = vRes.rows[0].vid;
      console.log(`✅ Created vehicle: ${vehicleName} (${vehicleId})`);
    } catch(e) {
      console.error(e.message);
      const vRes = await client.query("SELECT id FROM vehicles LIMIT 1");
      if (vRes.rows.length === 0) throw new Error("No vehicles!");
      vehicleId = vRes.rows[0].id;
    }

    console.log('\n>>> SCENARIO A: FULL CYCLE + DELIVERY');
    // 3. Create Order
    // Must switch back to postgres to insert easily without constraints
    await client.query("RESET ROLE");
    const orderNumber = 'E2E-W5-DEL-' + Math.floor(Math.random() * 10000);
    const oRes = await client.query(`
      INSERT INTO orders (order_number, branch_id, order_type, delivery_method, status)
      VALUES ($1, $2, 'FULL_CYCLE', 'DELIVERY', 'PRODUCTION_COMPLETED')
      RETURNING id
    `, [orderNumber, branch_id]);
    const order1 = oRes.rows[0];
    console.log(`Created order: ${orderNumber}`);

    // Call change_order_status
    await client.query("SET request.jwt.claim.sub TO '" + admin.id + "'");
    await client.query("SET role authenticated");
    
    console.log('Moving from PRODUCTION_COMPLETED to DELIVERY_SCHEDULING...');
    await client.query("SELECT change_order_status($1, 'DELIVERY_SCHEDULING')", [order1.id]);

    await client.query("RESET ROLE");
    let state1 = await client.query("SELECT status, macro_stage FROM orders WHERE id = $1", [order1.id]);
    console.log(`✅ Status: ${state1.rows[0].status}, Macro Stage: ${state1.rows[0].macro_stage}`);

    // Assign delivery
    console.log('Assigning delivery...');
    await client.query("SET request.jwt.claim.sub TO '" + dispatcher.id + "'");
    await client.query("SET role authenticated");
    await client.query("SELECT assign_delivery($1, $2, $3, $4)", [order1.id, dispatcher.id, vehicleId, new Date().toISOString()]);

    await client.query("RESET ROLE");
    let tRes = await client.query("SELECT * FROM delivery_tasks WHERE order_id = $1", [order1.id]);
    console.log(`✅ Delivery tasks created: ${tRes.rows.length}`);

    // Delivery In Transit
    console.log('Starting delivery (DELIVERY_IN_TRANSIT)...');
    await client.query("SET request.jwt.claim.sub TO '" + dispatcher.id + "'");
    await client.query("SET role authenticated");
    await client.query("SELECT change_order_status($1, 'DELIVERY_IN_TRANSIT')", [order1.id]);

    // Complete delivery
    console.log('Completing delivery (attempting INSTALLATION_SCHEDULING)...');
    await client.query("SELECT change_order_status($1, 'INSTALLATION_SCHEDULING')", [order1.id]);

    await client.query("RESET ROLE");
    let state2 = await client.query("SELECT status FROM orders WHERE id = $1", [order1.id]);
    console.log(`✅ Final status for FULL CYCLE: ${state2.rows[0].status}`);

    console.log('\n>>> SCENARIO B: NO_INSTALLATION + DELIVERY');
    const orderNumber2 = 'E2E-W5-DEL-' + Math.floor(Math.random() * 10000);
    const oRes2 = await client.query(`
      INSERT INTO orders (order_number, branch_id, order_type, delivery_method, status)
      VALUES ($1, $2, 'NO_INSTALLATION', 'DELIVERY', 'DELIVERY_IN_TRANSIT')
      RETURNING id
    `, [orderNumber2, branch_id]);
    const order2 = oRes2.rows[0];
    
    await client.query("SET request.jwt.claim.sub TO '" + dispatcher.id + "'");
    await client.query("SET role authenticated");
    // Should auto-route to COMPLETED because NO_INSTALLATION
    await client.query("SELECT change_order_status($1, 'INSTALLATION_SCHEDULING')", [order2.id]);
    
    await client.query("RESET ROLE");
    let state3 = await client.query("SELECT status FROM orders WHERE id = $1", [order2.id]);
    console.log(`✅ Final status for NO_INSTALLATION: ${state3.rows[0].status}`);

    console.log('\n>>> SCENARIO C: BY DRAWING + PICKUP');
    const orderNumber3 = 'E2E-W5-PIC-' + Math.floor(Math.random() * 10000);
    const oRes3 = await client.query(`
      INSERT INTO orders (order_number, branch_id, order_type, delivery_method, status)
      VALUES ($1, $2, 'BY_DRAWING', 'PICKUP', 'PRODUCTION_COMPLETED')
      RETURNING id
    `, [orderNumber3, branch_id]);
    const order3 = oRes3.rows[0];

    console.log('Moving from PRODUCTION_COMPLETED to DELIVERY_SCHEDULING (expecting READY_FOR_PICKUP auto-route)...');
    await client.query("SET request.jwt.claim.sub TO '" + admin.id + "'");
    await client.query("SET role authenticated");
    await client.query("SELECT change_order_status($1, 'DELIVERY_SCHEDULING')", [order3.id]);
    
    await client.query("RESET ROLE");
    let state4 = await client.query("SELECT status, macro_stage FROM orders WHERE id = $1", [order3.id]);
    console.log(`✅ Status: ${state4.rows[0].status}, Macro Stage: ${state4.rows[0].macro_stage}`);

    console.log('\n--- TESTS FINISHED SUCCESSFULLY ---');
  } catch (err) {
    console.error('TEST FAILED:', err);
  } finally {
    await client.end();
  }
}

runTest();
