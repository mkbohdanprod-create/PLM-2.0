-- 1. Create table webhook_events
CREATE TABLE IF NOT EXISTS public.webhook_events (
  idempotency_key uuid PRIMARY KEY,
  source text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz DEFAULT now()
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- 2. Add `internal_target_date` to orders if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'internal_target_date') THEN
        ALTER TABLE public.orders ADD COLUMN internal_target_date date;
    END IF;
END $$;

-- 3. Add new enum values to order_status
-- Removed because status is just TEXT, checked by trigger.

-- 4. Update status_transitions
-- Measurement
INSERT INTO public.status_transitions (from_status, to_status, allowed_roles) VALUES
  ('MEASUREMENT_SCHEDULED', 'MEASUREMENT_IN_PROGRESS', ARRAY['SUPER_ADMIN', 'REGION_MANAGER', 'BRANCH_MANAGER', 'DISPATCHER', 'MEASURER']),
  ('MEASUREMENT_IN_PROGRESS', 'MEASUREMENT_FINISHED_ON_SITE', ARRAY['SUPER_ADMIN', 'REGION_MANAGER', 'BRANCH_MANAGER', 'DISPATCHER', 'MEASURER']),
  ('MEASUREMENT_FINISHED_ON_SITE', 'MEASUREMENT_COMPLETED', ARRAY['SUPER_ADMIN', 'REGION_MANAGER', 'BRANCH_MANAGER', 'DISPATCHER', 'MEASURER']),
  ('MEASUREMENT_SCHEDULED', 'MEASUREMENT_FAILED', ARRAY['SUPER_ADMIN', 'REGION_MANAGER', 'BRANCH_MANAGER', 'DISPATCHER']),
  ('MEASUREMENT_SCHEDULED', 'MEASUREMENT_CANCELED_BY_MEASURER', ARRAY['SUPER_ADMIN', 'REGION_MANAGER', 'BRANCH_MANAGER', 'DISPATCHER']),
  ('MEASUREMENT_CANCELED_BY_MEASURER', 'MEASUREMENT_SCHEDULING', ARRAY['SUPER_ADMIN', 'REGION_MANAGER', 'BRANCH_MANAGER', 'DISPATCHER']),
  ('MEASUREMENT_FAILED', 'MEASUREMENT_SCHEDULING', ARRAY['SUPER_ADMIN', 'REGION_MANAGER', 'BRANCH_MANAGER', 'DISPATCHER'])
ON CONFLICT DO NOTHING;

-- Installation
INSERT INTO public.status_transitions (from_status, to_status, allowed_roles) VALUES
  ('INSTALLATION_SCHEDULED', 'INSTALLATION_IN_PROGRESS', ARRAY['SUPER_ADMIN', 'REGION_MANAGER', 'BRANCH_MANAGER', 'DISPATCHER', 'INSTALLER']),
  ('INSTALLATION_IN_PROGRESS', 'INSTALLATION_FINISHED_ON_SITE', ARRAY['SUPER_ADMIN', 'REGION_MANAGER', 'BRANCH_MANAGER', 'DISPATCHER', 'INSTALLER']),
  ('INSTALLATION_FINISHED_ON_SITE', 'INSTALLATION_COMPLETED', ARRAY['SUPER_ADMIN', 'REGION_MANAGER', 'BRANCH_MANAGER', 'DISPATCHER', 'INSTALLER']),
  ('INSTALLATION_SCHEDULED', 'INSTALLATION_FAILED', ARRAY['SUPER_ADMIN', 'REGION_MANAGER', 'BRANCH_MANAGER', 'DISPATCHER']),
  ('INSTALLATION_FAILED', 'INSTALLATION_SCHEDULING', ARRAY['SUPER_ADMIN', 'REGION_MANAGER', 'BRANCH_MANAGER', 'DISPATCHER'])
ON CONFLICT DO NOTHING;

-- 5. RPC change_order_status
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

-- 6. RPC appsheet_webhook_update
CREATE OR REPLACE FUNCTION public.appsheet_webhook_update(
  p_idempotency_key uuid,
  p_task_id uuid,
  p_new_status text,
  p_lat numeric,
  p_lng numeric,
  p_comment text,
  p_timestamp timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_order_id uuid;
  v_task_outcome text;
BEGIN
  -- Перевірка ідемпотентності
  IF EXISTS (SELECT 1 FROM public.webhook_events WHERE idempotency_key = p_idempotency_key) THEN
    RETURN true; -- Вже оброблено
  END IF;

  -- Знаходимо завдання та замовлення
  SELECT order_id, outcome INTO v_order_id, v_task_outcome
  FROM public.measurement_tasks
  WHERE id = p_task_id;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  -- Встановлюємо app.source для аудит-логу
  PERFORM set_config('app.source', 'AppSheet', true);

  -- Записуємо подію
  INSERT INTO public.webhook_events(idempotency_key, source, payload)
  VALUES (
    p_idempotency_key, 
    'AppSheet', 
    jsonb_build_object('task_id', p_task_id, 'new_status', p_new_status, 'lat', p_lat, 'lng', p_lng, 'comment', p_comment, 'timestamp', p_timestamp)
  );

  -- Оновлюємо статус завдання
  UPDATE public.measurement_tasks
  SET outcome = CASE 
                  WHEN p_new_status IN ('MEASUREMENT_IN_PROGRESS', 'INSTALLATION_IN_PROGRESS') THEN 'IN_PROGRESS'
                  WHEN p_new_status IN ('MEASUREMENT_FINISHED_ON_SITE', 'MEASUREMENT_COMPLETED', 'INSTALLATION_FINISHED_ON_SITE', 'INSTALLATION_COMPLETED') THEN 'COMPLETED'
                  ELSE outcome
                END
  WHERE id = p_task_id;

  -- Викликаємо change_order_status
  PERFORM public.change_order_status(
    p_order_id := v_order_id,
    p_new_status := p_new_status,
    p_reason := p_comment
  );

  RETURN true;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.appsheet_webhook_update(uuid, uuid, text, numeric, numeric, text, timestamptz) FROM public, authenticated;
GRANT EXECUTE ON FUNCTION public.appsheet_webhook_update(uuid, uuid, text, numeric, numeric, text, timestamptz) TO service_role;
