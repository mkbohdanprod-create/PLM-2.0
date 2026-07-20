-- 1. Revert assign_measurement to ALWAYS set MEASUREMENT_PRE_SCHEDULED
CREATE OR REPLACE FUNCTION public.assign_measurement(p_order_id uuid, p_measurer_id uuid, p_date date, p_start_time time without time zone, p_end_time time without time zone, p_estimated_travel_time integer DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_status text;
  v_task_id uuid;
  v_target_datetime timestamptz;
BEGIN
  SELECT status INTO v_status FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  v_target_datetime := p_date + p_start_time;

  SELECT id INTO v_task_id FROM public.measurement_tasks 
  WHERE order_id = p_order_id AND outcome IN ('SCHEDULED', 'IN_PROGRESS')
  ORDER BY created_at DESC LIMIT 1;

  IF v_task_id IS NOT NULL THEN
    UPDATE public.measurement_tasks
    SET measurer_id = p_measurer_id,
        scheduled_date = p_date,
        start_time = p_start_time,
        end_time = p_end_time,
        estimated_travel_time_mins = p_estimated_travel_time
    WHERE id = v_task_id;
  ELSE
    INSERT INTO public.measurement_tasks (order_id, measurer_id, scheduled_date, start_time, end_time, estimated_travel_time_mins, outcome)
    VALUES (p_order_id, p_measurer_id, p_date, p_start_time, p_end_time, p_estimated_travel_time, 'SCHEDULED');
  END IF;
  
  -- The business rule: ANY drag to the calendar (assigned or unassigned) puts the order in PRE_SCHEDULED.
  -- It ONLY becomes SCHEDULED when the dispatcher explicitly clicks 'Зафіксувати' in the UI.
  PERFORM public.change_order_status(p_order_id, 'MEASUREMENT_PRE_SCHEDULED');

  -- Update additional fields
  UPDATE public.orders 
  SET planned_call_date = v_target_datetime - interval '1 day',
      call_comment = 'Нагадування клієнту перед виїздом'
  WHERE id = p_order_id;

END;
$function$;
