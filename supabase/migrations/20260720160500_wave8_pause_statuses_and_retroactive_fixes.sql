-- 1. Retroactively fix old measurement scheduling tasks
UPDATE public.orders
SET status = 'MEASUREMENT_PRE_SCHEDULED'
WHERE status = 'MEASUREMENT_SCHEDULING' 
  AND EXISTS (
    SELECT 1 FROM public.measurement_tasks 
    WHERE order_id = orders.id 
      AND outcome IN ('SCHEDULED', 'IN_PROGRESS')
  );

-- 2. Update pause_order RPC to support domain-specific pause statuses
CREATE OR REPLACE FUNCTION public.pause_order(
  p_order_id uuid,
  p_reason_id uuid,
  p_resume_date date DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_current_status text;
  v_paused_status text;
BEGIN
  SELECT status INTO v_current_status FROM public.orders WHERE id = p_order_id;
  
  IF v_current_status LIKE 'PAUSED%' THEN
    RAISE EXCEPTION 'Order is already paused';
  END IF;
  
  -- Determine the specific pause substatus based on the current status
  IF v_current_status IN ('MEASUREMENT_SCHEDULING', 'MEASUREMENT_PRE_SCHEDULED') THEN
    v_paused_status := 'PAUSED_MEASUREMENT_SCHEDULING';
  ELSIF v_current_status IN ('ENGINEERING_QUEUE', 'ENGINEERING_IN_PROGRESS', 'CLIENT_APPROVAL', 'ENGINEERING_NESTING') THEN
    v_paused_status := 'PAUSED_ENGINEERING';
  ELSIF v_current_status IN ('PRODUCTION_QUEUE', 'IN_PRODUCTION', 'PRODUCTION_COMPLETED') THEN
    v_paused_status := 'PAUSED_PRODUCTION';
  ELSIF v_current_status = 'INSTALLATION_SCHEDULING' THEN
    v_paused_status := 'PAUSED_INSTALLATION_SCHED';
  ELSIF v_current_status IN ('DELIVERY_SCHEDULING', 'DELIVERY_IN_TRANSIT', 'READY_FOR_PICKUP') THEN
    v_paused_status := 'PAUSED_DELIVERY';
  ELSE
    v_paused_status := 'PAUSED';
  END IF;
  
  UPDATE public.orders 
  SET 
    previous_status = v_current_status,
    status = v_paused_status,
    pause_reason_id = p_reason_id,
    resume_date = p_resume_date
  WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update resume_order RPC to support all pause statuses
CREATE OR REPLACE FUNCTION public.resume_order(
  p_order_id uuid
) RETURNS void AS $$
DECLARE
  v_previous_status text;
  v_current_status text;
BEGIN
  SELECT previous_status, status INTO v_previous_status, v_current_status 
  FROM public.orders WHERE id = p_order_id;
  
  IF NOT (v_current_status LIKE 'PAUSED%') THEN
    RAISE EXCEPTION 'Order is not paused';
  END IF;

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
