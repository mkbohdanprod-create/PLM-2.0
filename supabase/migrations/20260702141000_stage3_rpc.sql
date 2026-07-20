-- 20260702141000_stage3_rpc.sql

-- 1. Add resume_date to orders
ALTER TABLE public.orders ADD COLUMN resume_date date;

-- 2. RPC: assign_measurement
CREATE OR REPLACE FUNCTION public.assign_measurement(
  p_order_id uuid,
  p_measurer_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time,
  p_estimated_travel_time integer DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_task_id uuid;
  v_is_working boolean;
BEGIN
  -- 1. Check if measurer is working that day
  SELECT EXISTS (
    SELECT 1 FROM public.worker_schedules 
    WHERE profile_id = p_measurer_id AND work_date = p_date AND status = 'WORKING'
  ) INTO v_is_working;
  
  IF NOT v_is_working THEN
    RAISE EXCEPTION 'Measurer is not working on this date';
  END IF;

  -- 2. Create task
  INSERT INTO public.measurement_tasks (order_id, measurer_id, scheduled_date, start_time, end_time, estimated_travel_time_mins)
  VALUES (p_order_id, p_measurer_id, p_date, p_start_time, p_end_time, p_estimated_travel_time)
  RETURNING id INTO v_task_id;

  -- 3. Update order status
  UPDATE public.orders SET status = 'MEASUREMENT_SCHEDULED' WHERE id = p_order_id;
  
  RETURN v_task_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RPC: pause_order
CREATE OR REPLACE FUNCTION public.pause_order(
  p_order_id uuid,
  p_reason_id uuid,
  p_resume_date date DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_current_status text;
BEGIN
  SELECT status INTO v_current_status FROM public.orders WHERE id = p_order_id;
  
  IF v_current_status = 'PAUSED' THEN
    RAISE EXCEPTION 'Order is already paused';
  END IF;
  
  UPDATE public.orders 
  SET 
    previous_status = v_current_status,
    status = 'PAUSED',
    pause_reason_id = p_reason_id,
    resume_date = p_resume_date
  WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC: resume_order
CREATE OR REPLACE FUNCTION public.resume_order(
  p_order_id uuid
) RETURNS void AS $$
DECLARE
  v_previous_status text;
BEGIN
  SELECT previous_status INTO v_previous_status FROM public.orders WHERE id = p_order_id;
  
  IF v_previous_status IS NULL THEN
    RAISE EXCEPTION 'No previous status to resume to';
  END IF;

  UPDATE public.orders
  SET 
    status = v_previous_status,
    previous_status = NULL,
    pause_reason_id = NULL,
    resume_date = NULL
  WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Revoke execute from public and grant to specific roles
REVOKE EXECUTE ON FUNCTION public.assign_measurement(uuid, uuid, date, time, time, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_measurement(uuid, uuid, date, time, time, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.pause_order(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pause_order(uuid, uuid, date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.resume_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resume_order(uuid) TO authenticated;
