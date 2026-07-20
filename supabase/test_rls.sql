-- Fix permissions for test
GRANT ALL ON TABLE public.roles TO authenticated;
GRANT ALL ON TABLE public.regions TO authenticated;
GRANT ALL ON TABLE public.branches TO authenticated;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.orders TO authenticated;

-- 1. Create dummy users
INSERT INTO auth.users (id, email) VALUES 
('11111111-1111-1111-1111-111111111111', 'manager_center@test.com'),
('22222222-2222-2222-2222-222222222222', 'super_admin@test.com')
ON CONFLICT DO NOTHING;

-- Wait for trigger
DO $$ BEGIN PERFORM pg_sleep(1); END $$;

-- Setup test data using variables to avoid encoding issues
DO $$ 
DECLARE 
  center_reg uuid;
  west_reg uuid;
  kyiv_b uuid;
  lviv_b uuid;
BEGIN
  -- Get first two regions
  SELECT id INTO center_reg FROM public.regions ORDER BY name LIMIT 1 OFFSET 0;
  SELECT id INTO west_reg FROM public.regions ORDER BY name LIMIT 1 OFFSET 1;

  INSERT INTO public.branches (name, region_id) VALUES ('Test Branch Center', center_reg) RETURNING id INTO kyiv_b;
  INSERT INTO public.branches (name, region_id) VALUES ('Test Branch West', west_reg) RETURNING id INTO lviv_b;

  -- 2. Setup Super Admin
  UPDATE public.profiles 
  SET role_code = 'SUPER_ADMIN'
  WHERE id = '22222222-2222-2222-2222-222222222222';

  -- 3. Setup Dispatcher and trigger default regions
  UPDATE public.profiles 
  SET role_code = 'DISPATCHER', branch_id = kyiv_b
  WHERE id = '11111111-1111-1111-1111-111111111111';

  -- Add some custom action region for testing
  UPDATE public.profiles 
  SET allowed_view_regions = ARRAY[center_reg, west_reg],
      allowed_action_regions = ARRAY[center_reg]
  WHERE id = '11111111-1111-1111-1111-111111111111';

  -- 4. Insert some orders
  INSERT INTO public.orders (order_number, branch_id) VALUES ('ORD-CENTER-01', kyiv_b);
  INSERT INTO public.orders (order_number, branch_id) VALUES ('ORD-WEST-01', lviv_b);
  
  -- Insert hidden order
  INSERT INTO public.orders (order_number, branch_id, is_hidden) VALUES ('ORD-HIDDEN-01', kyiv_b, true);
END $$;

-- --- TEST 1: Super Admin cannot see is_hidden = true ---
\echo '--- Test 1: SUPER_ADMIN viewing hidden ---'
SET ROLE authenticated;
SET request.jwt.claim.sub TO '22222222-2222-2222-2222-222222222222';
SET request.jwt.claim.role TO 'authenticated';

\echo 'Super admin orders (Should NOT contain ORD-HIDDEN-01):'
SELECT order_number FROM public.orders;

-- --- TEST 2: Self-escalation fails ---
\echo '--- Test 2: Self Escalation ---'
SET request.jwt.claim.sub TO '11111111-1111-1111-1111-111111111111';

DO $$
BEGIN
  UPDATE public.profiles SET allowed_view_regions = NULL WHERE id = '11111111-1111-1111-1111-111111111111';
  RAISE WARNING 'TEST FAILED: Self escalation succeeded!';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'TEST PASSED: Caught expected error on self escalation: %', SQLERRM;
END $$;

-- --- TEST 3: View vs Action rights ---
\echo '--- Test 3: View vs Action rights ---'
\echo 'Dispatcher orders (Should see BOTH Center and West):'
SELECT order_number FROM public.orders;

DO $$
DECLARE
  v_west_id uuid;
BEGIN
  SELECT id INTO v_west_id FROM public.orders WHERE order_number = 'ORD-WEST-01';
  UPDATE public.orders SET status = 'CANCELLED' WHERE id = v_west_id;
  RAISE WARNING 'TEST FAILED: Update on West order succeeded but action rights are only for Center!';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'TEST PASSED: Caught expected error on updating West order: %', SQLERRM;
END $$;

RESET ROLE;
