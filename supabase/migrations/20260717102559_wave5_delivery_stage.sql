-- Migration: Wave 5 Delivery Stage

-- 1. ADD NEW STATUSES TO ENUM
-- No ENUM for status, statuses are validated by status_transitions table

-- 2. CREATE VEHICLES TABLE
CREATE TABLE IF NOT EXISTS public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  plate_number text,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  is_hidden boolean DEFAULT false
);

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to vehicles for users in the same branch"
  ON public.vehicles FOR SELECT
  USING (
    branch_id = (SELECT branch_id FROM public.profiles WHERE id = auth.uid()) OR
    public.get_user_role() = 'SUPER_ADMIN'
  );

-- 3. CREATE DELIVERY TASKS TABLE
CREATE TABLE IF NOT EXISTS public.delivery_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  scheduled_date timestamptz,
  outcome text CHECK (outcome IN ('SCHEDULED', 'IN_PROGRESS', 'DELIVERED', 'FAILED', 'CANCELLED_BY_DISPATCHER')) DEFAULT 'SCHEDULED',
  route_order int,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.delivery_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to delivery tasks for users in the same branch"
  ON public.delivery_tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = delivery_tasks.order_id
      AND (
        o.branch_id = (SELECT branch_id FROM public.profiles WHERE id = auth.uid()) OR
        public.get_user_role() = 'SUPER_ADMIN'
      )
    )
  );

-- 4. ALTER ORDERS (ADD delivery_method)
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS delivery_method text CHECK (delivery_method IN ('DELIVERY', 'PICKUP')) DEFAULT 'DELIVERY';

-- Macro Stage is already correctly defined, but let's ensure it's up to date just in case
ALTER TABLE public.orders DROP COLUMN IF EXISTS macro_stage;
ALTER TABLE public.orders ADD COLUMN macro_stage text GENERATED ALWAYS AS (
  CASE
    WHEN status = 'PAUSED' THEN 'PAUSE'
    WHEN status LIKE 'MEASUREMENT_%' THEN 'MEASUREMENT'
    WHEN status LIKE 'ENGINEERING_%' OR status = 'CLIENT_APPROVAL' THEN 'ENGINEERING'
    WHEN status LIKE 'PRODUCTION_%' OR status = 'IN_PRODUCTION' THEN 'MANUFACTURING'
    WHEN status LIKE 'DELIVERY_%' OR status = 'READY_FOR_PICKUP' THEN 'DELIVERY'
    WHEN status LIKE 'INSTALLATION_%' THEN 'INSTALLATION'
    WHEN status IN ('COMPLETED', 'CLOSED') THEN 'CLOSING'
    WHEN status = 'CANCELLED' THEN 'CANCELLED'
    ELSE 'UNKNOWN'
  END
) STORED;

-- 5. UPDATE STATUS TRANSITIONS
-- Ensure we don't insert duplicates
DELETE FROM public.status_transitions WHERE from_status = 'PRODUCTION_COMPLETED' AND to_status IN ('DELIVERY_SCHEDULING', 'READY_FOR_PICKUP');
INSERT INTO public.status_transitions (from_status, to_status, allowed_roles) VALUES
('PRODUCTION_COMPLETED', 'DELIVERY_SCHEDULING', ARRAY['SUPER_ADMIN', 'DISPATCHER', 'MANAGER', 'CONSTRUCTOR']),
('PRODUCTION_COMPLETED', 'READY_FOR_PICKUP', ARRAY['SUPER_ADMIN', 'DISPATCHER', 'MANAGER', 'CONSTRUCTOR']);

DELETE FROM public.status_transitions WHERE from_status = 'DELIVERY_SCHEDULING' AND to_status = 'DELIVERY_IN_TRANSIT';
INSERT INTO public.status_transitions (from_status, to_status, allowed_roles) VALUES
('DELIVERY_SCHEDULING', 'DELIVERY_IN_TRANSIT', ARRAY['SUPER_ADMIN', 'DISPATCHER']);

