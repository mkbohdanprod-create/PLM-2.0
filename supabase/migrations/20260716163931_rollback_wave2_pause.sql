-- Rollback Wave 2: Повернення до єдиного глобального статусу PAUSED

-- 1. Повертаємо previous_status
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS previous_status text;

-- 2. Видаляємо всі нові PAUSED_* переходи та додаємо глобальні переходи в PAUSED
DO $$
DECLARE
  role_admin text[] := ARRAY['SUPER_ADMIN', 'REGION_MANAGER', 'BRANCH_MANAGER', 'DISPATCHER'];
  role_all text[] := ARRAY['SUPER_ADMIN', 'REGION_MANAGER', 'BRANCH_MANAGER', 'DISPATCHER', 'CONSTRUCTOR'];
BEGIN
  -- Видаляємо всі специфічні PAUSED_*
  DELETE FROM public.status_transitions WHERE to_status LIKE 'PAUSED_%' OR from_status LIKE 'PAUSED_%';

  -- Додаємо переходи в PAUSED з будь-якого етапу
  -- (Для простоти, ми можемо не додавати сотню рядків, а дозволити паузу з будь-якого статусу в RPC,
  -- але зазвичай це було в status_transitions).
  
  -- Попередньо, для PAUSED було правило:
  INSERT INTO public.status_transitions (from_status, to_status, allowed_roles) VALUES
  ('MEASUREMENT_SCHEDULING', 'PAUSED', role_admin),
  ('MEASUREMENT_PRE_SCHEDULED', 'PAUSED', role_admin),
  ('MEASUREMENT_SCHEDULED', 'PAUSED', role_admin),
  ('MEASUREMENT_IN_PROGRESS', 'PAUSED', role_admin),
  ('MEASUREMENT_FINISHED_ON_SITE', 'PAUSED', role_admin),
  ('MEASUREMENT_COMPLETED', 'PAUSED', role_admin),
  ('MEASUREMENT_FAILED', 'PAUSED', role_admin),
  ('MEASUREMENT_CANCELED_BY_MEASURER', 'PAUSED', role_admin),
  ('ENGINEERING_QUEUE', 'PAUSED', role_all),
  ('ENGINEERING_IN_PROGRESS', 'PAUSED', role_all),
  ('CLIENT_APPROVAL', 'PAUSED', role_all),
  ('ENGINEERING_NESTING', 'PAUSED', role_all),
  ('PRODUCTION_QUEUE', 'PAUSED', role_admin),
  ('IN_PRODUCTION', 'PAUSED', ARRAY['SUPER_ADMIN']),
  ('PRODUCTION_COMPLETED', 'PAUSED', role_admin),
  ('INSTALLATION_SCHEDULING', 'PAUSED', role_admin),
  ('INSTALLATION_SCHEDULED', 'PAUSED', role_admin),
  ('INSTALLATION_IN_PROGRESS', 'PAUSED', role_admin),
  ('INSTALLATION_FINISHED_ON_SITE', 'PAUSED', role_admin),
  ('INSTALLATION_COMPLETED', 'PAUSED', role_admin),
  ('INSTALLATION_FAILED', 'PAUSED', role_admin),
  ('INSTALLATION_RECLAMATION', 'PAUSED', role_admin),
  ('DELIVERY_SCHEDULING', 'PAUSED', role_admin),
  ('DELIVERY_IN_TRANSIT', 'PAUSED', role_admin),
  ('READY_FOR_PICKUP', 'PAUSED', role_admin)
  ON CONFLICT DO NOTHING;

END $$;

-- 3. Оновлюємо generated column `macro_stage`
-- Зважаючи на те, що PAUSED - це статус, ми повинні використовувати previous_status, щоб знайти макро-етап,
-- АЛЕ generated column не може використовувати інші колонки (вони можуть бути null або ми можемо хотіти просто бачити 'PAUSE').
-- За домовленістю: 'PAUSE' буде окремим макро-етапом.
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

-- 4. Оновлюємо RPC `change_order_status`
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

  -- Перевірка причин паузи / скасування
  IF p_reason_id IS NOT NULL THEN
    IF v_target_status = 'PAUSED' AND NOT EXISTS (SELECT 1 FROM public.pause_reasons WHERE id = p_reason_id) THEN
      RAISE EXCEPTION 'Invalid pause_reason_id';
    END IF;
    IF v_target_status = 'CANCELLED' AND NOT EXISTS (SELECT 1 FROM public.cancel_reasons WHERE id = p_reason_id) THEN
      RAISE EXCEPTION 'Invalid cancel_reason_id';
    END IF;
  END IF;

  -- Оновлення замовлення
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
  
  -- Запис в аудит-лог
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
