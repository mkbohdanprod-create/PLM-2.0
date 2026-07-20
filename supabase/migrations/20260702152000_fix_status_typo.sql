-- 20260702152000_fix_status_typo.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.assign_measurement(
  p_order_id uuid,
  p_measurer_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time,
  p_estimated_travel_time integer DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_status text;
  v_task_id uuid;
BEGIN
  -- Перевірка чи замовлення існує
  SELECT status INTO v_status FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Якщо воно NEW, потрібно спочатку змінити на MEASUREMENT_SCHEDULING
  IF v_status = 'NEW' THEN
    PERFORM public.change_order_status(p_order_id, 'MEASUREMENT_SCHEDULING');
  END IF;

  -- Перевірити чи є вже призначення
  SELECT id INTO v_task_id FROM public.measurement_tasks WHERE order_id = p_order_id;

  IF v_task_id IS NOT NULL THEN
    -- UPDATE (Перенесення)
    UPDATE public.measurement_tasks 
    SET measurer_id = p_measurer_id,
        scheduled_date = p_date,
        start_time = p_start_time,
        end_time = p_end_time,
        estimated_travel_time_mins = p_estimated_travel_time
    WHERE id = v_task_id;
  ELSE
    -- INSERT (Нове призначення)
    INSERT INTO public.measurement_tasks (order_id, measurer_id, scheduled_date, start_time, end_time, estimated_travel_time_mins)
    VALUES (p_order_id, p_measurer_id, p_date, p_start_time, p_end_time, p_estimated_travel_time);
  END IF;

  -- Змінюємо статус замовлення на MEASUREMENT_SCHEDULED (якщо воно ще не там)
  SELECT status INTO v_status FROM public.orders WHERE id = p_order_id;
  IF v_status = 'MEASUREMENT_SCHEDULING' THEN
    PERFORM public.change_order_status(p_order_id, 'MEASUREMENT_SCHEDULED');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.unassign_measurement(
  p_order_id uuid
) RETURNS void AS $$
DECLARE
  v_status text;
BEGIN
  -- Видаляємо призначення
  DELETE FROM public.measurement_tasks WHERE order_id = p_order_id;

  -- Якщо статус MEASUREMENT_SCHEDULED, повертаємо в MEASUREMENT_SCHEDULING
  SELECT status INTO v_status FROM public.orders WHERE id = p_order_id;
  IF v_status = 'MEASUREMENT_SCHEDULED' THEN
    PERFORM public.change_order_status(p_order_id, 'MEASUREMENT_SCHEDULING');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
