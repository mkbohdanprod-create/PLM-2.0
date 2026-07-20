-- 20260710170000_order_activities_architecture.sql

BEGIN;

-- 1. Create Enums
DO $$ BEGIN
    CREATE TYPE activity_type AS ENUM ('CALL', 'SMS', 'EMAIL', 'MEETING', 'INTERNAL_NOTE', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE activity_outcome AS ENUM ('ANSWERED', 'NO_ANSWER', 'REFUSED', 'RESCHEDULED', 'DONE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create order_activities table
CREATE TABLE IF NOT EXISTS public.order_activities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    title text NOT NULL,
    activity_type activity_type NOT NULL DEFAULT 'CALL',
    planned_at timestamptz,
    comment text,
    status text DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED')),
    outcome activity_outcome,
    outcome_notes text,
    assigned_to_role text REFERENCES public.roles(code),
    created_by uuid REFERENCES auth.users(id),
    completed_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    completed_at timestamptz
);

-- RLS
ALTER TABLE public.order_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.order_activities;
CREATE POLICY "Enable read for authenticated users" 
ON public.order_activities FOR SELECT TO authenticated USING (
  public.can_access_order(order_id)
);

DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.order_activities;
CREATE POLICY "Enable all for authenticated users" 
ON public.order_activities FOR ALL TO authenticated USING (
  public.can_access_order(order_id)
);

-- Audit
DROP TRIGGER IF EXISTS audit_order_activities_changes ON public.order_activities;
CREATE TRIGGER audit_order_activities_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.order_activities
  FOR EACH ROW EXECUTE FUNCTION public.log_changes();

-- 3. Add next_activity_date to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS next_activity_date timestamptz;

-- 4. Migrate Data
-- 4.1 From communication_tasks
INSERT INTO public.order_activities (
    order_id, title, activity_type, planned_at, comment, status, created_by, created_at, completed_by, completed_at
)
SELECT 
    order_id, title, 'CALL'::activity_type, planned_call_date, comment, status, created_by, created_at, completed_by, completed_at
FROM public.communication_tasks;

-- 4.2 From orders.planned_call_date (only pending, avoiding duplicates)
INSERT INTO public.order_activities (
    order_id, title, activity_type, planned_at, comment, status, created_at
)
SELECT 
    id, 'Продзвон', 'CALL'::activity_type, planned_call_date, call_comment, 'PENDING', now()
FROM public.orders o
WHERE planned_call_date IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM public.order_activities oa 
    WHERE oa.order_id = o.id AND oa.status = 'PENDING'
);

-- 5. Drop old table and columns
DROP TABLE IF EXISTS public.communication_tasks CASCADE;
ALTER TABLE public.orders DROP COLUMN IF EXISTS planned_call_date, DROP COLUMN IF EXISTS call_comment;

