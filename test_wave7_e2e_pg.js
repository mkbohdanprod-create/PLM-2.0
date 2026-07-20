const { Client } = require('pg');

async function testReclamations() {
  const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
  await client.connect();

  try {
    // 1. Створюємо базове замовлення
    console.log('\n--- 1. Creating Parent Order ---');
    await client.query("SELECT set_config('role', 'authenticated', false)");
    await client.query("SELECT set_config('request.jwt.claims', '{\"role\":\"authenticated\",\"email\":\"dispatcher@test.com\",\"sub\":\"00000000-0000-0000-0000-000000000001\"}', false)");
    
    // Simulate SUPER_ADMIN to avoid transition blocks in tests
    await client.query(`
      UPDATE public.profiles 
      SET role_code = 'SUPER_ADMIN' 
      WHERE id = '00000000-0000-0000-0000-000000000001'
    `);

    // Create branch and order
    const branchRes = await client.query("INSERT INTO branches (name) VALUES ('Test Branch 7') RETURNING id");
    const branchId = branchRes.rows[0].id;

    const rnd = Math.floor(Math.random() * 100000);
    const orderRes = await client.query(`
      INSERT INTO public.orders (order_number, branch_id, status, order_type)
      VALUES ('TEST-7-' || $2, $1, 'MEASUREMENT_SCHEDULING', 'FULL_CYCLE')
      RETURNING id as order_id
    `, [branchId, rnd]);
    const parentId = orderRes.rows[0].order_id;
    console.log(`Parent Order created: ${parentId}`);

    // Progress to INSTALLATION_IN_PROGRESS
    await client.query("SELECT public.change_order_status($1, 'MEASUREMENT_SCHEDULING')", [parentId]);
    await client.query("SELECT public.change_order_status($1, 'MEASUREMENT_COMPLETED')", [parentId]);
    await client.query("SELECT public.change_order_status($1, 'ENGINEERING_QUEUE')", [parentId]);
    await client.query("SELECT public.change_order_status($1, 'ENGINEERING_IN_PROGRESS')", [parentId]);
    await client.query("SELECT public.change_order_status($1, 'ENGINEERING_NESTING')", [parentId]);
    await client.query("SELECT public.change_order_status($1, 'PRODUCTION_QUEUE')", [parentId]);
    await client.query("SELECT public.change_order_status($1, 'IN_PRODUCTION')", [parentId]);
    await client.query("SELECT public.change_order_status($1, 'PRODUCTION_COMPLETED')", [parentId]);
    // -> DELIVERY_SCHEDULING
    await client.query("SELECT public.change_order_status($1, 'DELIVERY_IN_TRANSIT')", [parentId]);
    // -> INSTALLATION_SCHEDULING
    await client.query("SELECT public.change_order_status($1, 'INSTALLATION_IN_PROGRESS')", [parentId]);

    // Check status
    let statusRes = await client.query("SELECT status, is_reclamation_frozen FROM orders WHERE id = $1", [parentId]);
    console.log(`Parent Status: ${statusRes.rows[0].status}, Frozen: ${statusRes.rows[0].is_reclamation_frozen}`);

    // 2. Test AppSheet Reclamation (Installation)
    console.log('\n--- 2. AppSheet Reclamation (INSTALLATION) ---');
    const child1Res = await client.query(`
      SELECT public.create_reclamation(
        $1, 'Broken part', 'INSTALLATION', 'PRODUCTION_QUEUE', 'AppSheet', gen_random_uuid()
      ) as new_id
    `, [parentId]);
    const child1Id = child1Res.rows[0].new_id;
    
    statusRes = await client.query("SELECT status, is_reclamation_frozen, order_number FROM orders WHERE id = $1", [parentId]);
    console.log(`Parent Status after reclamation: ${statusRes.rows[0].status}, Frozen: ${statusRes.rows[0].is_reclamation_frozen}`);
    
    let child1Status = await client.query("SELECT order_number, status, parent_order_id FROM orders WHERE id = $1", [child1Id]);
    console.log(`Child1 Created: ${child1Status.rows[0].order_number}, Status: ${child1Status.rows[0].status}`);

    // Try to close parent (expect error)
    console.log('\n--- 3. Attempt to close frozen parent ---');
    try {
      await client.query("SELECT public.change_order_status($1, 'COMPLETED')", [parentId]);
      console.log('FAIL: Closed frozen parent');
    } catch (e) {
      console.log('SUCCESS: Prevented closing frozen parent -> ' + e.message);
    }

    // 4. Complete child -> auto-unfreeze parent
    console.log('\n--- 4. Complete Child -> Unfreeze Parent ---');
    await client.query("SELECT public.change_order_status($1, 'IN_PRODUCTION')", [child1Id]);
    await client.query("SELECT public.change_order_status($1, 'PRODUCTION_COMPLETED')", [child1Id]);
    await client.query("SELECT public.change_order_status($1, 'DELIVERY_IN_TRANSIT')", [child1Id]);
    await client.query("SELECT public.change_order_status($1, 'INSTALLATION_SCHEDULING')", [child1Id]);
    await client.query("SELECT public.change_order_status($1, 'COMPLETED')", [child1Id]);

    statusRes = await client.query("SELECT status, is_reclamation_frozen FROM orders WHERE id = $1", [parentId]);
    console.log(`Parent Status after child completes: ${statusRes.rows[0].status}, Frozen: ${statusRes.rows[0].is_reclamation_frozen}`);

    // 5. Test MES Reclamation (Production)
    console.log('\n--- 5. MES Reclamation (PRODUCTION_DEFECT) ---');
    // First, push parent back to IN_PRODUCTION for testing
    // RLS prevents direct UPDATE of status, so use RPC
    // Wait, going backward in change_order_status is not allowed unless it's a specific transition or we're SUPER_ADMIN.
    // Our role is SUPER_ADMIN in the test so it shouldn't be blocked by transitions if we add it, but it's not a valid transition.
    // Let's just create a SECOND parent order for the MES test to keep things clean.
    const rnd2 = Math.floor(Math.random() * 100000);
    const order2Res = await client.query(`
      INSERT INTO public.orders (order_number, branch_id, status, order_type)
      VALUES ('TEST-7-' || $2, $1, 'MEASUREMENT_SCHEDULING', 'FULL_CYCLE')
      RETURNING id as order_id
    `, [branchId, rnd2]);
    const parent2Id = order2Res.rows[0].order_id;
    console.log(`Parent 2 Order created: ${parent2Id}`);
    
    await client.query("SELECT public.change_order_status($1, 'MEASUREMENT_COMPLETED')", [parent2Id]);
    await client.query("SELECT public.change_order_status($1, 'ENGINEERING_QUEUE')", [parent2Id]);
    await client.query("SELECT public.change_order_status($1, 'ENGINEERING_IN_PROGRESS')", [parent2Id]);
    await client.query("SELECT public.change_order_status($1, 'ENGINEERING_NESTING')", [parent2Id]);
    await client.query("SELECT public.change_order_status($1, 'PRODUCTION_QUEUE')", [parent2Id]);
    await client.query("SELECT public.change_order_status($1, 'IN_PRODUCTION')", [parent2Id]);
    
    const child2Res = await client.query(`
      SELECT public.create_reclamation(
        $1, 'Scratched panel', 'PRODUCTION_DEFECT', 'ENGINEERING_QUEUE', 'MES', gen_random_uuid()
      ) as new_id
    `, [parent2Id]);
    const child2Id = child2Res.rows[0].new_id;
    
    statusRes = await client.query("SELECT status, is_reclamation_frozen, order_number FROM orders WHERE id = $1", [parent2Id]);
    console.log(`Parent 2 Status after MES reclamation: ${statusRes.rows[0].status}, Frozen: ${statusRes.rows[0].is_reclamation_frozen}`);
    
    let child2Status = await client.query("SELECT order_number, status, parent_order_id FROM orders WHERE id = $1", [child2Id]);
    console.log(`Child2 Created: ${child2Status.rows[0].order_number}, Status: ${child2Status.rows[0].status}`);

    // 6. Idempotency Test
    console.log('\n--- 6. Idempotency Test ---');
    const idemKey = '3a5b6f00-3490-4c28-be90-9f5b6f003490';
    await client.query(`
      SELECT public.create_reclamation(
        $1, 'Duplicate 1', 'INSTALLATION', 'ENGINEERING_QUEUE', 'UI', $2
      )
    `, [parent2Id, idemKey]);
    
    // Call again with same key
    const duplicateRes = await client.query(`
      SELECT public.create_reclamation(
        $1, 'Duplicate 2', 'INSTALLATION', 'ENGINEERING_QUEUE', 'UI', $2
      ) as res
    `, [parent2Id, idemKey]);
    console.log(`Second call with same key returned: ${duplicateRes.rows[0].res}`);

    // 7. Recursion Test: Reclaim a child
    console.log('\n--- 7. Recursion Test (Child on Child) ---');
    try {
      await client.query(`
        SELECT public.create_reclamation(
          $1, 'Reclaim the child', 'PRODUCTION_DEFECT', 'ENGINEERING_QUEUE', 'UI', gen_random_uuid()
        )
      `, [child2Id]);
      console.log('FAIL: Created reclamation on a child');
    } catch(e) {
      console.log('SUCCESS: Blocked reclamation on a child -> ' + e.message);
    }

    // 8. Multiple Reclamations on same parent (R2)
    console.log('\n--- 8. Multiple Reclamations Test (-R2) ---');
    const r2Res = await client.query(`
      SELECT public.create_reclamation(
        $1, 'Second reclamation', 'PRODUCTION_DEFECT', 'ENGINEERING_QUEUE', 'UI', gen_random_uuid()
      ) as new_id
    `, [parent2Id]);
    const r2Id = r2Res.rows[0].new_id;
    let r2Status = await client.query("SELECT order_number, status, parent_order_id FROM orders WHERE id = $1", [r2Id]);
    console.log(`Child3 Created: ${r2Status.rows[0].order_number}, Status: ${r2Status.rows[0].status}`);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

testReclamations();
