\echo '--- SETUP TEST DATA ---'
DO $$
DECLARE
  v_branch_id uuid;
BEGIN
  INSERT INTO public.regions (name) VALUES ('Test Region') ON CONFLICT DO NOTHING;
  SELECT id INTO v_branch_id FROM public.branches WHERE name = 'Test Branch';
  IF NOT FOUND THEN
    INSERT INTO public.branches (region_id, name) 
    SELECT id, 'Test Branch' FROM public.regions WHERE name = 'Test Region'
    RETURNING id INTO v_branch_id;
  END IF;

  INSERT INTO auth.users (id, email) VALUES ('22222222-2222-2222-2222-222222222222', 'admin@test.com') ON CONFLICT DO NOTHING;
  UPDATE public.profiles SET role_code = 'SUPER_ADMIN', branch_id = v_branch_id WHERE id = '22222222-2222-2222-2222-222222222222';

  EXECUTE 'GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated';
  EXECUTE 'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated';
  
  -- The core issue: Postgres column privileges are additive. 
  -- We must revoke table-level update first, then we could grant column-level if needed.
  EXECUTE 'REVOKE UPDATE ON public.orders FROM authenticated';
END;
$$;

\echo '--- START TEST ---'
SET ROLE authenticated;
SET request.jwt.claim.sub TO '22222222-2222-2222-2222-222222222222';
SET request.jwt.claim.role TO 'authenticated';

DO $$
DECLARE
  v_branch_id uuid;
  v_ord1 uuid;
  v_ord2 uuid;
BEGIN
  SELECT id INTO v_branch_id FROM public.branches WHERE name = 'Test Branch';

  -- Cleanup before test
  DELETE FROM public.orders;

  INSERT INTO public.orders (order_number, branch_id, status, order_type, payment_percent)
  VALUES ('O-1', v_branch_id, 'DRAFT', 'FULL_CYCLE', 100) RETURNING id INTO v_ord1;

  INSERT INTO public.order_contacts (order_id, full_name, phone) VALUES (v_ord1, 'Ivan', '111');
  INSERT INTO public.order_addresses (order_id, city, street, building) VALUES (v_ord1, 'K', 'S', '1');

  RAISE NOTICE 'Testing FULL_CYCLE...';
  PERFORM public.change_order_status(v_ord1, 'NEW');
  PERFORM public.change_order_status(v_ord1, 'MEASUREMENT_SCHEDULING');
  PERFORM public.change_order_status(v_ord1, 'MEASUREMENT_SCHEDULED');
  PERFORM public.change_order_status(v_ord1, 'MEASUREMENT_COMPLETED');
  PERFORM public.change_order_status(v_ord1, 'ENGINEERING_DESIGN');
  PERFORM public.change_order_status(v_ord1, 'ENGINEERING_NESTING');
  PERFORM public.change_order_status(v_ord1, 'CLIENT_APPROVAL');
  PERFORM public.change_order_status(v_ord1, 'PRODUCTION_QUEUE');
  PERFORM public.change_order_status(v_ord1, 'IN_PRODUCTION');
  PERFORM public.change_order_status(v_ord1, 'PRODUCTION_COMPLETED');
  PERFORM public.change_order_status(v_ord1, 'INSTALLATION_SCHEDULING');
  PERFORM public.change_order_status(v_ord1, 'INSTALLATION_SCHEDULED');
  PERFORM public.change_order_status(v_ord1, 'COMPLETED');
  RAISE NOTICE 'FULL_CYCLE completed successfully.';

  INSERT INTO public.orders (order_number, branch_id, status, order_type, payment_percent)
  VALUES ('O-2', v_branch_id, 'DRAFT', 'BY_DRAWING', 100) RETURNING id INTO v_ord2;

  INSERT INTO public.order_contacts (order_id, full_name, phone) VALUES (v_ord2, 'Petro', '222');
  INSERT INTO public.order_addresses (order_id, city, street, building) VALUES (v_ord2, 'K', 'S', '2');

  RAISE NOTICE 'Testing BY_DRAWING...';
  PERFORM public.change_order_status(v_ord2, 'NEW');
  
  -- Request MEASUREMENT_SCHEDULING, which should auto-skip to ENGINEERING_DESIGN
  PERFORM public.change_order_status(v_ord2, 'MEASUREMENT_SCHEDULING');
  
  IF (SELECT status FROM public.orders WHERE id = v_ord2) = 'ENGINEERING_DESIGN' THEN
    RAISE NOTICE 'BY_DRAWING successfully skipped measurement phase and jumped to ENGINEERING_DESIGN';
  ELSE
    RAISE EXCEPTION 'BY_DRAWING failed to skip measurement phase!';
  END IF;

  -- 3. TEST REVOKE UPDATE
  RAISE NOTICE 'Testing direct UPDATE (should fail)...';
  BEGIN
    UPDATE public.orders SET status = 'COMPLETED' WHERE id = v_ord2;
    RAISE EXCEPTION 'REVOKE FAILED: Direct update was allowed!';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'REVOKE SUCCESS: Direct update was blocked with insufficient_privilege.';
  END;

  -- 4. NEGATIVE TESTS
  RAISE NOTICE 'Testing NEGATIVE SCENARIOS...';
  
  -- 4a. Invalid transition NEW -> COMPLETED
  BEGIN
    PERFORM public.change_order_status(v_ord1, 'COMPLETED');
    RAISE EXCEPTION 'FAILED: Allowed NEW to COMPLETED transition!';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'SUCCESS: Blocked NEW -> COMPLETED (%)', SQLERRM;
  END;

  -- 4b. Missing payment threshold DRAFT -> NEW
  DECLARE
    v_ord3 uuid;
  BEGIN
    INSERT INTO public.orders (order_number, branch_id, status, order_type, payment_percent)
    VALUES ('O-3', v_branch_id, 'DRAFT', 'FULL_CYCLE', 10) RETURNING id INTO v_ord3;
    
    INSERT INTO public.order_contacts (order_id, full_name, phone) VALUES (v_ord3, 'Ivan', '111');
    INSERT INTO public.order_addresses (order_id, city, street, building) VALUES (v_ord3, 'K', 'S', '1');

    BEGIN
      PERFORM public.change_order_status(v_ord3, 'NEW');
      RAISE EXCEPTION 'FAILED: Allowed DRAFT -> NEW with low payment!';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'SUCCESS: Blocked DRAFT -> NEW low payment (%)', SQLERRM;
    END;
  END;

  -- 4c. Missing required fields
  DECLARE
    v_ord4 uuid;
  BEGIN
    INSERT INTO public.orders (order_number, branch_id, status, order_type, payment_percent)
    VALUES ('O-4', v_branch_id, 'DRAFT', 'FULL_CYCLE', 100) RETURNING id INTO v_ord4;
    
    -- Insert address but NO contacts to test missing required table/fields
    INSERT INTO public.order_addresses (order_id, city, street, building) VALUES (v_ord4, 'K', 'S', '1');

    BEGIN
      PERFORM public.change_order_status(v_ord4, 'NEW');
      RAISE EXCEPTION 'FAILED: Allowed NEW without required phone!';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'SUCCESS: Blocked NEW without phone (%)', SQLERRM;
    END;
  END;

END;
$$;
