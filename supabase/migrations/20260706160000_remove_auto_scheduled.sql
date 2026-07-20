-- Remove automatic transition to MEASUREMENT_SCHEDULED in assign_measurement
-- This enables flexible drag-and-drop planning without instantly locking the order.

CREATE OR REPLACE FUNCTION public.assign_measurement(
  p_order_id uuid,
  p_measurer_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time,
  p_estimated_travel_time integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status text;
  v_task_id uuid;
BEGIN
  -- Перевірка чи замовлення існує
  SELECT status INTO v_status FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Якщо воно NEW, потрібно спочатку змінити на MEASUREMENT_SCHEDULING (хоча NEW вже deprecated, залишаємо для зворотної сумісності)
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

  -- Ми БІЛЬШЕ НЕ змінюємо автоматично статус на MEASUREMENT_SCHEDULED!
  -- Картка залишається в MEASUREMENT_SCHEDULING, щоб її можна було перетягувати.
  -- Перехід у MEASUREMENT_SCHEDULED робить диспетчер кнопкою "Зафіксувати".
END;
$$;
