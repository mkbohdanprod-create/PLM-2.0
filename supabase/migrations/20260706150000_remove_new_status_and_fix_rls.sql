-- 20260706150000_remove_new_status_and_fix_rls.sql

BEGIN;

-- 1. Fix RLS Vulnerability in can_access_order
CREATE OR REPLACE FUNCTION public.can_access_order(p_order_id uuid) RETURNS boolean AS $$
DECLARE
  v_order_branch_id uuid;
  v_order_region_id uuid;
  v_allowed_regions uuid[];
BEGIN
  -- Get the order's branch
  SELECT branch_id INTO v_order_branch_id
  FROM public.orders WHERE id = p_order_id;

  -- If order has no branch, only SUPER_ADMIN can see it
  IF v_order_branch_id IS NULL THEN
    RETURN public.get_user_role() = 'SUPER_ADMIN';
  END IF;

  -- Get region of that branch
  SELECT region_id INTO v_order_region_id
  FROM public.branches WHERE id = v_order_branch_id;

  v_allowed_regions := public.get_user_allowed_view_regions();

  -- FIX: SUPER_ADMIN gets access to all
  IF public.get_user_role() = 'SUPER_ADMIN' THEN
    RETURN TRUE;
  END IF;

  -- FIX: If no regions allowed (e.g. user without profile or region), deny access
  IF v_allowed_regions IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Otherwise, check if the order's region is in the allowed array
  RETURN v_order_region_id = ANY(v_allowed_regions);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2. Update orders table default status
ALTER TABLE public.orders ALTER COLUMN status SET DEFAULT 'MEASUREMENT_SCHEDULING';

-- 3. Backfill old NEW orders
UPDATE public.orders 
SET status = CASE 
  WHEN order_type = 'BY_DRAWING' THEN 'ENGINEERING_DESIGN'
  ELSE 'MEASUREMENT_SCHEDULING'
END
WHERE status = 'NEW';

-- Update history logs to match
UPDATE public.order_status_history
SET to_status = CASE 
  WHEN (SELECT order_type FROM public.orders WHERE id = order_id) = 'BY_DRAWING' THEN 'ENGINEERING_DESIGN'
  ELSE 'MEASUREMENT_SCHEDULING'
END
WHERE to_status = 'NEW';

UPDATE public.order_status_history
SET from_status = CASE 
  WHEN (SELECT order_type FROM public.orders WHERE id = order_id) = 'BY_DRAWING' THEN 'ENGINEERING_DESIGN'
  ELSE 'MEASUREMENT_SCHEDULING'
END
WHERE from_status = 'NEW';

-- 4. Update status_transitions
DELETE FROM public.status_transitions WHERE from_status = 'NEW' OR to_status = 'NEW';

-- 5. Update create_order to bypass NEW
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
BEGIN
  v_phone_norm := regexp_replace(p_phone, '[^0-9]', '', 'g');

  IF NOT p_force THEN
    v_dup_check := public.check_order_duplicates(p_full_name, p_phone, p_city, p_street, p_building);
    IF json_array_length(v_dup_check) > 0 THEN
      RETURN json_build_object('success', false, 'error', 'DUPLICATES_FOUND', 'duplicates', v_dup_check);
    END IF;
  END IF;
  
  -- Compute incomplete initially
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
  VALUES ('O-' || upper(substr(md5(random()::text), 1, 6)), p_external_id, p_branch_id, v_initial_status, p_order_type, v_is_incomplete)
  RETURNING id INTO v_order_id;
  
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

  -- Записуємо початковий статус в історію
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

-- 6. Update status_required_fields
DELETE FROM public.status_required_fields WHERE status = 'NEW';

INSERT INTO public.status_required_fields (status, required_table, required_columns) VALUES
  ('MEASUREMENT_SCHEDULED', 'order_contacts', '{phone,full_name}'),
  ('MEASUREMENT_SCHEDULED', 'order_addresses', '{city,street,building}'),
  ('ENGINEERING_NESTING', 'order_contacts', '{phone,full_name}'),
  ('ENGINEERING_NESTING', 'order_specifications', '{material_type,area_sqm}');

-- 7. Restore is_incomplete check in change_order_status
CREATE OR REPLACE FUNCTION public.change_order_status(
  p_order_id uuid,
  p_new_status text,
  p_reason text DEFAULT NULL,
  p_reason_id uuid DEFAULT NULL
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
    IF NOT EXISTS (
      SELECT 1 FROM public.status_transitions 
      WHERE from_status = v_current_status AND to_status = p_new_status AND v_role = ANY(allowed_roles)
    ) THEN
      RAISE EXCEPTION 'Transition from % to % not allowed for role %', v_current_status, p_new_status, v_role;
    END IF;
  END IF;

  -- Перевірка валідності reason_id
  IF p_reason_id IS NOT NULL THEN
    IF v_target_status = 'PAUSED' AND NOT EXISTS (SELECT 1 FROM public.pause_reasons WHERE id = p_reason_id) THEN
      RAISE EXCEPTION 'Invalid pause_reason_id';
    END IF;
    IF v_target_status = 'CANCELLED' AND NOT EXISTS (SELECT 1 FROM public.cancel_reasons WHERE id = p_reason_id) THEN
      RAISE EXCEPTION 'Invalid cancel_reason_id';
    END IF;
  END IF;

  -- Перевірка is_incomplete для переходу ДАЛІ
  IF v_is_incomplete = true AND v_target_status IN ('MEASUREMENT_SCHEDULED', 'ENGINEERING_NESTING') THEN
    RAISE EXCEPTION 'Cannot transition: Order is incomplete. Please fill all required fields.';
  END IF;

  -- Перевірка обов'язкових полів (крім PAUSED, CANCELLED)
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

  -- Оновлення
  UPDATE public.orders 
  SET status = v_target_status,
      previous_status = CASE 
        WHEN v_target_status = 'PAUSED' THEN v_current_status 
        ELSE previous_status  -- не чіпати
      END,
      entered_measurement_pool_at = CASE 
        WHEN v_target_status = 'MEASUREMENT_SCHEDULING' THEN COALESCE(entered_measurement_pool_at, now())
        ELSE entered_measurement_pool_at 
      END
  WHERE id = p_order_id;
  
  -- Записуємо історію
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

COMMIT;
