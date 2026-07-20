-- 20260702154000_disable_incomplete_check.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.change_order_status(
  p_order_id uuid,
  p_new_status text
) RETURNS boolean AS $$
DECLARE
  v_current_status text;
  v_is_incomplete boolean;
  v_role text;
BEGIN
  SELECT status, is_incomplete INTO v_current_status, v_is_incomplete 
  FROM public.orders WHERE id = p_order_id FOR UPDATE;
  
  v_role := public.get_user_role();
  
  IF v_current_status = p_new_status THEN
    RETURN true;
  END IF;

  IF v_current_status = 'PAUSED' AND p_new_status = 'RESUME' THEN
    SELECT previous_status INTO p_new_status FROM public.orders WHERE id = p_order_id;
    IF p_new_status IS NULL THEN
      p_new_status := 'NEW';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.status_transitions 
      WHERE from_status = v_current_status AND to_status = p_new_status AND v_role = ANY(allowed_roles)
    ) THEN
      RAISE EXCEPTION 'Transition from % to % not allowed for role %', v_current_status, p_new_status, v_role;
    END IF;
  END IF;

  -- Disable strict check for incomplete orders based on user request.
  -- This allows scheduling and transitioning even if required fields are missing.
  -- IF v_is_incomplete = true AND p_new_status NOT IN ('PAUSED', 'CANCELLED', 'NEW') THEN
  --   RAISE EXCEPTION 'Cannot transition: Order is incomplete. Please fill all required fields.';
  -- END IF;

  UPDATE public.orders 
  SET previous_status = v_current_status, status = p_new_status
  WHERE id = p_order_id;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
