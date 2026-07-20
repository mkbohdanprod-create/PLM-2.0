-- 20260702144000_fix_can_access_order.sql

CREATE OR REPLACE FUNCTION public.can_access_order(p_order_id uuid)
RETURNS boolean AS $$
DECLARE
  v_order_branch_id uuid;
  v_order_region_id uuid;
  v_allowed_regions uuid[];
BEGIN
  -- Get the order's branch
  SELECT branch_id INTO v_order_branch_id
  FROM public.orders WHERE id = p_order_id;
  
  IF v_order_branch_id IS NULL THEN
    RETURN public.get_user_role() = 'SUPER_ADMIN';
  END IF;

  -- Get region of that branch
  SELECT region_id INTO v_order_region_id
  FROM public.branches WHERE id = v_order_branch_id;

  v_allowed_regions := public.get_user_allowed_view_regions();

  -- If allowed regions is NULL, user has access to ALL regions (e.g. SUPER_ADMIN)
  IF v_allowed_regions IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Otherwise, check if the order's region is in the allowed array
  RETURN v_order_region_id = ANY(v_allowed_regions);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
