-- 1. Create Enums
DO $$ BEGIN
    CREATE TYPE public.activity_type AS ENUM ('CALL', 'SMS', 'EMAIL', 'MEETING', 'INTERNAL_NOTE', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.activity_outcome AS ENUM ('ANSWERED', 'NO_ANSWER', 'REFUSED', 'RESCHEDULED', 'DONE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create Table
CREATE TABLE IF NOT EXISTS public.order_activities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    title text NOT NULL,
    activity_type public.activity_type NOT NULL,
    planned_at timestamptz NOT NULL,
    comment text,
    status text DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED')),
    outcome public.activity_outcome,
    outcome_notes text,
    assigned_to_role text,
    created_by uuid REFERENCES auth.users(id),
    completed_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    completed_at timestamptz
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_order_activities_pending_planned ON public.order_activities(order_id, planned_at) WHERE status='PENDING';

-- 4. Audit Log Trigger
DROP TRIGGER IF EXISTS trg_order_activities_audit ON public.order_activities;
CREATE TRIGGER trg_order_activities_audit
AFTER INSERT OR UPDATE OR DELETE ON public.order_activities
FOR EACH ROW EXECUTE FUNCTION public.log_changes();

-- 5. RLS
ALTER TABLE public.order_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_select_activities" ON public.order_activities;
CREATE POLICY "allow_select_activities" ON public.order_activities FOR SELECT USING (
  public.can_access_order(order_id)
);

DROP POLICY IF EXISTS "allow_insert_activities" ON public.order_activities;
CREATE POLICY "allow_insert_activities" ON public.order_activities FOR INSERT WITH CHECK (
  public.can_access_order(order_id)
);

DROP POLICY IF EXISTS "allow_update_activities" ON public.order_activities;
CREATE POLICY "allow_update_activities" ON public.order_activities FOR UPDATE USING (
  public.can_access_order(order_id) AND (
    public.get_user_role() = 'SUPER_ADMIN' OR
    assigned_to_role IS NULL OR
    public.get_user_role() = assigned_to_role
  )
);

-- Note: DELETE policy is not created, meaning delete is forbidden by default for all roles except superuser/postgres

-- 6. RPC: next_activity_at
CREATE OR REPLACE FUNCTION public.next_activity_at(order_row public.orders)
RETURNS timestamptz AS $$
  SELECT planned_at FROM public.order_activities 
  WHERE order_id = order_row.id AND status = 'PENDING' 
  ORDER BY planned_at ASC LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 7. RPCs for CRUD
CREATE OR REPLACE FUNCTION public.create_activity(
  p_order_id uuid, p_type public.activity_type, p_planned_at timestamptz, p_title text, 
  p_comment text DEFAULT NULL, p_assigned_to_role text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.can_access_order(p_order_id) THEN
    RAISE EXCEPTION 'Access denied';
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
  
  IF NOT public.can_access_order(v_order_id) THEN
    RAISE EXCEPTION 'Access denied';
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
  
  IF NOT public.can_access_order(v_order_id) THEN
    RAISE EXCEPTION 'Access denied';
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
  
  IF NOT public.can_access_order(v_order_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.order_activities
  SET planned_at = p_new_planned_at
  WHERE id = p_activity_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
