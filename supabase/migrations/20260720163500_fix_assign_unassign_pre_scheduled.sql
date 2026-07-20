-- 1. Fix assign_measurement to correctly set MEASUREMENT_PRE_SCHEDULED vs MEASUREMENT_SCHEDULED
CREATE OR REPLACE FUNCTION public.assign_measurement(p_order_id uuid, p_measurer_id uuid, p_date date, p_start_time time without time zone, p_end_time time without time zone, p_estimated_travel_time integer DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_status text;
  v_task_id uuid;
  v_target_datetime timestamptz;
  v_new_status text;
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
  
  -- Determine new status based on measurer assignment
  IF p_measurer_id IS NULL THEN
    v_new_status := 'MEASUREMENT_PRE_SCHEDULED';
  ELSE
    v_new_status := 'MEASUREMENT_SCHEDULED';
  END IF;

  -- Update order status via change_order_status if possible, or directly to avoid transition checks if they fail, but change_order_status is better.
  -- To be safe, we update the status directly and let the triggers handle it, OR we just use change_order_status.
  -- Let's use direct update here since we are forcing it from an RPC, but change_order_status creates history.
  -- So we use change_order_status!
  PERFORM public.change_order_status(p_order_id, v_new_status);

  -- Update additional fields
  UPDATE public.orders 
  SET planned_call_date = v_target_datetime - interval '1 day',
      call_comment = 'Нагадування клієнту перед виїздом'
  WHERE id = p_order_id;

END;
$function$;

-- 2. Ensure ALL transitions related to PRE_SCHEDULED are present in status_transitions
INSERT INTO public.status_transitions (from_status, to_status, allowed_roles)
SELECT 'MEASUREMENT_SCHEDULING', 'MEASUREMENT_PRE_SCHEDULED', ARRAY['SUPER_ADMIN', 'DISPATCHER']
WHERE NOT EXISTS (SELECT 1 FROM public.status_transitions WHERE from_status = 'MEASUREMENT_SCHEDULING' AND to_status = 'MEASUREMENT_PRE_SCHEDULED');

INSERT INTO public.status_transitions (from_status, to_status, allowed_roles)
SELECT 'MEASUREMENT_PRE_SCHEDULED', 'MEASUREMENT_SCHEDULING', ARRAY['SUPER_ADMIN', 'DISPATCHER']
WHERE NOT EXISTS (SELECT 1 FROM public.status_transitions WHERE from_status = 'MEASUREMENT_PRE_SCHEDULED' AND to_status = 'MEASUREMENT_SCHEDULING');

INSERT INTO public.status_transitions (from_status, to_status, allowed_roles)
SELECT 'MEASUREMENT_PRE_SCHEDULED', 'MEASUREMENT_SCHEDULED', ARRAY['SUPER_ADMIN', 'DISPATCHER']
WHERE NOT EXISTS (SELECT 1 FROM public.status_transitions WHERE from_status = 'MEASUREMENT_PRE_SCHEDULED' AND to_status = 'MEASUREMENT_SCHEDULED');

INSERT INTO public.status_transitions (from_status, to_status, allowed_roles)
SELECT 'MEASUREMENT_SCHEDULED', 'MEASUREMENT_PRE_SCHEDULED', ARRAY['SUPER_ADMIN', 'DISPATCHER']
WHERE NOT EXISTS (SELECT 1 FROM public.status_transitions WHERE from_status = 'MEASUREMENT_SCHEDULED' AND to_status = 'MEASUREMENT_PRE_SCHEDULED');

-- 3. Fix unassign_measurement again to be bulletproof
CREATE OR REPLACE FUNCTION public.unassign_measurement(
  p_order_id uuid
) RETURNS void AS $$
DECLARE
  v_status text;
BEGIN
  -- Робимо скасування, щоб залишилась історія
  UPDATE public.measurement_tasks 
  SET outcome = 'CANCELLED_BY_DISPATCHER' 
  WHERE order_id = p_order_id AND outcome = 'SCHEDULED';

  -- Якщо статус MEASUREMENT_SCHEDULED або MEASUREMENT_PRE_SCHEDULED, повертаємо в MEASUREMENT_SCHEDULING
  SELECT status INTO v_status FROM public.orders WHERE id = p_order_id;
  IF v_status IN ('MEASUREMENT_SCHEDULED', 'MEASUREMENT_PRE_SCHEDULED') THEN
    PERFORM public.change_order_status(p_order_id, 'MEASUREMENT_SCHEDULING');
  END IF;
  
  -- Clear planned_call_date just in case
  UPDATE public.orders SET planned_call_date = NULL, call_comment = NULL WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
