-- Fix unassign_measurement to not clear planned_call_date
-- We want change_order_status to handle setting it to now() so dispatcher knows to call the client

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
  
  -- Ми більше не затираємо planned_call_date!
  -- change_order_status автоматично встановить його на now() (Потрібен повторний контакт)
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
