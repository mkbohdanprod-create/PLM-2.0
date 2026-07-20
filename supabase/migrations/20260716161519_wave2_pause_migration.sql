-- Хвиля 2: Міграція Паузи та Двошарова Модель Статусів

-- 1. Видалення старих записів PAUSED з orders (0 записів на момент міграції, але для консистентності)
DELETE FROM public.orders WHERE status = 'PAUSED';

-- 2. Видалення старих переходів з/на PAUSED
DELETE FROM public.status_transitions WHERE to_status = 'PAUSED' OR from_status = 'PAUSED';

-- 3. Додавання нових переходів для PAUSED_* для кожного макро-етапу
DO $$
DECLARE
  role_admin text[] := ARRAY['SUPER_ADMIN', 'REGION_MANAGER', 'BRANCH_MANAGER', 'DISPATCHER'];
  role_all text[] := ARRAY['SUPER_ADMIN', 'REGION_MANAGER', 'BRANCH_MANAGER', 'DISPATCHER', 'CONSTRUCTOR'];
BEGIN
  -- MEASUREMENT transitions
  INSERT INTO public.status_transitions (from_status, to_status, allowed_roles) VALUES
  ('MEASUREMENT_SCHEDULING', 'PAUSED_MEASUREMENT', role_admin),
  ('MEASUREMENT_PRE_SCHEDULED', 'PAUSED_MEASUREMENT', role_admin),
  ('MEASUREMENT_SCHEDULED', 'PAUSED_MEASUREMENT', role_admin),
  ('MEASUREMENT_IN_PROGRESS', 'PAUSED_MEASUREMENT', role_admin),
  ('MEASUREMENT_FINISHED_ON_SITE', 'PAUSED_MEASUREMENT', role_admin),
  ('MEASUREMENT_COMPLETED', 'PAUSED_MEASUREMENT', role_admin),
  ('MEASUREMENT_FAILED', 'PAUSED_MEASUREMENT', role_admin),
  ('MEASUREMENT_CANCELED_BY_MEASURER', 'PAUSED_MEASUREMENT', role_admin),
  ('PAUSED_MEASUREMENT', 'MEASUREMENT_SCHEDULING', role_admin)
  ON CONFLICT DO NOTHING;

  -- ENGINEERING transitions
  INSERT INTO public.status_transitions (from_status, to_status, allowed_roles) VALUES
  ('ENGINEERING_QUEUE', 'PAUSED_ENGINEERING', role_all),
  ('ENGINEERING_IN_PROGRESS', 'PAUSED_ENGINEERING', role_all),
  ('CLIENT_APPROVAL', 'PAUSED_ENGINEERING', role_all),
  ('ENGINEERING_NESTING', 'PAUSED_ENGINEERING', role_all),
  ('PAUSED_ENGINEERING', 'ENGINEERING_QUEUE', role_all)
  ON CONFLICT DO NOTHING;

  -- PRODUCTION transitions
  INSERT INTO public.status_transitions (from_status, to_status, allowed_roles) VALUES
  ('PRODUCTION_QUEUE', 'PAUSED_PRODUCTION', role_admin),
  ('IN_PRODUCTION', 'PAUSED_PRODUCTION', ARRAY['SUPER_ADMIN']), -- Only SUPER_ADMIN can pause active production
  ('PRODUCTION_COMPLETED', 'PAUSED_PRODUCTION', role_admin),
  ('PAUSED_PRODUCTION', 'PRODUCTION_QUEUE', role_admin)
  ON CONFLICT DO NOTHING;

  -- INSTALLATION transitions
  INSERT INTO public.status_transitions (from_status, to_status, allowed_roles) VALUES
  ('INSTALLATION_SCHEDULING', 'PAUSED_INSTALLATION', role_admin),
  ('INSTALLATION_SCHEDULED', 'PAUSED_INSTALLATION', role_admin),
  ('INSTALLATION_IN_PROGRESS', 'PAUSED_INSTALLATION', role_admin),
  ('INSTALLATION_FINISHED_ON_SITE', 'PAUSED_INSTALLATION', role_admin),
  ('INSTALLATION_COMPLETED', 'PAUSED_INSTALLATION', role_admin),
  ('INSTALLATION_FAILED', 'PAUSED_INSTALLATION', role_admin),
  ('INSTALLATION_RECLAMATION', 'PAUSED_INSTALLATION', role_admin),
  ('PAUSED_INSTALLATION', 'INSTALLATION_SCHEDULING', role_admin)
  ON CONFLICT DO NOTHING;

  -- DELIVERY transitions
  INSERT INTO public.status_transitions (from_status, to_status, allowed_roles) VALUES
  ('DELIVERY_SCHEDULING', 'PAUSED_DELIVERY', role_admin),
  ('DELIVERY_IN_TRANSIT', 'PAUSED_DELIVERY', role_admin),
  ('READY_FOR_PICKUP', 'PAUSED_DELIVERY', role_admin),
  ('PAUSED_DELIVERY', 'DELIVERY_SCHEDULING', role_admin)
  ON CONFLICT DO NOTHING;
