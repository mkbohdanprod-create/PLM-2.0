-- 06_state_machine.sql

-- REVOKE UPDATE on status to ensure it can only be changed via RPC
-- In Postgres, column privileges are additive. We must revoke table-level update first.
REVOKE UPDATE ON public.orders FROM authenticated;
GRANT UPDATE (
  order_number, branch_id, order_type,
  payment_percent, is_credit, payment_updated_at, payment_source,
  locked_by, lock_expires_at, version, is_hidden, cancel_reason,
  parent_order_id, updated_at
) ON public.orders TO authenticated;

-- Settings table
CREATE TABLE public.settings (
  key text PRIMARY KEY,
  value text NOT NULL
);

INSERT INTO public.settings (key, value) VALUES 
('payment_threshold', '50'),
('sla_engineering_hours', '48'),
('reminder_interval_days', '3');

-- Transitions table
CREATE TABLE public.status_transitions (
  id serial PRIMARY KEY,
  from_status text NOT NULL,
  to_status text NOT NULL,
  allowed_roles text[] NOT NULL
);

-- Seed transitions (from order_state_machine.md)
INSERT INTO public.status_transitions (from_status, to_status, allowed_roles) VALUES
('DRAFT', 'NEW', '{SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER}'),
('DRAFT', 'CANCELLED', '{SUPER_ADMIN, REGION_MANAGER, BRANCH_MANAGER}'),
('NEW', 'MEASUREMENT_SCHEDULING', '{SUPER_ADMIN, DISPATCHER}'),
('NEW', 'ENGINEERING_DESIGN', '{SUPER_ADMIN, DISPATCHER}'),
('NEW', 'PAUSED', '{SUPER_ADMIN, DISPATCHER}'),
('NEW', 'CANCELLED', '{SUPER_ADMIN, REGION_MANAGER}'),
('MEASUREMENT_SCHEDULING', 'MEASUREMENT_SCHEDULED', '{SUPER_ADMIN, DISPATCHER}'),
('MEASUREMENT_SCHEDULING', 'PAUSED', '{SUPER_ADMIN, DISPATCHER}'),
('MEASUREMENT_SCHEDULING', 'CANCELLED', '{SUPER_ADMIN, REGION_MANAGER}'),
('MEASUREMENT_SCHEDULED', 'MEASUREMENT_COMPLETED', '{SUPER_ADMIN, ENGINEER, DISPATCHER}'),
('MEASUREMENT_SCHEDULED', 'MEASUREMENT_SCHEDULING', '{SUPER_ADMIN, DISPATCHER}'),
('MEASUREMENT_SCHEDULED', 'PAUSED', '{SUPER_ADMIN, DISPATCHER}'),
('MEASUREMENT_SCHEDULED', 'CANCELLED', '{SUPER_ADMIN, REGION_MANAGER}'),
('MEASUREMENT_COMPLETED', 'ENGINEERING_DESIGN', '{SUPER_ADMIN, ENGINEER}'),
('MEASUREMENT_COMPLETED', 'MEASUREMENT_SCHEDULING', '{SUPER_ADMIN, ENGINEER, DISPATCHER}'),
('MEASUREMENT_COMPLETED', 'PAUSED', '{SUPER_ADMIN, DISPATCHER}'),
('MEASUREMENT_COMPLETED', 'CANCELLED', '{SUPER_ADMIN, REGION_MANAGER}'),
('ENGINEERING_DESIGN', 'ENGINEERING_NESTING', '{SUPER_ADMIN, ENGINEER}'),
('ENGINEERING_DESIGN', 'CLIENT_APPROVAL', '{SUPER_ADMIN, ENGINEER}'),
('ENGINEERING_DESIGN', 'PAUSED', '{SUPER_ADMIN, DISPATCHER}'),
('ENGINEERING_DESIGN', 'CANCELLED', '{SUPER_ADMIN, REGION_MANAGER}'),
('ENGINEERING_NESTING', 'CLIENT_APPROVAL', '{SUPER_ADMIN, ENGINEER}'),
('ENGINEERING_NESTING', 'PRODUCTION_QUEUE', '{SUPER_ADMIN, ENGINEER}'),
('ENGINEERING_NESTING', 'PAUSED', '{SUPER_ADMIN, DISPATCHER}'),
('ENGINEERING_NESTING', 'CANCELLED', '{SUPER_ADMIN, REGION_MANAGER}'),
('CLIENT_APPROVAL', 'PRODUCTION_QUEUE', '{SUPER_ADMIN, BRANCH_MANAGER}'),
('CLIENT_APPROVAL', 'ENGINEERING_DESIGN', '{SUPER_ADMIN, BRANCH_MANAGER}'),
('CLIENT_APPROVAL', 'PAUSED', '{SUPER_ADMIN, DISPATCHER}'),
('CLIENT_APPROVAL', 'CANCELLED', '{SUPER_ADMIN, REGION_MANAGER}'),
('PRODUCTION_QUEUE', 'IN_PRODUCTION', '{SUPER_ADMIN}'), 
('PRODUCTION_QUEUE', 'PAUSED', '{SUPER_ADMIN, DISPATCHER}'),
('PRODUCTION_QUEUE', 'CANCELLED', '{SUPER_ADMIN, REGION_MANAGER}'),
('IN_PRODUCTION', 'PRODUCTION_COMPLETED', '{SUPER_ADMIN}'),
('IN_PRODUCTION', 'PAUSED', '{SUPER_ADMIN, DISPATCHER}'),
('PRODUCTION_COMPLETED', 'INSTALLATION_SCHEDULING', '{SUPER_ADMIN, DISPATCHER}'),
('PRODUCTION_COMPLETED', 'COMPLETED', '{SUPER_ADMIN, DISPATCHER}'),
('PRODUCTION_COMPLETED', 'PAUSED', '{SUPER_ADMIN, DISPATCHER}'),
('INSTALLATION_SCHEDULING', 'INSTALLATION_SCHEDULED', '{SUPER_ADMIN, DISPATCHER}'),
('INSTALLATION_SCHEDULING', 'PAUSED', '{SUPER_ADMIN, DISPATCHER}'),
('INSTALLATION_SCHEDULING', 'CANCELLED', '{SUPER_ADMIN, REGION_MANAGER}'),
('INSTALLATION_SCHEDULED', 'COMPLETED', '{SUPER_ADMIN, DISPATCHER}'),
('INSTALLATION_SCHEDULED', 'INSTALLATION_SCHEDULING', '{SUPER_ADMIN, DISPATCHER}'),
('INSTALLATION_SCHEDULED', 'PAUSED', '{SUPER_ADMIN, DISPATCHER}'),
('INSTALLATION_SCHEDULED', 'CANCELLED', '{SUPER_ADMIN, REGION_MANAGER}');

