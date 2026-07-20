const { Client } = require('pg');
const fs = require('fs');

const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });

async function patch() {
  await client.connect();

  console.log("Applying Constraint to order_activities...");
  await client.query(`
    ALTER TABLE public.order_activities 
    ADD CONSTRAINT check_assigned_to_role 
    CHECK (assigned_to_role IN ('DISPATCHER', 'MANAGER', 'CONSTRUCTOR', 'MEASURER', 'INSTALLER', 'SUPER_ADMIN'));
  `);

  console.log("Patching complete_activity...");
  await client.query(`
CREATE OR REPLACE FUNCTION public.complete_activity(
  p_activity_id uuid, p_outcome public.activity_outcome, p_outcome_notes text, p_next_planned_at timestamptz DEFAULT NULL
) RETURNS boolean AS $$
DECLARE
  v_order_id uuid;
  v_type public.activity_type;
  v_title text;
  v_assigned text;
  v_actual_next timestamptz;
BEGIN
  SELECT order_id, activity_type, title, assigned_to_role INTO v_order_id, v_type, v_title, v_assigned
  FROM public.order_activities WHERE id = p_activity_id;
  
  IF auth.uid() IS NOT NULL AND current_user != 'postgres' AND current_user != 'service_role' THEN
    IF NOT public.can_access_order(v_order_id) THEN
      RAISE EXCEPTION 'Access denied';
    END IF;
  END IF;

  UPDATE public.order_activities
  SET status = 'COMPLETED',
      outcome = p_outcome,
      outcome_notes = p_outcome_notes,
      completed_by = auth.uid(),
      completed_at = now()
  WHERE id = p_activity_id;

  IF p_outcome IN ('NO_ANSWER', 'RESCHEDULED') THEN
    v_actual_next := COALESCE(p_next_planned_at, now() + interval '1 day');
    INSERT INTO public.order_activities (order_id, activity_type, planned_at, title, comment, assigned_to_role, created_by)
    VALUES (v_order_id, v_type, v_actual_next, 'Повтор: ' || v_title, 'Авто-створено після ' || p_outcome::text, v_assigned, auth.uid());
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  console.log("Patching change_order_status...");
  let triggerPatch = fs.readFileSync('wave4_activities_triggers_patch.sql', 'utf8');
  await client.query(triggerPatch);

  console.log("Done patching.");

  // Gather Proofs
  console.log("================ PROOFS ================");
  let res = await client.query(`
    SELECT conname, pg_get_constraintdef(oid) as def 
    FROM pg_constraint 
    WHERE conrelid = 'public.order_activities'::regclass AND conname = 'check_assigned_to_role';
  `);
  console.log("1. Constraint check_assigned_to_role:");
  console.log(res.rows[0]);

  res = await client.query(`
    SELECT pg_get_functiondef(oid) as def 
    FROM pg_proc 
    WHERE proname = 'complete_activity';
  `);
  console.log("2. complete_activity logic (v_actual_next):");
  let defLines = res.rows[0].def.split('\\n');
  console.log(defLines.filter(l => l.includes('v_actual_next') || l.includes('NO_ANSWER')).join('\\n'));

  await client.end();
}
patch().catch(console.error);