END $$;

-- 4. Створення generated column `macro_stage`
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS macro_stage text GENERATED ALWAYS AS (
  CASE 
    WHEN status LIKE 'MEASUREMENT_%' OR status = 'PAUSED_MEASUREMENT' THEN 'MEASUREMENT'
    WHEN status LIKE 'ENGINEERING_%' OR status = 'CLIENT_APPROVAL' OR status = 'PAUSED_ENGINEERING' THEN 'ENGINEERING'
    WHEN status LIKE 'PRODUCTION_%' OR status = 'IN_PRODUCTION' OR status = 'PAUSED_PRODUCTION' THEN 'MANUFACTURING'
    WHEN status LIKE 'DELIVERY_%' OR status = 'READY_FOR_PICKUP' OR status = 'PAUSED_DELIVERY' THEN 'DELIVERY'
    WHEN status LIKE 'INSTALLATION_%' OR status = 'PAUSED_INSTALLATION' THEN 'INSTALLATION'
    WHEN status IN ('COMPLETED', 'CLOSED') THEN 'CLOSING'
    WHEN status = 'CANCELLED' THEN 'CANCELLED'
    ELSE 'UNKNOWN'
  END
) STORED;

-- 5. Видалення колонки previous_status
ALTER TABLE public.orders DROP COLUMN IF EXISTS previous_status;

-- 6. Оновлення RPC `change_order_status` (видалення `RESUME` і `previous_status`)
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
BEGIN
  SELECT status, is_incomplete INTO v_current_status, v_is_incomplete 
  FROM public.orders WHERE id = p_order_id FOR UPDATE;
  
  v_role := COALESCE(public.get_user_role(), 'UNKNOWN');
  
  IF v_current_status = p_new_status THEN
    RETURN true;
  END IF;

  -- Перевірка легальності переходу через матрицю статусів
  IF v_role != 'SUPER_ADMIN' AND NOT EXISTS (
    SELECT 1 FROM public.status_transitions 
    WHERE from_status = v_current_status AND to_status = p_new_status AND v_role = ANY(allowed_roles)
  ) THEN
    RAISE EXCEPTION 'Transition from % to % not allowed for role %', v_current_status, p_new_status, v_role;
  END IF;

  -- Перевірка причин паузи / скасування
  IF p_reason_id IS NOT NULL THEN
    IF p_new_status LIKE 'PAUSED_%' AND NOT EXISTS (SELECT 1 FROM public.pause_reasons WHERE id = p_reason_id) THEN
      RAISE EXCEPTION 'Invalid pause_reason_id';
    END IF;
    IF p_new_status = 'CANCELLED' AND NOT EXISTS (SELECT 1 FROM public.cancel_reasons WHERE id = p_reason_id) THEN
      RAISE EXCEPTION 'Invalid cancel_reason_id';
    END IF;
  END IF;

  -- Оновлення замовлення
  UPDATE public.orders 
  SET status = p_new_status,
      entered_measurement_pool_at = CASE 
        WHEN p_new_status = 'MEASUREMENT_SCHEDULING' THEN COALESCE(entered_measurement_pool_at, now())
        ELSE entered_measurement_pool_at 
      END,
      planned_call_date = CASE 
        WHEN p_planned_call_date IS NOT NULL THEN p_planned_call_date
        WHEN p_new_status = 'MEASUREMENT_SCHEDULING' AND v_current_status != 'MEASUREMENT_SCHEDULING' THEN now()
        ELSE planned_call_date
      END,
      call_comment = CASE 
        WHEN p_planned_call_date IS NOT NULL THEN p_call_comment
        WHEN p_new_status = 'MEASUREMENT_SCHEDULING' AND v_current_status != 'MEASUREMENT_SCHEDULING' THEN 'Потрібен повторний контакт'
        ELSE call_comment
      END,
      updated_at = now()
  WHERE id = p_order_id;
  
  -- Запис в аудит-лог
  INSERT INTO public.order_status_history (
    order_id, from_status, to_status, changed_by, source, reason, reason_id
  ) VALUES (
    p_order_id, v_current_status, p_new_status, auth.uid(), 
    COALESCE(current_setting('app.source', true), 'UI'), 
    p_reason, p_reason_id
  );
  
  RETURN true;
END;
$function$;
