-- 20260702105000_mcp_rpc.sql

-- 1. RPC for getting allowed transitions
CREATE OR REPLACE FUNCTION public.get_allowed_transitions(p_order_id uuid) 
RETURNS TABLE (to_status text) AS $$
DECLARE
  v_status text;
  v_role text;
BEGIN
  SELECT status INTO v_status FROM public.orders WHERE id = p_order_id;
  v_role := public.get_user_role();
  
  IF v_status = 'PAUSED' THEN
    RETURN QUERY SELECT 'RESUME'::text;
  ELSE
    RETURN QUERY 
    SELECT st.to_status
    FROM public.status_transitions st
    WHERE st.from_status = v_status 
      AND v_role = ANY(st.allowed_roles);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. RPC for atomic draft creation
CREATE OR REPLACE FUNCTION public.create_order_draft(
  p_branch_id uuid,
  p_order_type text,
  p_full_name text,
  p_phone text,
  p_city text,
  p_street text,
  p_building text,
  p_force boolean DEFAULT false
) RETURNS json AS $$
DECLARE
  v_dup_check json;
  v_order_id uuid;
  v_phone_norm text;
BEGIN
  v_phone_norm := regexp_replace(p_phone, '[^0-9]', '', 'g');

  -- Check duplicates if not forced
  IF NOT p_force THEN
    v_dup_check := public.check_order_duplicates(p_full_name, p_phone, p_city, p_street, p_building);
    IF json_array_length(v_dup_check) > 0 THEN
      RETURN json_build_object('success', false, 'error', 'DUPLICATES_FOUND', 'duplicates', v_dup_check);
    END IF;
  END IF;
  
  -- Insert into orders
  INSERT INTO public.orders (order_number, branch_id, status, order_type)
  VALUES ('O-' || upper(substr(md5(random()::text), 1, 6)), p_branch_id, 'DRAFT', p_order_type)
  RETURNING id INTO v_order_id;
  
  -- Insert contacts
  INSERT INTO public.order_contacts (order_id, full_name, phone, phone_normalized)
  VALUES (v_order_id, p_full_name, p_phone, v_phone_norm);
  
  -- Insert addresses
  INSERT INTO public.order_addresses (order_id, city, street, building)
  VALUES (v_order_id, p_city, p_street, p_building);
  
  RETURN json_build_object('success', true, 'order_id', v_order_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
