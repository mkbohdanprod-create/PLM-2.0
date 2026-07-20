-- Clean up existing orders
TRUNCATE TABLE public.orders CASCADE;

DO $$
DECLARE
  v_branch_center uuid;
  v_branch_west uuid;
BEGIN
  -- Get existing branch IDs
  SELECT id INTO v_branch_center FROM public.branches WHERE name = 'Філія Центр-1' LIMIT 1;
  SELECT id INTO v_branch_west FROM public.branches WHERE name = 'Філія Захід-1' LIMIT 1;

  IF v_branch_center IS NULL THEN
     SELECT id INTO v_branch_center FROM public.branches LIMIT 1;
  END IF;
  
  IF v_branch_west IS NULL THEN
     v_branch_west := v_branch_center;
  END IF;

  -- Create 5 new mock orders
  INSERT INTO public.orders (id, order_number, branch_id, status, order_type)
  VALUES 
  (gen_random_uuid(), 'ORD-001', v_branch_center, 'NEW', 'FULL_CYCLE'),
  (gen_random_uuid(), 'ORD-002', v_branch_center, 'MEASUREMENT_SCHEDULING', 'FULL_CYCLE'),
  (gen_random_uuid(), 'ORD-003', v_branch_center, 'AGREEMENT', 'FULL_CYCLE'),
  (gen_random_uuid(), 'ORD-004', v_branch_west, 'NEW', 'FULL_CYCLE'),
  (gen_random_uuid(), 'ORD-005', v_branch_west, 'IN_PRODUCTION', 'FULL_CYCLE');

END $$;
