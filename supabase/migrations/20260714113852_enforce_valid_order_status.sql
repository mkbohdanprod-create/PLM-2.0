-- Add trigger to enforce that any order status must be a known status in the FSM (status_transitions)
CREATE OR REPLACE FUNCTION public.check_valid_order_status()
RETURNS TRIGGER AS $$
BEGIN
  -- We consider a status valid if it exists either as a from_status or to_status in the FSM
  IF NOT EXISTS (
    SELECT 1 FROM public.status_transitions 
    WHERE from_status = NEW.status OR to_status = NEW.status
  ) THEN
    RAISE EXCEPTION 'Invalid order status "%". This status does not exist in the state machine (status_transitions table).', NEW.status;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_order_status_trigger ON public.orders;
CREATE TRIGGER check_order_status_trigger
BEFORE INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.check_valid_order_status();