DELETE FROM public.status_transitions WHERE from_status = 'READY_FOR_PICKUP' AND to_status = 'COMPLETED';
INSERT INTO public.status_transitions (from_status, to_status, allowed_roles) VALUES
('READY_FOR_PICKUP', 'COMPLETED', ARRAY['SUPER_ADMIN', 'DISPATCHER', 'MANAGER']);

DELETE FROM public.status_transitions WHERE from_status = 'DELIVERY_IN_TRANSIT' AND to_status IN ('INSTALLATION_SCHEDULING', 'COMPLETED', 'DELIVERY_SCHEDULING');
INSERT INTO public.status_transitions (from_status, to_status, allowed_roles) VALUES
('DELIVERY_IN_TRANSIT', 'INSTALLATION_SCHEDULING', ARRAY['SUPER_ADMIN', 'DISPATCHER']),
('DELIVERY_IN_TRANSIT', 'COMPLETED', ARRAY['SUPER_ADMIN', 'DISPATCHER']),
('DELIVERY_IN_TRANSIT', 'DELIVERY_SCHEDULING', ARRAY['SUPER_ADMIN', 'DISPATCHER']); -- Regression

-- Pause/Cancel transitions
INSERT INTO public.status_transitions (from_status, to_status, allowed_roles)
SELECT 'DELIVERY_SCHEDULING', 'PAUSED', ARRAY['SUPER_ADMIN', 'DISPATCHER', 'MANAGER']
WHERE NOT EXISTS (SELECT 1 FROM public.status_transitions WHERE from_status = 'DELIVERY_SCHEDULING' AND to_status = 'PAUSED');

INSERT INTO public.status_transitions (from_status, to_status, allowed_roles)
SELECT 'DELIVERY_IN_TRANSIT', 'PAUSED', ARRAY['SUPER_ADMIN', 'DISPATCHER', 'MANAGER']
WHERE NOT EXISTS (SELECT 1 FROM public.status_transitions WHERE from_status = 'DELIVERY_IN_TRANSIT' AND to_status = 'PAUSED');

INSERT INTO public.status_transitions (from_status, to_status, allowed_roles)
SELECT 'READY_FOR_PICKUP', 'PAUSED', ARRAY['SUPER_ADMIN', 'DISPATCHER', 'MANAGER']
WHERE NOT EXISTS (SELECT 1 FROM public.status_transitions WHERE from_status = 'READY_FOR_PICKUP' AND to_status = 'PAUSED');

