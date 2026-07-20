
-- Drop existing signatures
DROP FUNCTION IF EXISTS public.create_order(text,uuid,text,text,text,text,text,text,text,numeric,boolean);
DROP FUNCTION IF EXISTS public.create_order(text,uuid,text,text,text,text,text,text,text,numeric,boolean,numeric,numeric,date,date,date,date);
DROP FUNCTION IF EXISTS public.change_order_status(uuid,text,text,uuid,timestamp with time zone,text);
DROP FUNCTION IF EXISTS public.change_order_status(uuid,text,text,uuid);

-- DROP FUNCTION IF EXISTS create_order(text,uuid,text,text,text,text,text,text,text,numeric,boolean);
CREATE OR REPLACE FUNCTION public.create_order(p_external_id text, p_branch_id uuid, p_order_type text, p_full_name text, p_phone text, p_city text, p_street text DEFAULT NULL::text, p_building text DEFAULT NULL::text, p_material text DEFAULT NULL::text, p_area numeric DEFAULT NULL::numeric, p_force boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

  v_planned_call_date := CASE 
    WHEN v_initial_status = 'MEASUREMENT_SCHEDULING' THEN now() + interval '4 hours'
    ELSE NULL
  END;

  INSERT INTO public.orders (
    order_number, external_id, branch_id, status, order_type, is_incomplete, planned_call_date, call_comment
  )
  VALUES (
    'O-' || upper(substr(md5(random()::text), 1, 6)), 
    p_external_id, 
    p_branch_id, 
    v_initial_status, 
    p_order_type, 
    v_is_incomplete,
    v_planned_call_date,
    CASE WHEN v_planned_call_date IS NOT NULL THEN 'Нове замовлення' ELSE NULL END
  )
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

  INSERT INTO public.order_status_history (
    order_id, from_status, to_status, changed_by, source, reason, reason_id
  ) VALUES (
    v_order_id, NULL, v_initial_status, auth.uid(), 
    COALESCE(current_setting('app.source', true), 'API'), 
    NULL, NULL
  );
  
  IF v_initial_status = 'MEASUREMENT_SCHEDULING' THEN
    PERFORM public.create_activity(v_order_id, 'CALL', now() + interval '4 hours', 'Перший контакт', 'Нове замовлення', 'DISPATCHER');
  END IF;
  RETURN json_build_object('success', true, 'order_id', v_order_id);
END;
$function$
;

-- DROP FUNCTION IF EXISTS create_order(text,uuid,text,text,text,text,text,text,text,numeric,boolean,numeric,numeric,date,date,date,date);
CREATE OR REPLACE FUNCTION public.create_order(p_external_id text, p_branch_id uuid, p_order_type text, p_full_name text, p_phone text, p_city text, p_street text DEFAULT NULL::text, p_building text DEFAULT NULL::text, p_material text DEFAULT NULL::text, p_area numeric DEFAULT NULL::numeric, p_force boolean DEFAULT false, p_lat numeric DEFAULT NULL::numeric, p_lng numeric DEFAULT NULL::numeric, p_document_date date DEFAULT NULL::date, p_base_readiness_date date DEFAULT NULL::date, p_payment_date date DEFAULT NULL::date, p_calc_readiness_date date DEFAULT NULL::date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_dup_check json;
  v_order_id uuid;
  v_phone_norm text;
  v_initial_status text;
  v_planned_call_date timestamptz;
  v_is_incomplete boolean;
BEGIN
  v_phone_norm := regexp_replace(p_phone, '[^0-9]', '', 'g');

  IF NOT p_force THEN
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_dup_check 
    FROM public.check_order_duplicates(p_full_name, p_phone, p_city, COALESCE(p_street, ''), COALESCE(p_building, '')) as t;
    
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

  IF p_order_type = 'BY_DRAWING' THEN
    v_initial_status := 'ENGINEERING_DESIGN';
  ELSE
    v_initial_status := 'MEASUREMENT_SCHEDULING';
  END IF;

  v_planned_call_date := CASE 
    WHEN v_initial_status = 'MEASUREMENT_SCHEDULING' THEN now() + interval '4 hours'
    ELSE NULL
  END;

  INSERT INTO public.orders (order_number, external_id, branch_id, status, order_type, is_incomplete, document_date, base_readiness_date, payment_date, calc_readiness_date, planned_call_date, call_comment)
  VALUES ('O-' || upper(substr(md5(random()::text), 1, 6)), p_external_id, p_branch_id, v_initial_status, p_order_type, v_is_incomplete, p_document_date, p_base_readiness_date, p_payment_date, p_calc_readiness_date, v_planned_call_date, CASE WHEN v_planned_call_date IS NOT NULL THEN 'Нове замовлення' ELSE NULL END)
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_contacts (order_id, full_name, phone, phone_normalized)
  VALUES (v_order_id, p_full_name, p_phone, v_phone_norm);

  IF p_street IS NOT NULL OR p_city IS NOT NULL THEN
    INSERT INTO public.order_addresses (order_id, city, street, building, lat, lng)
    VALUES (v_order_id, COALESCE(p_city, ''), COALESCE(p_street, ''), COALESCE(p_building, ''), p_lat, p_lng);
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

  -- Trigger is_incomplete check
  UPDATE public.orders SET id = id WHERE id = v_order_id;

  IF v_initial_status = 'MEASUREMENT_SCHEDULING' THEN
    PERFORM public.create_activity(v_order_id, 'CALL', now() + interval '4 hours', 'Перший контакт', 'Нове замовлення', 'DISPATCHER');
  END IF;
  RETURN json_build_object('success', true, 'order_id', v_order_id);
END;
$function$
;

-- DROP FUNCTION IF EXISTS change_order_status(uuid,text,text,uuid,timestamp with time zone,text);
CREATE OR REPLACE FUNCTION public.change_order_status(p_order_id uuid, p_new_status text, p_reason text DEFAULT NULL::text, p_reason_id uuid DEFAULT NULL::uuid, p_planned_call_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_call_comment text DEFAULT NULL::text)
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
  v_order_number text;
BEGIN
  SELECT status, is_incomplete, previous_status, order_number INTO v_current_status, v_is_incomplete, v_previous_status, v_order_number
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
    SET outcome = 'CANCELLED_BY_DISPATCHER'
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

  -- Логіка активностей (Хвиля 4)
  IF v_target_status IN ('MEASUREMENT_SCHEDULED', 'INSTALLATION_SCHEDULED') THEN
    UPDATE public.order_activities
    SET status = 'CANCELLED', outcome_notes = 'замінена автоматичною при плануванні', completed_at = now()
    WHERE order_id = p_order_id AND status = 'PENDING' AND activity_type = 'CALL';

    -- Створення нової на (дата виїзду - 1 доба)
    DECLARE
      v_task_date timestamptz;
    BEGIN
      IF v_target_status = 'MEASUREMENT_SCHEDULED' THEN
        SELECT scheduled_date INTO v_task_date FROM public.measurement_tasks WHERE order_id = p_order_id ORDER BY created_at DESC LIMIT 1;
      ELSE
        SELECT scheduled_date INTO v_task_date FROM public.installation_tasks WHERE order_id = p_order_id ORDER BY created_at DESC LIMIT 1;
      END IF;
      
      IF v_task_date IS NOT NULL THEN
        PERFORM public.create_activity(p_order_id, 'CALL', v_task_date - interval '1 day', 'Контроль перед виїздом', 'Автоматичне нагадування', 'DISPATCHER');
      END IF;
    END;
  END IF;

  IF v_target_status = 'PAUSED' OR v_target_status LIKE 'PAUSED\_%' THEN
    UPDATE public.order_activities
    SET status = 'CANCELLED', outcome_notes = 'Пауза: ' || COALESCE(p_reason, ''), completed_at = now()
    WHERE order_id = p_order_id AND status = 'PENDING' AND activity_type = 'CALL';
    
    IF p_planned_call_date IS NOT NULL THEN
      PERFORM public.create_activity(p_order_id, 'CALL', p_planned_call_date - interval '1 day', 'Контроль паузи', COALESCE(p_call_comment, 'Автоматичне нагадування по паузі'), 'DISPATCHER');
    ELSE
      PERFORM public.create_activity(p_order_id, 'CALL', now() + interval '3 days', 'Уточнити дату повернення з паузи для замовлення ' || v_order_number, 'Сирота-пауза (без дати)', 'DISPATCHER');
    END IF;
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
$function$
;

