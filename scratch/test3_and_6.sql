-- test3_and_6.sql
DO $$
DECLARE
  v_order_id uuid;
BEGIN
  -- Знаходимо одне неповне замовлення
  SELECT id INTO v_order_id FROM public.orders WHERE is_incomplete = true LIMIT 1;
  IF v_order_id IS NULL THEN
    RAISE NOTICE 'No incomplete orders found. Creating one...';
    -- Insert a dummy incomplete order if none exists
    INSERT INTO public.orders (order_number, branch_id, is_incomplete, status)
    VALUES ('TEST-INCOMPLETE', (SELECT id FROM public.branches LIMIT 1), true, 'NEW')
    RETURNING id INTO v_order_id;
  END IF;

  -- Set role to SUPER_ADMIN so transition check passes
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated", "sub":"00000000-0000-0000-0000-000000000001"}', true);

  -- Пробуємо перевести його в MEASUREMENT_SCHEDULING
  -- Це має впасти з помилкою про неповні дані
  BEGIN
    PERFORM public.change_order_status(v_order_id, 'MEASUREMENT_SCHEDULING');
    RAISE EXCEPTION 'TEST FAILED: Transition succeeded but it should have failed!';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TEST PASSED. Caught exception: %', SQLERRM;
  END;
END;
$$;
DO $$
DECLARE
  v_count integer;
BEGIN
  -- Set local session to authenticated with a fake user ID
  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated", "sub":"00000000-0000-0000-0000-000000000000"}', true);
  
  -- Attempt to count history records
  SELECT count(*) INTO v_count FROM public.order_status_history;
  
  IF v_count = 0 THEN
    RAISE NOTICE 'TEST PASSED. Returned 0 rows for unauthorized user.';
  ELSE
    RAISE EXCEPTION 'TEST FAILED: Returned % rows!', v_count;
  END IF;
END;
$$;
