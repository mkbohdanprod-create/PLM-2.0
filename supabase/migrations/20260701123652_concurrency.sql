CREATE OR REPLACE FUNCTION public.lock_order(order_id uuid)
RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.orders 
  SET 
    locked_by = auth.uid(), 
    lock_expires_at = now() + interval '10 minutes'
  WHERE id = order_id 
    AND (locked_by IS NULL OR lock_expires_at < now())
  RETURNING id INTO v_id;

  RETURN v_id; -- Returns NULL if lock wasn't acquired
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.unlock_order(order_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.orders 
  SET 
    locked_by = NULL, 
    lock_expires_at = NULL
  WHERE id = order_id AND locked_by = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
