-- Fix order_status_history created_at column name error in change_order_status
CREATE OR REPLACE FUNCTION public.change_order_status(
  p_order_id uuid,
  p_new_status text,
  p_reason text DEFAULT NULL::text,
  p_reason_id uuid DEFAULT NULL::uuid,
  p_planned_call_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_call_comment text DEFAULT NULL::text
) RETURNS boolean AS $$
DECLARE
  v_current_status text;
  v_is_incomplete boolean;
  v_role text;
  v_target_status text;
  v_auto_status text := NULL;
  v_previous_status text;
  v_is_reclamation_frozen boolean;
  
  -- Variables for SLA shift
  v_pause_start timestamptz;
  v_pause_reason text;
  v_days_shifted int := 0;
BEGIN
  SELECT status, is_incomplete, previous_status, is_reclamation_frozen 
  INTO v_current_status, v_is_incomplete, v_previous_status, v_is_reclamation_frozen
  FROM public.orders WHERE id = p_order_id FOR UPDATE;
  
  v_role := COALESCE(public.get_user_role(), 'UNKNOWN');
  v_target_status := p_new_status;

  -- Block closing frozen orders or orders with active reclamations
  IF p_new_status = 'COMPLETED' THEN
    IF v_is_reclamation_frozen = true THEN
       RAISE EXCEPTION 'Cannot complete order: frozen by reclamation';
    END IF;
    IF EXISTS (
       SELECT 1 FROM public.orders 
       WHERE parent_order_id = p_order_id 
         AND status NOT IN ('COMPLETED', 'CANCELLED')
    ) THEN
       RAISE EXCEPTION 'Cannot complete order: active child reclamations exist';
    END IF;
  END IF;

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
    v_target_status := COALESCE(v_previous_status, CASE WHEN (SELECT order_type FROM public.orders WHERE id = p_order_id) = 'BY_DRAWING' THEN 'ENGINEERING_QUEUE' ELSE 'MEASUREMENT_SCHEDULING' END);
    
    -- Зсув SLA (Таймлайни 1, 2, 3), якщо була пауза через вину клієнта
    SELECT changed_at, reason INTO v_pause_start, v_pause_reason
    FROM public.order_status_history
    WHERE order_id = p_order_id AND to_status = 'PAUSED'
    ORDER BY changed_at DESC LIMIT 1;
    
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

  -- Авто-переходи для FAILED та CANCELED
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
