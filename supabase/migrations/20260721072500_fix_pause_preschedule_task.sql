CREATE OR REPLACE FUNCTION public.pause_order_with_preschedule(p_order_id uuid, p_reason text, p_reason_id uuid, p_planned_call_date timestamp with time zone, p_call_comment text, p_pre_scheduled_date date)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- If a pre-scheduled date is provided, cancel existing tasks and create a new one without a measurer
  IF p_pre_scheduled_date IS NOT NULL THEN
    -- Cancel existing active tasks
    UPDATE public.measurement_tasks
    SET outcome = 'CANCELLED_BY_DISPATCHER'
    WHERE order_id = p_order_id AND outcome IN ('SCHEDULED', 'IN_PROGRESS');

    -- Create new task assigned to "Без замірника" (measurer_id = NULL)
    -- We must provide start_time and end_time as they are NOT NULL. Defaulting to 09:00 - 10:00
    INSERT INTO public.measurement_tasks (
      order_id, measurer_id, scheduled_date, start_time, end_time, outcome
    ) VALUES (
      p_order_id, NULL, p_pre_scheduled_date, '09:00:00', '10:00:00', 'SCHEDULED'
    );
  END IF;

  -- Call the existing state machine change
  RETURN public.change_order_status(
    p_order_id,
    'PAUSED',
    p_reason,
    p_reason_id,
    p_planned_call_date,
    p_call_comment
  );
END;
$function$;
