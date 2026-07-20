const fs = require('fs');

let baseFuncs = fs.readFileSync('wave4_base_funcs.sql', 'utf8');

// The file contains drops and creates. We will append the custom logic.
let newFuncs = `
-- Drop existing signatures
DROP FUNCTION IF EXISTS public.create_order(text,uuid,text,text,text,text,text,text,text,numeric,boolean);
DROP FUNCTION IF EXISTS public.create_order(text,uuid,text,text,text,text,text,text,text,numeric,boolean,numeric,numeric,date,date,date,date);
DROP FUNCTION IF EXISTS public.change_order_status(uuid,text,text,uuid,timestamp with time zone,text);
DROP FUNCTION IF EXISTS public.change_order_status(uuid,text,text,uuid);

` + baseFuncs;

// For create_order (both versions)
newFuncs = newFuncs.replace(
  /RETURN json_build_object\('success', true, 'order_id', v_order_id\);/g,
  `IF v_initial_status = 'MEASUREMENT_SCHEDULING' THEN
    PERFORM public.create_activity(v_order_id, 'CALL', now() + interval '4 hours', 'Перший контакт', 'Нове замовлення', 'DISPATCHER');
  END IF;
  RETURN json_build_object('success', true, 'order_id', v_order_id);`
);

// For change_order_status
// Let's insert the activity logic before UPDATE public.orders
newFuncs = newFuncs.replace(
  /-- Фізичне оновлення замовлення/,
  `-- Логіка активностей (Хвиля 4)
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

  IF v_target_status = 'PAUSED' OR v_target_status LIKE 'PAUSED\\_%' THEN
    UPDATE public.order_activities
    SET status = 'CANCELLED', outcome_notes = 'Пауза: ' || COALESCE(p_reason, ''), completed_at = now()
    WHERE order_id = p_order_id AND status = 'PENDING' AND activity_type = 'CALL';
    
    IF p_planned_call_date IS NOT NULL THEN
      PERFORM public.create_activity(p_order_id, 'CALL', p_planned_call_date - interval '1 day', 'Контроль паузи', COALESCE(p_call_comment, 'Автоматичне нагадування по паузі'), 'DISPATCHER');
    END IF;
  END IF;

  -- Фізичне оновлення замовлення`
);

fs.writeFileSync('wave4_activities_triggers.sql', newFuncs);