-- 6. RPC: VEHICLE CRUD (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.create_vehicle(
  p_name text,
  p_plate_number text,
  p_branch_id uuid
) RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Verification
  IF public.get_user_role() NOT IN ('SUPER_ADMIN', 'DISPATCHER') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO public.vehicles (name, plate_number, branch_id)
  VALUES (p_name, p_plate_number, p_branch_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_vehicle(
  p_vehicle_id uuid,
  p_name text,
  p_plate_number text
) RETURNS void AS $$
BEGIN
  IF public.get_user_role() NOT IN ('SUPER_ADMIN', 'DISPATCHER') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.vehicles
  SET name = p_name, plate_number = p_plate_number
  WHERE id = p_vehicle_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.hide_vehicle(
  p_vehicle_id uuid
) RETURNS void AS $$
BEGIN
  IF public.get_user_role() NOT IN ('SUPER_ADMIN', 'DISPATCHER') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.vehicles
  SET is_hidden = true
  WHERE id = p_vehicle_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RPC: DELIVERY TASK MANAGEMENT
CREATE OR REPLACE FUNCTION public.assign_delivery(
  p_order_id uuid,
  p_driver_id uuid,
  p_vehicle_id uuid,
  p_scheduled_date timestamptz,
  p_route_order int DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF (SELECT role FROM public.profiles WHERE id = v_user_id) NOT IN ('SUPER_ADMIN', 'DISPATCHER') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Set context for audit
  PERFORM set_config('app.source', 'assign_delivery', true);

  -- We do not change order status here, only track assignment
  INSERT INTO public.delivery_tasks (order_id, driver_id, vehicle_id, scheduled_date, outcome, route_order)
  VALUES (p_order_id, p_driver_id, p_vehicle_id, p_scheduled_date, 'SCHEDULED', p_route_order);

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.unassign_delivery(
  p_order_id uuid
) RETURNS void AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF (SELECT role FROM public.profiles WHERE id = v_user_id) NOT IN ('SUPER_ADMIN', 'DISPATCHER') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  PERFORM set_config('app.source', 'unassign_delivery', true);

  UPDATE public.delivery_tasks
  SET outcome = 'CANCELLED_BY_DISPATCHER', updated_at = now()
  WHERE order_id = p_order_id AND outcome = 'SCHEDULED';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 8. UPDATE change_order_status
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
  v_auto_status text := NULL;
  v_previous_status text;
  
  -- Variables for SLA shift
  v_pause_start timestamptz;
  v_pause_reason text;
  v_days_shifted int := 0;
BEGIN
  SELECT status, is_incomplete, previous_status INTO v_current_status, v_is_incomplete, v_previous_status
  FROM public.orders WHERE id = p_order_id FOR UPDATE;
  
  v_role := COALESCE(public.get_user_role(), 'UNKNOWN');
  v_target_status := p_new_status;

  -- Автоматична маршрутизація для Хвилі 5 (Доставки)
  IF v_current_status = 'PRODUCTION_COMPLETED' AND p_new_status IN ('DELIVERY_SCHEDULING', 'READY_FOR_PICKUP') THEN
     IF (SELECT delivery_method FROM public.orders WHERE id = p_order_id) = 'PICKUP' THEN
         p_new_status := 'READY_FOR_PICKUP';
         v_target_status := 'READY_FOR_PICKUP';
     ELSE
         p_new_status := 'DELIVERY_SCHEDULING';
         v_target_status := 'DELIVERY_SCHEDULING';
     END IF;
  END IF;

  IF v_current_status = 'DELIVERY_IN_TRANSIT' AND p_new_status IN ('INSTALLATION_SCHEDULING', 'COMPLETED') THEN
     IF (SELECT order_type FROM public.orders WHERE id = p_order_id) = 'NO_INSTALLATION' THEN
         p_new_status := 'COMPLETED';
         v_target_status := 'COMPLETED';
     ELSE
         p_new_status := 'INSTALLATION_SCHEDULING';
         v_target_status := 'INSTALLATION_SCHEDULING';
     END IF;
  END IF;


  
  IF v_current_status = p_new_status THEN
    RETURN true;
  END IF;

  -- Перевірка доступності переходу
  IF v_current_status = 'PAUSED' AND p_new_status = 'RESUME' THEN
    v_target_status := COALESCE(v_previous_status, CASE WHEN (SELECT order_type FROM public.orders WHERE id = p_order_id) = 'BY_DRAWING' THEN 'ENGINEERING_DESIGN' ELSE 'MEASUREMENT_SCHEDULING' END);
    
    -- Зсув SLA (Таймлайни 1, 2, 3), якщо була пауза через вину клієнта
    SELECT created_at, reason INTO v_pause_start, v_pause_reason
    FROM public.order_status_history
    WHERE order_id = p_order_id AND to_status = 'PAUSED'
    ORDER BY created_at DESC LIMIT 1;
    
    IF v_pause_reason = 'CLIENT_FAULT' AND v_pause_start IS NOT NULL THEN
       v_days_shifted := GREATEST(0, (CURRENT_DATE - v_pause_start::date));
       
       IF v_days_shifted > 0 THEN
          UPDATE public.orders
          SET base_readiness_date = base_readiness_date + v_days_shifted,
              calc_readiness_date = calc_readiness_date + v_days_shifted,
              internal_target_date = internal_target_date + v_days_shifted
          WHERE id = p_order_id;
       END IF;
    END IF;

  ELSE
    IF v_role != 'SUPER_ADMIN' AND NOT EXISTS (
      SELECT 1 FROM public.status_transitions 
      WHERE from_status = v_current_status AND to_status = p_new_status AND v_role = ANY(allowed_roles)
    ) THEN
      RAISE EXCEPTION 'Transition from % to % not allowed for role %', v_current_status, p_new_status, v_role;
    END IF;
  END IF;

  -- Перевірка причин паузи / скасування
  IF p_reason_id IS NOT NULL THEN
    IF v_target_status = 'PAUSED' AND NOT EXISTS (SELECT 1 FROM public.pause_reasons WHERE id = p_reason_id) THEN
      RAISE EXCEPTION 'Invalid pause_reason_id';
    END IF;
    IF v_target_status = 'CANCELLED' AND NOT EXISTS (SELECT 1 FROM public.cancel_reasons WHERE id = p_reason_id) THEN
      RAISE EXCEPTION 'Invalid cancel_reason_id';
    END IF;
  END IF;

  -- Авто-переходи для FAILED та CANCELED (Варіант А)
  IF p_new_status = 'MEASUREMENT_FAILED' THEN
    v_auto_status := 'MEASUREMENT_SCHEDULING';
    v_previous_status := NULL;
    p_reason := COALESCE(p_reason, 'CLIENT_FAULT');
  ELSIF p_new_status = 'INSTALLATION_FAILED' THEN
    v_auto_status := 'INSTALLATION_SCHEDULING';
    v_previous_status := NULL;
    p_reason := COALESCE(p_reason, 'CLIENT_FAULT');
  ELSIF p_new_status = 'MEASUREMENT_CANCELED_BY_MEASURER' THEN
    v_auto_status := 'MEASUREMENT_SCHEDULING';
    v_previous_status := NULL;
  END IF;

  -- Скасування старих завдань
  IF p_new_status IN ('MEASUREMENT_FAILED', 'MEASUREMENT_CANCELED_BY_MEASURER') THEN
    UPDATE public.measurement_tasks
    SET outcome = 'CANCELLED'
    WHERE order_id = p_order_id AND outcome IN ('SCHEDULED', 'IN_PROGRESS');
  END IF;

  -- Запис першого переходу (напр., SCHEDULED -> FAILED)
  INSERT INTO public.order_status_history (
    order_id, from_status, to_status, changed_by, source, reason, reason_id
  ) VALUES (
    p_order_id, v_current_status, p_new_status, auth.uid(), 
    COALESCE(current_setting('app.source', true), 'UI'), 
    p_reason, p_reason_id
  );

  -- Якщо є авто-перехід (напр. FAILED -> PAUSED), записуємо і його
  IF v_auto_status IS NOT NULL THEN
    INSERT INTO public.order_status_history (
      order_id, from_status, to_status, changed_by, source, reason, reason_id
    ) VALUES (
      p_order_id, p_new_status, v_auto_status, auth.uid(), 
      COALESCE(current_setting('app.source', true), 'UI'), 
      p_reason, p_reason_id
    );
    v_target_status := v_auto_status;
  END IF;

  -- Фізичне оновлення замовлення
  UPDATE public.orders 
  SET status = v_target_status,
      previous_status = CASE 
        WHEN v_target_status = 'PAUSED' THEN COALESCE(v_previous_status, v_current_status)
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
  
  RETURN true;
END;
$function$;


-- 9. Trigger: Auto CALL activity on DELIVERY_SCHEDULING
CREATE OR REPLACE FUNCTION public.trg_auto_call_delivery()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'DELIVERY_SCHEDULING' AND OLD.status != 'DELIVERY_SCHEDULING' THEN
    INSERT INTO public.order_activities (order_id, activity_type, title, planned_at, assigned_to_role, status)
    VALUES (NEW.id, 'CALL', 'Зателефонувати для планування доставки', now() + interval '4 hours', 'DISPATCHER', 'PENDING');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_auto_call_delivery ON public.orders;
CREATE TRIGGER trigger_auto_call_delivery
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_auto_call_delivery();
