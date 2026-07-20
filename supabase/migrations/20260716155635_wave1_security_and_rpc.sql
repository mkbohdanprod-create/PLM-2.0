-- Хвиля 1: Безпекові дірки та Інкапсуляція

-- 1. Видалення сміттєвих переходів (BUG-2)
DELETE FROM public.status_transitions WHERE from_status = 'DRAFT' OR to_status = 'DRAFT';

-- 2. Закриття безпекової дірки з orders (BUG-3)
REVOKE UPDATE ON public.orders FROM authenticated;
GRANT UPDATE (
  order_number, branch_id, order_type,
  payment_percent, is_credit, payment_updated_at, payment_source,
  locked_by, lock_expires_at, version, is_hidden, cancel_reason_text, cancel_reason_id, pause_reason_id,
  parent_order_id, updated_at, resume_date, external_id, is_incomplete, entered_measurement_pool_at,
  document_date, base_readiness_date, payment_date, calc_readiness_date, planned_call_date, call_comment
) ON public.orders TO authenticated;

-- 3. Консолідована функція change_order_status (BUG-4)
DROP FUNCTION IF EXISTS public.change_order_status(uuid, text);
DROP FUNCTION IF EXISTS public.change_order_status(uuid, text, text);
DROP FUNCTION IF EXISTS public.change_order_status(uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.change_order_status(uuid, text, text, uuid, timestamptz, text);

CREATE OR REPLACE FUNCTION public.change_order_status(
  p_order_id uuid,
  p_new_status text,
  p_reason text DEFAULT NULL,
  p_reason_id uuid DEFAULT NULL,
  p_planned_call_date timestamp with time zone DEFAULT NULL,
  p_call_comment text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_current_status text;
  v_is_incomplete boolean;
  v_role text;
  v_target_status text;
BEGIN
  SELECT status, is_incomplete INTO v_current_status, v_is_incomplete 
  FROM public.orders WHERE id = p_order_id FOR UPDATE;
  
  v_role := COALESCE(public.get_user_role(), 'UNKNOWN');
  v_target_status := p_new_status;
  
  IF v_current_status = p_new_status THEN
    RETURN true;
  END IF;

  -- Обробка паузи та відновлення
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

  UPDATE public.orders 
  SET status = v_target_status,
      previous_status = CASE 
        WHEN v_target_status = 'PAUSED' THEN v_current_status 
        ELSE previous_status
      END,
      entered_measurement_pool_at = CASE 
        WHEN v_target_status = 'MEASUREMENT_SCHEDULING' THEN COALESCE(entered_measurement_pool_at, now())
        ELSE entered_measurement_pool_at 
      END,
      planned_call_date = CASE 
        WHEN p_planned_call_date IS NOT NULL THEN p_planned_call_date
        WHEN v_target_status = 'MEASUREMENT_SCHEDULING' AND v_current_status != 'MEASUREMENT_SCHEDULING' THEN now()
        ELSE planned_call_date
      END,
      call_comment = CASE 
        WHEN p_planned_call_date IS NOT NULL THEN p_call_comment
        WHEN v_target_status = 'MEASUREMENT_SCHEDULING' AND v_current_status != 'MEASUREMENT_SCHEDULING' THEN 'Потрібен повторний контакт'
        ELSE call_comment
      END,
      updated_at = now()
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
$function$;

-- 4. RPC update_order_resume_date (BUG-5)
CREATE OR REPLACE FUNCTION public.update_order_resume_date(p_order_id uuid, p_resume_date timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.orders SET resume_date = p_resume_date, updated_at = now() WHERE id = p_order_id;
  RETURN FOUND;
END;
$$;

-- 5. RPC hide_order
CREATE OR REPLACE FUNCTION public.hide_order(p_order_id uuid, p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.orders 
  SET is_hidden = true, 
      cancel_reason_text = COALESCE(p_reason, cancel_reason_text),
      updated_at = now() 
  WHERE id = p_order_id;
  RETURN FOUND;
END;
$$;

-- 6. RPC для довідників

-- 6.1 Worker Schedules (Hard Delete)
CREATE OR REPLACE FUNCTION public.upsert_worker_schedule(p_profile_id uuid, p_work_date date, p_status text, p_start_time time, p_end_time time)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.worker_schedules (profile_id, work_date, status, start_time, end_time)
  VALUES (p_profile_id, p_work_date, p_status, p_start_time, p_end_time)
  ON CONFLICT (profile_id, work_date) 
  DO UPDATE SET status = EXCLUDED.status, start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_worker_schedule(p_profile_id uuid, p_work_date date)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.worker_schedules WHERE profile_id = p_profile_id AND work_date = p_work_date;
  RETURN true;
END;
$$;

-- Add is_hidden to regions and branches for soft deletes
ALTER TABLE public.regions ADD COLUMN IF NOT EXISTS is_hidden boolean DEFAULT false;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS is_hidden boolean DEFAULT false;

-- 6.2 Regions (Soft Delete)
CREATE OR REPLACE FUNCTION public.create_region(p_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE new_id uuid;
BEGIN
  INSERT INTO public.regions (name) VALUES (p_name) RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_region(p_id uuid, p_name text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.regions SET name = p_name WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.hide_region(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.regions SET is_hidden = true WHERE id = p_id;
  RETURN FOUND;
END;
$$;

-- 6.3 Branches (Soft Delete)
CREATE OR REPLACE FUNCTION public.create_branch(p_name text, p_region_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE new_id uuid;
BEGIN
  INSERT INTO public.branches (name, region_id) VALUES (p_name, p_region_id) RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_branch(p_id uuid, p_name text, p_region_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.branches SET name = p_name, region_id = p_region_id WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.hide_branch(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.branches SET is_hidden = true WHERE id = p_id;
  RETURN FOUND;
END;
$$;

-- 6.4 Engineering Tasks (assign_engineer)
CREATE OR REPLACE FUNCTION public.assign_engineer(p_task_id uuid, p_assigned_to uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.engineering_tasks SET assigned_to = p_assigned_to, updated_at = now() WHERE id = p_task_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_engineering_task_status(p_task_id uuid, p_status text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.engineering_tasks SET status = p_status, updated_at = now() WHERE id = p_task_id;
  RETURN FOUND;
END;
$$;

-- 6.5 Roles
CREATE OR REPLACE FUNCTION public.update_role_permissions(p_code text, p_name_ua text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.roles SET name_ua = p_name_ua WHERE code = p_code;
  RETURN FOUND;
END;
$$;

-- 6.6 Profiles
CREATE OR REPLACE FUNCTION public.update_employee_profile(p_id uuid, p_full_name text, p_role_code text, p_branch_id uuid, p_department_id uuid, p_phone text, p_email text, p_work_status text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.profiles 
  SET full_name = p_full_name, role_code = p_role_code, branch_id = p_branch_id, department_id = p_department_id, phone = p_phone, email = p_email, work_status = p_work_status, updated_at = now() 
  WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_employee(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.profiles SET work_status = 'ACTIVE', updated_at = now() WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_employee(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.profiles SET work_status = 'INACTIVE', updated_at = now() WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_default_filters(p_id uuid, p_filters jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.profiles SET default_filters = p_filters, updated_at = now() WHERE id = p_id;
  RETURN FOUND;
END;
$$;
