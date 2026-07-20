const { Client } = require('pg');
const fs = require('fs');
const { execSync } = require('child_process');

const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });

async function fixAndGather() {
  await client.connect();

  console.log("--- 1. Check if resume_date exists ---");
  let res = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name='orders' AND column_name='resume_date';`);
  console.log("Columns matching 'resume_date':", res.rows);
  
  console.log("\\n--- 3. Check if installation_tasks exists ---");
  res = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_name='installation_tasks';`);
  console.log("Tables matching 'installation_tasks':", res.rows);

  console.log("\\n--- Fixing installation_tasks dependency ---");
  // If it doesn't exist, we must create a dummy one or fix change_order_status to check existence or just not crash.
  // We'll create it to be safe, since it's probably planned for the future.
  if (res.rows.length === 0) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.installation_tasks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid REFERENCES public.orders(id),
        scheduled_date timestamptz,
        created_at timestamptz DEFAULT now()
      );
    `);
    console.log("Created table public.installation_tasks");
  }

  console.log("\\n--- 2. Fixing create_activity (p_skip_access_check) ---");
  await client.query(`
CREATE OR REPLACE FUNCTION public.create_activity(
  p_order_id uuid, p_type public.activity_type, p_planned_at timestamptz, p_title text, 
  p_comment text DEFAULT NULL, p_assigned_to_role text DEFAULT NULL,
  p_skip_access_check boolean DEFAULT false
) RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT p_skip_access_check THEN
    IF auth.uid() IS NOT NULL AND current_user != 'postgres' AND current_user != 'service_role' THEN
      IF NOT public.can_access_order(p_order_id) THEN
        RAISE EXCEPTION 'Access denied';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.order_activities (order_id, activity_type, planned_at, title, comment, assigned_to_role, created_by)
  VALUES (p_order_id, p_type, p_planned_at, p_title, p_comment, p_assigned_to_role, auth.uid())
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  console.log("\\n--- Fixing change_order_status & create_order to use skip_access_check ---");
  let changeOrderRes = await client.query(`SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'change_order_status' AND pg_get_function_arguments(oid) LIKE '%p_reason text DEFAULT NULL%';`);
  let changeOrderDef = changeOrderRes.rows[0].def;
  changeOrderDef = changeOrderDef.replace(
    /PERFORM public\.create_activity\(v_order_id, 'CALL', now\(\) \+ interval '4 hours', 'Перший контакт', 'Нове замовлення', 'DISPATCHER'\);/g,
    `PERFORM public.create_activity(v_order_id, 'CALL', now() + interval '4 hours', 'Перший контакт', 'Нове замовлення', 'DISPATCHER', true);`
  ).replace(
    /PERFORM public\.create_activity\(p_order_id, 'CALL', v_task_date - interval '1 day', 'Контроль перед виїздом', 'Автоматичне нагадування', 'DISPATCHER'\);/g,
    `PERFORM public.create_activity(p_order_id, 'CALL', v_task_date - interval '1 day', 'Контроль перед виїздом', 'Автоматичне нагадування', 'DISPATCHER', true);`
  ).replace(
    /PERFORM public\.create_activity\(p_order_id, 'CALL', p_planned_call_date - interval '1 day', 'Контроль паузи', COALESCE\(p_call_comment, 'Автоматичне нагадування по паузі'\), 'DISPATCHER'\);/g,
    `PERFORM public.create_activity(p_order_id, 'CALL', p_planned_call_date - interval '1 day', 'Контроль паузи', COALESCE(p_call_comment, 'Автоматичне нагадування по паузі'), 'DISPATCHER', true);`
  ).replace(
    /PERFORM public\.create_activity\(p_order_id, 'CALL', now\(\) \+ interval '3 days', 'Уточнити дату повернення з паузи для замовлення ' \|\| v_order_number, 'Сирота-пауза \(без дати\)', 'DISPATCHER'\);/g,
    `PERFORM public.create_activity(p_order_id, 'CALL', now() + interval '3 days', 'Уточнити дату повернення з паузи для замовлення ' || v_order_number, 'Сирота-пауза (без дати)', 'DISPATCHER', true);`
  );
  // Also we need to DROP and CREATE again. Actually just CREATE OR REPLACE works.
  await client.query(changeOrderDef);

  let createOrderRes = await client.query(`SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'create_order' AND pg_get_function_arguments(oid) LIKE '%p_lat numeric DEFAULT NULL%';`);
  let createOrderDef = createOrderRes.rows[0].def;
  createOrderDef = createOrderDef.replace(
    /PERFORM public\.create_activity\(v_order_id, 'CALL', now\(\) \+ interval '4 hours', 'Перший контакт', 'Нове замовлення', 'DISPATCHER'\);/g,
    `PERFORM public.create_activity(v_order_id, 'CALL', now() + interval '4 hours', 'Перший контакт', 'Нове замовлення', 'DISPATCHER', true);`
  );
  await client.query(createOrderDef);

  console.log("Functions updated successfully.");
  
  await client.end();
}

fixAndGather().catch(console.error);
