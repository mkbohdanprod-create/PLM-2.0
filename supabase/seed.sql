-- seed.sql

DO $$
DECLARE
  v_center_id uuid;
  v_west_id uuid;
  v_branch_center uuid;
  v_branch_west uuid;
BEGIN
  -- Get existing region IDs
  SELECT id INTO v_center_id FROM public.regions WHERE name = 'Центр';
  SELECT id INTO v_west_id FROM public.regions WHERE name = 'Захід';

  -- Create branches
  INSERT INTO public.branches (region_id, name) VALUES 
  (v_center_id, 'Філія Центр-1') RETURNING id INTO v_branch_center;
  
  INSERT INTO public.branches (region_id, name) VALUES 
  (v_west_id, 'Філія Захід-1') RETURNING id INTO v_branch_west;

  -- Create auth users
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, raw_user_meta_data, encrypted_password, 
    email_confirmed_at, confirmation_token, recovery_token, email_change_token_current, 
    email_change_token_new, created_at, updated_at, email_change
  ) VALUES 
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@example.com', '{"name": "Admin"}', crypt('password123', gen_salt('bf')), now(), '', '', '', '', now(), now(), ''),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'center@example.com', '{"name": "Manager Center"}', crypt('password123', gen_salt('bf')), now(), '', '', '', '', now(), now(), ''),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'west@example.com', '{"name": "Manager West"}', crypt('password123', gen_salt('bf')), now(), '', '', '', '', now(), now(), ''),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dispatcher@example.com', '{"name": "Dispatcher Center"}', crypt('password123', gen_salt('bf')), now(), '', '', '', '', now(), now(), ''),
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'measurer@example.com', '{"name": "Measurer Ivan"}', crypt('password123', gen_salt('bf')), now(), '', '', '', '', now(), now(), '')
  ON CONFLICT (id) DO NOTHING;

  -- Update profiles
  UPDATE public.profiles SET role_code = 'SUPER_ADMIN' WHERE id = '00000000-0000-0000-0000-000000000001';
  UPDATE public.profiles SET role_code = 'REGION_MANAGER', branch_id = v_branch_center WHERE id = '00000000-0000-0000-0000-000000000002';
  UPDATE public.profiles SET role_code = 'REGION_MANAGER', branch_id = v_branch_west WHERE id = '00000000-0000-0000-0000-000000000003';
  UPDATE public.profiles SET role_code = 'DISPATCHER', branch_id = v_branch_center WHERE id = '00000000-0000-0000-0000-000000000004';
  UPDATE public.profiles SET role_code = 'MEASURER', branch_id = v_branch_center, full_name = 'Іван Замірник' WHERE id = '00000000-0000-0000-0000-000000000005';



  -- Create schedule for measurer for the next 7 days
  FOR i IN 0..6 LOOP
    INSERT INTO public.worker_schedules (profile_id, work_date, start_time, end_time, status)
    VALUES ('00000000-0000-0000-0000-000000000005', CURRENT_DATE + i, '09:00:00', '18:00:00', 'WORKING')
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
