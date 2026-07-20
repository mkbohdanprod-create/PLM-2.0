-- Restore RPCs for order_activities that were previously created via a JS script
-- instead of a migration, and were lost during db reset.

CREATE OR REPLACE FUNCTION public.create_activity(
  p_order_id uuid, p_type public.activity_type, p_planned_at timestamptz, p_title text, 
  p_comment text DEFAULT NULL, p_assigned_to_role text DEFAULT NULL, p_macro_stage text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND current_user != 'postgres' AND current_user != 'service_role' THEN
    IF NOT public.can_access_order(p_order_id) THEN
      RAISE EXCEPTION 'Access denied';
    END IF;
  END IF;

  INSERT INTO public.order_activities (order_id, activity_type, planned_at, title, comment, assigned_to_role, created_by, macro_stage)
  VALUES (p_order_id, p_type, p_planned_at, p_title, p_comment, p_assigned_to_role, auth.uid(), p_macro_stage)
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
  v_macro text;
BEGIN
  SELECT order_id, activity_type, title, assigned_to_role, macro_stage INTO v_order_id, v_type, v_title, v_assigned, v_macro
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
    INSERT INTO public.order_activities (order_id, activity_type, planned_at, title, comment, assigned_to_role, created_by, macro_stage)
    VALUES (v_order_id, v_type, p_next_planned_at, 'Повтор: ' || v_title, 'Авто-створено після ' || p_outcome::text, v_assigned, auth.uid(), v_macro);
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
