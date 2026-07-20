CREATE OR REPLACE FUNCTION public.assign_measurement(p_order_id uuid, p_measurer_id uuid, p_date date, p_start_time time without time zone, p_end_time time without time zone, p_estimated_travel_time integer DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_status text;
  v_task_id uuid;
BEGIN
  -- Перевіряємо чи існує замовлення
  SELECT status INTO v_status FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_status = 'NEW' THEN
    PERFORM public.change_order_status(p_order_id, 'MEASUREMENT_SCHEDULING');
  END IF;

  -- Знаходимо АКТИВНИЙ замір (SCHEDULED або IN_PROGRESS)
  SELECT id INTO v_task_id FROM public.measurement_tasks 
  WHERE order_id = p_order_id AND outcome IN ('SCHEDULED', 'IN_PROGRESS')
  ORDER BY created_at DESC LIMIT 1;

  IF v_task_id IS NOT NULL THEN
    -- UPDATE (існуючий активний)
    UPDATE public.measurement_tasks
    SET measurer_id = p_measurer_id,
        scheduled_date = p_date,
        start_time = p_start_time,
        end_time = p_end_time,
        estimated_travel_time_mins = p_estimated_travel_time
    WHERE id = v_task_id;
  ELSE
    -- INSERT (якщо немає активного, навіть якщо є скасовані)
    INSERT INTO public.measurement_tasks (order_id, measurer_id, scheduled_date, start_time, end_time, estimated_travel_time_mins, outcome)
    VALUES (p_order_id, p_measurer_id, p_date, p_start_time, p_end_time, p_estimated_travel_time, 'SCHEDULED');
  END IF;

END;
$function$;
