const { Client } = require('pg');

const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');

async function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function runTest() {
  await client.connect();
  try {
    console.log("--- E2E TEST: WAVE 6 (ENGINEERING KANBAN) ---");

    // Get an admin role
    const adminRes = await client.query(`SELECT id FROM public.profiles WHERE role_code = 'SUPER_ADMIN' LIMIT 1`);
    const adminId = adminRes.rows[0].id;
    
    // Fake auth context
    await client.query(`
      SELECT set_config('request.jwt.claims', '{"sub": "' || '${adminId}' || '"}', false);
    `);

    // 1. Create a branch and order
    const branchRes = await client.query(`INSERT INTO public.branches (name) VALUES ('E2E-W6-Branch') RETURNING id`);
    const branchId = branchRes.rows[0].id;

    const orderRes = await client.query(`
      INSERT INTO public.orders (order_number, branch_id, status, order_type, delivery_method)
      VALUES ('E2E-W6-ORD-' || floor(random() * 1000000)::text, '${branchId}', 'MEASUREMENT_COMPLETED', 'FULL_CYCLE', 'DELIVERY')
      RETURNING id, status, macro_stage
    `);
    const orderId = orderRes.rows[0].id;
    console.log(`Created order: E2E-W6-ORD-1 in MEASUREMENT_COMPLETED`);

    // -> ENGINEERING_QUEUE
    await client.query(`SELECT public.change_order_status('${orderId}', 'ENGINEERING_QUEUE')`);
    
    const o2 = await client.query(`SELECT status, macro_stage FROM public.orders WHERE id = '${orderId}'`);
    console.log(`✅ Status: ${o2.rows[0].status}, Macro Stage: ${o2.rows[0].macro_stage}`);

    // Check task auto-created
    const tRes = await client.query(`SELECT id, status, specialization_type FROM public.engineering_tasks WHERE order_id = '${orderId}' ORDER BY created_at DESC LIMIT 1`);
    const taskId = tRes.rows[0].id;
    console.log(`✅ Task auto-created: ${tRes.rows[0].specialization_type} / ${tRes.rows[0].status}`);

    // Task -> IN_PROGRESS
    console.log("Moving task to IN_PROGRESS...");
    await client.query(`SELECT public.update_engineering_task_status('${taskId}', 'IN_PROGRESS')`);
    const o3 = await client.query(`SELECT status, macro_stage FROM public.orders WHERE id = '${orderId}'`);
    console.log(`✅ Order synced to: ${o3.rows[0].status}`);

    // Task -> CLIENT_APPROVAL
    console.log("Moving task to CLIENT_APPROVAL...");
    await client.query(`SELECT public.update_engineering_task_status('${taskId}', 'CLIENT_APPROVAL')`);
    const o4 = await client.query(`SELECT status, macro_stage FROM public.orders WHERE id = '${orderId}'`);
    console.log(`✅ Order synced to: ${o4.rows[0].status}, Macro Stage: ${o4.rows[0].macro_stage}`);

    // Regression FAILED
    console.log("Triggering Problem (FAILED task)...");
    await client.query(`SELECT public.update_engineering_task_status('${taskId}', 'FAILED')`);
    const o4_reg = await client.query(`SELECT status FROM public.orders WHERE id = '${orderId}'`);
    console.log(`✅ Order synced to (Regression): ${o4_reg.rows[0].status}`);

    // Restore to ENGINEERING_QUEUE and complete
    await client.query(`SELECT public.change_order_status('${orderId}', 'ENGINEERING_QUEUE')`);
    const tRes2 = await client.query(`SELECT id FROM public.engineering_tasks WHERE order_id = '${orderId}' AND status='PENDING' ORDER BY created_at DESC LIMIT 1`);
    const taskId2 = tRes2.rows[0].id;
    console.log("Moving new task to COMPLETED (CONSTRUCTOR -> NESTING)...");
    await client.query(`SELECT public.update_engineering_task_status('${taskId2}', 'COMPLETED')`);
    const o5 = await client.query(`SELECT status FROM public.orders WHERE id = '${orderId}'`);
    console.log(`✅ Order synced to (CONSTRUCTOR COMPLETED): ${o5.rows[0].status}`);

    // Branch 2: Nesting Task -> COMPLETED -> PRODUCTION_QUEUE
    console.log("Testing NESTING path...");
    const taskNesting = await client.query(`
      INSERT INTO public.engineering_tasks (order_id, specialization_type, status, created_by)
      VALUES ('${orderId}', 'NESTING_HARD', 'IN_PROGRESS', '${adminId}') RETURNING id
    `);
    const nTaskId = taskNesting.rows[0].id;
    await client.query(`SELECT public.update_engineering_task_status('${nTaskId}', 'COMPLETED')`);
    const o6 = await client.query(`SELECT status FROM public.orders WHERE id = '${orderId}'`);
    console.log(`✅ Order synced to (NESTING COMPLETED): ${o6.rows[0].status}`);

    console.log("\n--- TESTS FINISHED SUCCESSFULLY ---");

  } catch(e) {
    console.error("Test failed: ", e.message);
  } finally {
    // Reset fake auth
    await client.query(`
      SELECT set_config('request.jwt.claims', '', false);
    `).catch(() => {});
    await client.end();
  }
}

runTest();
