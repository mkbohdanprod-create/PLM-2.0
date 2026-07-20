const { Client } = require('pg');

const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });

async function fixResumeDate() {
  await client.connect();

  let changeOrderRes = await client.query(`SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'change_order_status' AND pg_get_function_arguments(oid) LIKE '%p_reason text DEFAULT NULL%';`);
  let changeOrderDef = changeOrderRes.rows[0].def;
  
  // Add activity cancelling on RESUME
  changeOrderDef = changeOrderDef.replace(
    /v_target_status := COALESCE\(v_previous_status, CASE WHEN \(SELECT order_type FROM public\.orders WHERE id = p_order_id\) = 'BY_DRAWING' THEN 'ENGINEERING_DESIGN' ELSE 'MEASUREMENT_SCHEDULING' END\);/g,
    `v_target_status := COALESCE(v_previous_status, CASE WHEN (SELECT order_type FROM public.orders WHERE id = p_order_id) = 'BY_DRAWING' THEN 'ENGINEERING_DESIGN' ELSE 'MEASUREMENT_SCHEDULING' END);
    
    -- Закриваємо всі PENDING активності при виході з паузи
    UPDATE public.order_activities
    SET status = 'CANCELLED', outcome_notes = 'Відновлено з паузи', completed_at = now()
    WHERE order_id = p_order_id AND status = 'PENDING';`
  );
  
  await client.query(changeOrderDef);
  
  // Hack get_user_role
  let oldRoleDefRes = await client.query(`SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'get_user_role';`);
  let oldRoleDef = oldRoleDefRes.rows[0].def;
  await client.query(`CREATE OR REPLACE FUNCTION public.get_user_role() RETURNS text AS $$ SELECT 'SUPER_ADMIN'::text; $$ LANGUAGE sql;`);

  console.log("--- E2E DB Flow (Full Cycle) ---");
  let branchRes = await client.query('SELECT id FROM branches LIMIT 1');
  let valid_branch = branchRes.rows[0]?.id;

  let res = await client.query(`
    SELECT * FROM create_order('E2E-TEST-FINAL', $1, 'FULL_CYCLE', 'Test Flow Final', '380991234563', 'Kyiv', 'St', '1', 'PVC', 10, true, null, null, null, null, null, null);
  `, [valid_branch]);
  let test_order = res.rows[0].create_order.order_id;
  
  console.log('1. Ordered created. Activities:');
  res = await client.query(`SELECT id, title, activity_type, planned_at, status FROM order_activities WHERE order_id=$1;`, [test_order]);
  let first_call_id = res.rows[0].id;
  console.log(JSON.stringify(res.rows, null, 2));

  console.log('\\n2. Complete with NO_ANSWER:');
  await client.query(`SELECT complete_activity($1, 'NO_ANSWER', 'Не взяли слухавку');`, [first_call_id]);
  res = await client.query(`SELECT title, planned_at, status, outcome FROM order_activities WHERE order_id=$1 ORDER BY created_at ASC;`, [test_order]);
  console.log(JSON.stringify(res.rows, null, 2));
  
  console.log('\\n3. Pause Order (PAUSED):');
  await client.query(`SELECT change_order_status($1, 'PAUSED', 'клієнт попросив', null, null, 'Сирота');`, [test_order]);
  res = await client.query(`SELECT title, planned_at, status, outcome_notes FROM order_activities WHERE order_id=$1 ORDER BY created_at ASC;`, [test_order]);
  console.log(JSON.stringify(res.rows, null, 2));

  console.log('\\n4. Resume Order (RESUME):');
  await client.query(`SELECT change_order_status($1, 'RESUME');`, [test_order]);
  res = await client.query(`SELECT status as order_status, resume_date FROM orders WHERE id=$1;`, [test_order]);
  console.log("Order Status now:", res.rows[0].order_status);
  console.log("Resume Date updated:", res.rows[0].resume_date);

  res = await client.query(`SELECT title, planned_at, status, outcome_notes FROM order_activities WHERE order_id=$1 ORDER BY created_at ASC;`, [test_order]);
  console.log("Activities after resume:", JSON.stringify(res.rows, null, 2));

  await client.query(`DELETE FROM orders WHERE id=$1;`, [test_order]);
  await client.query(oldRoleDef);
  await client.end();
}
fixResumeDate().catch(console.error);
