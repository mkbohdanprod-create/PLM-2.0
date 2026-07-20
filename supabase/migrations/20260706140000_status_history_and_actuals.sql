-- 20260706140000_status_history_and_actuals.sql

BEGIN;



-- 2. Create order_status_history
CREATE TABLE public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES auth.users(id),
  source text NOT NULL DEFAULT 'UI',
  reason text,
  reason_id uuid,
  metadata jsonb
);

CREATE INDEX idx_status_history_order ON public.order_status_history(order_id, changed_at DESC);

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Select status_history" ON public.order_status_history 
  FOR SELECT USING (public.can_access_order(order_id));
-- Забороняємо INSERT/UPDATE/DELETE для всіх, крім SECURITY DEFINER функцій.

-- 3. Alter orders
ALTER TABLE public.orders ADD COLUMN entered_measurement_pool_at timestamptz;

-- 4. Alter measurement_tasks
ALTER TABLE public.measurement_tasks 
  ADD COLUMN actual_start_time timestamptz,
  ADD COLUMN actual_end_time timestamptz,
  ADD COLUMN outcome text CHECK (outcome IN ('SCHEDULED', 'IN_PROGRESS', 'SUCCESS', 'FAILED_TRIP', 'CANCELLED_BY_CLIENT', 'CANCELLED_BY_DISPATCHER')) DEFAULT 'SCHEDULED',
  ADD COLUMN failure_reason text;

-- 5. Update change_order_status
DROP FUNCTION IF EXISTS public.change_order_status(uuid, text);
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
      v_target_status := 'NEW';
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

  -- Перевірка обов'язкових полів (крім PAUSED, CANCELLED)
  IF v_target_status NOT IN ('PAUSED', 'CANCELLED') THEN
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

-- 6. Оновлюємо unassign_measurement (Soft Delete)
CREATE OR REPLACE FUNCTION public.unassign_measurement(
  p_order_id uuid
) RETURNS void AS $$
DECLARE
  v_status text;
BEGIN
  -- Робимо скасування, щоб залишилась історія
  UPDATE public.measurement_tasks 
  SET outcome = 'CANCELLED_BY_DISPATCHER' 
  WHERE order_id = p_order_id AND outcome = 'SCHEDULED';

  -- Якщо статус MEASUREMENT_SCHEDULED, повертаємо в MEASUREMENT_SCHEDULING
  SELECT status INTO v_status FROM public.orders WHERE id = p_order_id;
  IF v_status = 'MEASUREMENT_SCHEDULED' THEN
    PERFORM public.change_order_status(p_order_id, 'MEASUREMENT_SCHEDULING');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Backfill
INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_at, source)
SELECT id, NULL, status, created_at, 'BACKFILL' FROM public.orders;

COMMIT;
