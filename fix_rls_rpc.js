const { Client } = require('pg');

const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });

async function fix() {
  await client.connect();

  await client.query(`
CREATE OR REPLACE FUNCTION public.create_activity(
  p_order_id uuid, p_type public.activity_type, p_planned_at timestamptz, p_title text, 
  p_comment text DEFAULT NULL, p_assigned_to_role text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND current_user != 'postgres' AND current_user != 'service_role' THEN
    IF NOT public.can_access_order(p_order_id) THEN
      RAISE EXCEPTION 'Access denied';
    END IF;
  END IF;

  INSERT INTO public.order_activities (order_id, activity_type, planned_at, title, comment, assigned_to_role, created_by)
  VALUES (p_order_id, p_type, p_planned_at, p_title, p_comment, p_assigned_to_role, auth.uid())
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.complete_activity(
  p_activity_id uuid, p_outcome public.activity_outcome, p_outcome_notes text, p_next_planned_at timestamptz DEFAULT NULL
) RETURNS boolean AS $$
DECLARE
  v_order_id uuid;
  v_type public.activity_type;
  v_title text;
  v_assigned text;
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

  IF p_outcome IN ('NO_ANSWER', 'RESCHEDULED') AND p_next_planned_at IS NOT NULL THEN
    INSERT INTO public.order_activities (order_id, activity_type, planned_at, title, comment, assigned_to_role, created_by)
    VALUES (v_order_id, v_type, p_next_planned_at, 'Повтор: ' || v_title, 'Авто-створено після ' || p_outcome::text, v_assigned, auth.uid());
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.cancel_activity(
  p_activity_id uuid, p_reason text
) RETURNS boolean AS $$
DECLARE
  v_order_id uuid;
BEGIN
  SELECT order_id INTO v_order_id FROM public.order_activities WHERE id = p_activity_id;
  
  IF auth.uid() IS NOT NULL AND current_user != 'postgres' AND current_user != 'service_role' THEN
    IF NOT public.can_access_order(v_order_id) THEN
      RAISE EXCEPTION 'Access denied';
    END IF;
  END IF;

  UPDATE public.order_activities
  SET status = 'CANCELLED',
      outcome_notes = COALESCE(outcome_notes || ' | ', '') || 'Скасовано: ' || p_reason,
      completed_by = auth.uid(),
      completed_at = now()
  WHERE id = p_activity_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.reschedule_activity(
  p_activity_id uuid, p_new_planned_at timestamptz
) RETURNS boolean AS $$
DECLARE
  v_order_id uuid;
BEGIN
  SELECT order_id INTO v_order_id FROM public.order_activities WHERE id = p_activity_id;
  
  IF auth.uid() IS NOT NULL AND current_user != 'postgres' AND current_user != 'service_role' THEN
    IF NOT public.can_access_order(v_order_id) THEN
      RAISE EXCEPTION 'Access denied';
    END IF;
  END IF;

  UPDATE public.order_activities
  SET planned_at = p_new_planned_at
  WHERE id = p_activity_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  console.log("Fixed RPCs");
  await client.end();
}
fix().catch(console.error);
