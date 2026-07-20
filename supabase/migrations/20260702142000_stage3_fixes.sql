-- 20260702142000_stage3_fixes.sql

-- 1. Modify assign_measurement to handle upsert (rescheduling)
CREATE OR REPLACE FUNCTION public.assign_measurement(
  p_order_id uuid,
  p_measurer_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time
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
    PERFORM public.update_order_status(p_order_id, 'MEASUREMENT_SCHEDULING');
  END IF;

  -- Перевірити чи є вже призначення
  SELECT id INTO v_task_id FROM public.measurement_tasks WHERE order_id = p_order_id;

  IF v_task_id IS NOT NULL THEN
    -- UPDATE (Перенесення)
    UPDATE public.measurement_tasks 
    SET measurer_id = p_measurer_id,
        scheduled_date = p_date,
        start_time = p_start_time,
        end_time = p_end_time
    WHERE id = v_task_id;
  ELSE
    -- INSERT (Нове призначення)
    INSERT INTO public.measurement_tasks (order_id, measurer_id, scheduled_date, start_time, end_time)
    VALUES (p_order_id, p_measurer_id, p_date, p_start_time, p_end_time);
  END IF;

  -- Змінюємо статус замовлення на MEASUREMENT_SCHEDULED (якщо воно ще не там)
  SELECT status INTO v_status FROM public.orders WHERE id = p_order_id;
  IF v_status = 'MEASUREMENT_SCHEDULING' THEN
    PERFORM public.update_order_status(p_order_id, 'MEASUREMENT_SCHEDULED');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Create unassign_measurement
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
    -- Тимчасово відключаємо жорстку перевірку (або викликаємо update_order_status)
    -- Оскільки update_order_status перевіряє переходи, а у нас може не бути переходу назад
    -- Давайте перевіримо order_state_machine. 
    -- MEASUREMENT_SCHEDULED -> MEASUREMENT_SCHEDULING (Скасування / перенос заміру) - дозволений перехід.
    PERFORM public.update_order_status(p_order_id, 'MEASUREMENT_SCHEDULING');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