-- 6. Trigger for next_activity_date
CREATE OR REPLACE FUNCTION public.update_next_activity_date()
RETURNS trigger AS $$
BEGIN
  -- Update for the order related to this activity
  UPDATE public.orders
  SET next_activity_date = (
    SELECT MIN(planned_at)
    FROM public.order_activities
    WHERE order_id = COALESCE(NEW.order_id, OLD.order_id)
    AND status = 'PENDING'
  )
  WHERE id = COALESCE(NEW.order_id, OLD.order_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS update_next_activity_trigger ON public.order_activities;
CREATE TRIGGER update_next_activity_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.order_activities
  FOR EACH ROW EXECUTE PROCEDURE public.update_next_activity_date();

-- Initialize next_activity_date for all existing orders
UPDATE public.orders o
SET next_activity_date = (
  SELECT MIN(planned_at)
  FROM public.order_activities oa
  WHERE oa.order_id = o.id AND oa.status = 'PENDING'
);

-- 7. Update RPCs
-- 7.1 create_order
CREATE OR REPLACE FUNCTION public.create_order(
  p_external_id text,
  p_branch_id uuid,
  p_order_type text,
  p_full_name text,
  p_phone text,
  p_city text,
  p_street text DEFAULT NULL,
  p_building text DEFAULT NULL,
  p_material text DEFAULT NULL,
  p_area numeric DEFAULT NULL,
  p_force boolean DEFAULT false
) RETURNS json AS $$
DECLARE
  v_dup_check json;
  v_order_id uuid;
  v_phone_norm text;
  v_is_incomplete boolean;
  v_initial_status text;
  v_planned_call_date timestamptz;
BEGIN
  v_phone_norm := regexp_replace(p_phone, '[^0-9]', '', 'g');

  IF NOT p_force THEN
    v_dup_check := public.check_order_duplicates(p_full_name, p_phone, p_city, p_street, p_building);
    IF json_array_length(v_dup_check) > 0 THEN
      RETURN json_build_object('success', false, 'error', 'DUPLICATES_FOUND', 'duplicates', v_dup_check);
    END IF;
  END IF;
  
  v_is_incomplete := false;
  IF p_street IS NULL OR p_street = '' OR p_building IS NULL OR p_building = '' THEN
    v_is_incomplete := true;
  END IF;
  IF p_material IS NULL OR p_material = '' OR p_area IS NULL OR p_area <= 0 THEN
    v_is_incomplete := true;
  END IF;

  v_initial_status := CASE 
    WHEN p_order_type = 'BY_DRAWING' THEN 'ENGINEERING_DESIGN'
    ELSE 'MEASUREMENT_SCHEDULING'
  END;

  INSERT INTO public.orders (order_number, external_id, branch_id, status, order_type, is_incomplete)
  VALUES (
    'O-' || upper(substr(md5(random()::text), 1, 6)), 
    p_external_id, 
    p_branch_id, 
    v_initial_status, 
    p_order_type, 
    v_is_incomplete
  )
  RETURNING id INTO v_order_id;
  
  -- Create CALL task for MEASUREMENT_SCHEDULING
  IF v_initial_status = 'MEASUREMENT_SCHEDULING' THEN
    INSERT INTO public.order_activities (order_id, title, activity_type, planned_at, comment, created_by)
    VALUES (v_order_id, 'Дзвінок по новому замовленню', 'CALL', now() + interval '4 hours', 'Нове замовлення', auth.uid());
  END IF;
  
  INSERT INTO public.order_contacts (order_id, full_name, phone, phone_normalized)
  VALUES (v_order_id, p_full_name, p_phone, v_phone_norm);
  
  IF p_street IS NOT NULL OR p_city IS NOT NULL THEN
    INSERT INTO public.order_addresses (order_id, city, street, building)
    VALUES (v_order_id, COALESCE(p_city, ''), COALESCE(p_street, ''), COALESCE(p_building, ''));
  END IF;

  IF p_material IS NOT NULL OR p_area IS NOT NULL THEN
    INSERT INTO public.order_specifications (order_id, material_type, area_sqm)
    VALUES (v_order_id, COALESCE(p_material, ''), COALESCE(p_area, 0));
  END IF;

  INSERT INTO public.order_status_history (
    order_id, from_status, to_status, changed_by, source, reason, reason_id
  ) VALUES (
    v_order_id, NULL, v_initial_status, auth.uid(), 
    COALESCE(current_setting('app.source', true), 'API'), 
    NULL, NULL
  );
  
  RETURN json_build_object('success', true, 'order_id', v_order_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7.2 assign_measurement
CREATE OR REPLACE FUNCTION public.assign_measurement(p_order_id uuid, p_measurer_id uuid, p_date date, p_start_time time without time zone, p_end_time time without time zone, p_estimated_travel_time integer DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_status text;
  v_task_id uuid;
  v_target_datetime timestamptz;
BEGIN
  SELECT status INTO v_status FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Combine date and time
  v_target_datetime := p_date + p_start_time;

  -- Знаходимо АКТИВНИЙ замір
  SELECT id INTO v_task_id FROM public.measurement_tasks 
  WHERE order_id = p_order_id AND outcome IN ('SCHEDULED', 'IN_PROGRESS')
  ORDER BY created_at DESC LIMIT 1;

  IF v_task_id IS NOT NULL THEN
    UPDATE public.measurement_tasks
    SET measurer_id = p_measurer_id,
        scheduled_date = p_date,
        start_time = p_start_time,
        end_time = p_end_time,
        estimated_travel_time_mins = p_estimated_travel_time
    WHERE id = v_task_id;
  ELSE
    INSERT INTO public.measurement_tasks (order_id, measurer_id, scheduled_date, start_time, end_time, estimated_travel_time_mins, outcome)
    VALUES (p_order_id, p_measurer_id, p_date, p_start_time, p_end_time, p_estimated_travel_time, 'SCHEDULED');
  END IF;
  
  -- Створюємо або оновлюємо активність за 1 добу до заміру
  -- Закриваємо попередні PENDING активності
  UPDATE public.order_activities 
  SET status = 'CANCELLED' 
  WHERE order_id = p_order_id AND status = 'PENDING';

  INSERT INTO public.order_activities (order_id, title, activity_type, planned_at, comment, created_by)
  VALUES (p_order_id, 'Нагадування клієнту перед виїздом', 'CALL', v_target_datetime - interval '1 day', 'Автоматично створено при призначенні заміру', auth.uid());

END;
$function$;

-- 7.3 change_order_status
DROP FUNCTION IF EXISTS public.change_order_status(uuid, text);
DROP FUNCTION IF EXISTS public.change_order_status(uuid, text, text);
DROP FUNCTION IF EXISTS public.change_order_status(uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.change_order_status(uuid, text, text, uuid, timestamptz, text);

CREATE OR REPLACE FUNCTION public.change_order_status(
  p_order_id uuid,
  p_new_status text,
  p_reason text DEFAULT NULL,
  p_reason_id uuid DEFAULT NULL,
  p_planned_activity_date timestamptz DEFAULT NULL,
  p_activity_comment text DEFAULT NULL
) RETURNS boolean AS $$
DECLARE
  v_current_status text;
  v_is_incomplete boolean;
  v_role text;
  v_target_status text;
  v_req record;
  v_check_query text;
  v_is_valid boolean;
BEGIN
  SELECT status, is_incomplete INTO v_current_status, v_is_incomplete 
  FROM public.orders WHERE id = p_order_id FOR UPDATE;
  
  v_role := public.get_user_role();
  v_target_status := p_new_status;
  
  IF v_current_status = p_new_status THEN
    RETURN true;
  END IF;

  IF v_current_status = 'PAUSED' AND p_new_status = 'RESUME' THEN
    SELECT previous_status INTO v_target_status FROM public.orders WHERE id = p_order_id;
    IF v_target_status IS NULL THEN
      SELECT CASE WHEN order_type = 'BY_DRAWING' THEN 'ENGINEERING_DESIGN' ELSE 'MEASUREMENT_SCHEDULING' END 
      INTO v_target_status FROM public.orders WHERE id = p_order_id;
    END IF;
  ELSE
    IF v_role != 'SUPER_ADMIN' AND NOT EXISTS (
      SELECT 1 FROM public.status_transitions 
      WHERE from_status = v_current_status AND to_status = p_new_status AND v_role = ANY(allowed_roles)
    ) THEN
      RAISE EXCEPTION 'Transition from % to % not allowed for role %', v_current_status, p_new_status, v_role;
    END IF;
  END IF;

  IF p_reason_id IS NOT NULL THEN
    IF v_target_status = 'PAUSED' AND NOT EXISTS (SELECT 1 FROM public.pause_reasons WHERE id = p_reason_id) THEN
      RAISE EXCEPTION 'Invalid pause_reason_id';
    END IF;
    IF v_target_status = 'CANCELLED' AND NOT EXISTS (SELECT 1 FROM public.cancel_reasons WHERE id = p_reason_id) THEN
      RAISE EXCEPTION 'Invalid cancel_reason_id';
    END IF;
  END IF;

  IF v_is_incomplete = true AND v_target_status IN ('MEASUREMENT_SCHEDULED', 'ENGINEERING_NESTING') THEN
    RAISE EXCEPTION 'Cannot transition: Order is incomplete. Please fill all required fields.';
  END IF;

  IF v_target_status NOT IN ('PAUSED', 'CANCELLED') THEN
    FOR v_req IN SELECT * FROM public.status_required_fields WHERE status = v_target_status LOOP
      FOR i IN 1..array_length(v_req.required_columns, 1) LOOP
        v_check_query := format(
          'SELECT EXISTS(SELECT 1 FROM public.%I WHERE order_id = $1 AND %I IS NOT NULL AND %I::text != '''')', 
          v_req.required_table, 
          v_req.required_columns[i],
          v_req.required_columns[i]
        );
        EXECUTE v_check_query INTO v_is_valid USING p_order_id;
        IF NOT v_is_valid THEN
          RAISE EXCEPTION 'Для переходу в % обов’язково заповнити % в %', v_target_status, v_req.required_columns[i], v_req.required_table;
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  -- Логіка створення активностей при зміні статусу
  IF p_planned_activity_date IS NOT NULL THEN
    INSERT INTO public.order_activities (order_id, title, activity_type, planned_at, comment, created_by)
    VALUES (p_order_id, 'Контакт по замовленню', 'CALL', p_planned_activity_date, COALESCE(p_activity_comment, ''), auth.uid());
  ELSE
    IF v_target_status = 'MEASUREMENT_SCHEDULING' AND v_current_status != 'MEASUREMENT_SCHEDULING' THEN
       INSERT INTO public.order_activities (order_id, title, activity_type, planned_at, comment, created_by)
       VALUES (p_order_id, 'Повернено в планування', 'CALL', now(), 'Потрібен повторний контакт', auth.uid());
    END IF;
  END IF;

  UPDATE public.orders 
  SET status = v_target_status,
      previous_status = CASE 
        WHEN v_target_status = 'PAUSED' THEN v_current_status 
        ELSE previous_status
      END,
      entered_measurement_pool_at = CASE 
        WHEN v_target_status = 'MEASUREMENT_SCHEDULING' THEN COALESCE(entered_measurement_pool_at, now())
        ELSE entered_measurement_pool_at 
      END
  WHERE id = p_order_id;
  
  INSERT INTO public.order_status_history (
    order_id, from_status, to_status, changed_by, source, reason, reason_id
  ) VALUES (
    p_order_id, v_current_status, v_target_status, auth.uid(), 
    COALESCE(current_setting('app.source', true), 'UI'), 
    p_reason, p_reason_id
  );
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 8. Drop old RPCs
DROP FUNCTION IF EXISTS public.update_planned_call(uuid, timestamptz, text);
DROP FUNCTION IF EXISTS public.create_communication_task(uuid, text, timestamptz, text);
DROP FUNCTION IF EXISTS public.complete_communication_task(uuid);

-- 9. New RPCs for order_activities
CREATE OR REPLACE FUNCTION public.create_order_activity(
  p_order_id uuid, 
  p_title text, 
  p_type activity_type, 
  p_planned_at timestamptz, 
  p_comment text
)
RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.can_access_order(p_order_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO public.order_activities (order_id, title, activity_type, planned_at, comment, created_by)
  VALUES (p_order_id, p_title, p_type, p_planned_at, p_comment, auth.uid())
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.complete_order_activity(
  p_activity_id uuid,
  p_outcome activity_outcome,
  p_outcome_notes text
)
RETURNS void AS $$
DECLARE
  v_order_id uuid;
BEGIN
  SELECT order_id INTO v_order_id FROM public.order_activities WHERE id = p_activity_id;
  
  IF NOT public.can_access_order(v_order_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.order_activities
  SET status = 'COMPLETED',
      outcome = p_outcome,
      outcome_notes = p_outcome_notes,
      completed_at = now(),
      completed_by = auth.uid()
  WHERE id = p_activity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