-- Missing required fields table
CREATE TABLE public.status_required_fields (
  id serial PRIMARY KEY,
  status text NOT NULL,
  required_table text NOT NULL,
  required_columns text[] NOT NULL
);

INSERT INTO public.status_required_fields (status, required_table, required_columns) VALUES
('NEW', 'order_contacts', '{phone, full_name}'),
('NEW', 'order_addresses', '{city, street}');


-- Main RPC for status change
CREATE OR REPLACE FUNCTION public.change_order_status(p_order_id uuid, p_new_status text, p_reason text DEFAULT NULL)
RETURNS void AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_role text;
  v_has_transition boolean;
  v_threshold numeric;
  v_target_status text := p_new_status;
  
  -- variables for required fields check
  v_req record;
  v_check_query text;
  v_is_valid boolean;
BEGIN
  -- 1. Lock record & get data
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Замовлення не знайдено';
  END IF;

  v_role := public.get_user_role();

  -- 2. Resume from PAUSED
  -- Note: RESUME is not a real status in status_transitions, it is a command to go back to previous_status.
  IF v_order.status = 'PAUSED' AND p_new_status = 'RESUME' THEN
    v_target_status := COALESCE(v_order.previous_status, 'DRAFT');
  END IF;

  -- 3. Skip logic based on order_type
  IF v_order.order_type = 'BY_DRAWING' AND v_target_status = 'MEASUREMENT_SCHEDULING' THEN
    v_target_status := 'ENGINEERING_DESIGN';
  END IF;
  
  IF v_order.order_type = 'NO_INSTALLATION' AND v_target_status = 'INSTALLATION_SCHEDULING' THEN
    v_target_status := 'COMPLETED';
  END IF;

  -- 4. Check transition exists
  IF v_order.status = 'PAUSED' AND p_new_status = 'RESUME' THEN
    v_has_transition := true; 
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.status_transitions 
      WHERE from_status = v_order.status AND to_status = v_target_status 
      AND v_role = ANY(allowed_roles)
    ) INTO v_has_transition;

    IF NOT v_has_transition THEN
      RAISE EXCEPTION 'Перехід % -> % заборонено для ролі %', v_order.status, v_target_status, v_role;
    END IF;
  END IF;

  -- 5. Business Rules: DRAFT -> NEW payment check
  IF v_order.status = 'DRAFT' AND v_target_status = 'NEW' THEN
    SELECT value::numeric INTO v_threshold FROM public.settings WHERE key = 'payment_threshold';
    IF v_order.payment_percent < v_threshold AND NOT v_order.is_credit THEN
      RAISE EXCEPTION 'Неможливо перевести в роботу: оплата % менша за поріг % і це не кредит', v_order.payment_percent, v_threshold;
    END IF;
  END IF;

  -- 6. Check required fields dynamically
  FOR v_req IN SELECT * FROM public.status_required_fields WHERE status = v_target_status LOOP
    FOR i IN 1..array_length(v_req.required_columns, 1) LOOP
      v_check_query := format(
        'SELECT EXISTS(SELECT 1 FROM public.%I WHERE order_id = $1 AND %I IS NOT NULL)', 
        v_req.required_table, 
        v_req.required_columns[i]
      );
      EXECUTE v_check_query INTO v_is_valid USING p_order_id;
      IF NOT v_is_valid THEN
        RAISE EXCEPTION 'Для переходу в % обов’язково заповнити % в %', v_target_status, v_req.required_columns[i], v_req.required_table;
      END IF;
    END LOOP;
  END LOOP;

  -- 7. Update status
  -- Bypass RLS / UPDATE REVOKE since SECURITY DEFINER runs as owner (postgres)
  IF v_target_status = 'PAUSED' THEN
    UPDATE public.orders SET status = v_target_status, previous_status = v_order.status WHERE id = p_order_id;
  ELSE
    UPDATE public.orders SET status = v_target_status WHERE id = p_order_id;
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
