const { Client } = require('pg');
const client = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
async function run() {
  await client.connect();
  console.log('--- Running seed_reference_data ---');
  try {
    await client.query(`
BEGIN;

-- 1. ROLES (Ensure LOGIST is available)
INSERT INTO public.roles (code, name_ua, is_system) VALUES ('LOGIST', 'Логіст (Водій)', false) ON CONFLICT DO NOTHING;

-- 2. REGIONS & BRANCHES
INSERT INTO public.regions (name) VALUES ('Центр'), ('Захід') ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_center_id uuid;
  v_west_id uuid;
BEGIN
  SELECT id INTO v_center_id FROM public.regions WHERE name = 'Центр' LIMIT 1;
  SELECT id INTO v_west_id FROM public.regions WHERE name = 'Захід' LIMIT 1;

  INSERT INTO public.branches (name, region_id) VALUES 
    ('Київ-Центр', v_center_id), 
    ('Львів', v_west_id)
  ON CONFLICT DO NOTHING;
END $$;

-- 3. MATERIALS & DECORS
INSERT INTO public.materials (name, category) VALUES 
  ('Граніт Black Galaxy', 'SOLID'),
  ('Кварц White', 'SOLID'),
  ('Акрил Pure', 'SOFT'),
  ('HPL Compact Wood', 'SLAB')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_granite uuid; v_quartz uuid; v_acryl uuid; v_hpl uuid;
BEGIN
  SELECT id INTO v_granite FROM public.materials WHERE name = 'Граніт Black Galaxy' LIMIT 1;
  SELECT id INTO v_quartz FROM public.materials WHERE name = 'Кварц White' LIMIT 1;
  SELECT id INTO v_acryl FROM public.materials WHERE name = 'Акрил Pure' LIMIT 1;
  SELECT id INTO v_hpl FROM public.materials WHERE name = 'HPL Compact Wood' LIMIT 1;

  INSERT INTO public.decors (name, material_id) VALUES 
    ('Galaxy Dark', v_granite), ('White Sparkle', v_quartz), 
    ('Pure Snow', v_acryl), ('Oak Natural', v_hpl)
  ON CONFLICT DO NOTHING;
END $$;

-- 4. PAUSE REASONS
INSERT INTO public.pause_reasons (name, default_days) VALUES 
  ('Клієнт не готовий', 14),
  ('Немає доступу на об''єкт', 7)
ON CONFLICT DO NOTHING;

-- 5. VEHICLES (Note: column is name, not model)
DO $$
DECLARE
  v_kyiv uuid; v_lviv uuid;
BEGIN
  SELECT id INTO v_kyiv FROM public.branches WHERE name = 'Київ-Центр' LIMIT 1;
  SELECT id INTO v_lviv FROM public.branches WHERE name = 'Львів' LIMIT 1;

  INSERT INTO public.vehicles (branch_id, plate_number, name) VALUES 
    (v_kyiv, 'KA0001AA', 'Ford Transit'), (v_kyiv, 'KA0002AA', 'Renault Master'),
    (v_lviv, 'BC0001AA', 'Mercedes Sprinter'), (v_lviv, 'BC0002AA', 'VW Crafter')
  ON CONFLICT DO NOTHING;
END $$;

-- 6. PERSONNEL (auth.users + profiles)
DO $$
DECLARE
  v_center_id uuid; v_west_id uuid;
  v_uid_admin uuid := gen_random_uuid();
  v_uid_disp_k uuid := gen_random_uuid();
  v_uid_disp_l uuid := gen_random_uuid();
  v_uid_meas1 uuid := gen_random_uuid();
  v_uid_meas2 uuid := gen_random_uuid();
  v_uid_eng1 uuid := gen_random_uuid();
  v_uid_eng2 uuid := gen_random_uuid();
  v_uid_logist uuid := gen_random_uuid();
  v_uid_inst uuid := gen_random_uuid();
  
  -- Auth User insert template function
  v_insert_auth text := 'INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous) VALUES (''00000000-0000-0000-0000-000000000000'', $1, ''authenticated'', ''authenticated'', $2, crypt(''password123'', gen_salt(''bf'')), now(), now(), now(), ''{"provider":"email","providers":["email"]}'', ''{}'', false, false) ON CONFLICT DO NOTHING;';
BEGIN
  SELECT id INTO v_center_id FROM public.regions WHERE name = 'Центр' LIMIT 1;
  SELECT id INTO v_west_id FROM public.regions WHERE name = 'Захід' LIMIT 1;

  -- 6.1 Insert into auth.users (Password is password123)
  EXECUTE v_insert_auth USING v_uid_admin, 'admin@test.com';
  EXECUTE v_insert_auth USING v_uid_disp_k, 'disp.kyiv@test.com';
  EXECUTE v_insert_auth USING v_uid_disp_l, 'disp.lviv@test.com';
  EXECUTE v_insert_auth USING v_uid_meas1, 'measurer1@test.com';
  EXECUTE v_insert_auth USING v_uid_meas2, 'measurer2@test.com';
  EXECUTE v_insert_auth USING v_uid_eng1, 'eng1@test.com';
  EXECUTE v_insert_auth USING v_uid_eng2, 'eng2@test.com';
  EXECUTE v_insert_auth USING v_uid_logist, 'driver1@test.com';
  EXECUTE v_insert_auth USING v_uid_inst, 'install1@test.com';
  
  -- 6.2 Update public.profiles (auto-created by trigger handle_new_user)
  UPDATE public.profiles SET full_name = 'Super Admin', role_code = 'SUPER_ADMIN', is_active = true WHERE id = v_uid_admin;
  
  UPDATE public.profiles SET full_name = 'Диспетчер Київ', role_code = 'DISPATCHER', is_active = true, allowed_view_regions = ARRAY[v_center_id]::uuid[], allowed_action_regions = ARRAY[v_center_id]::uuid[] WHERE id = v_uid_disp_k;
  UPDATE public.profiles SET full_name = 'Диспетчер Львів', role_code = 'DISPATCHER', is_active = true, allowed_view_regions = ARRAY[v_west_id]::uuid[], allowed_action_regions = ARRAY[v_west_id]::uuid[] WHERE id = v_uid_disp_l;
  
  UPDATE public.profiles SET full_name = 'Замірник Іван', role_code = 'MEASURER', is_active = true, color = '#ff0000', base_lat = 50.45, base_lng = 30.52 WHERE id = v_uid_meas1;
  UPDATE public.profiles SET full_name = 'Замірник Петро', role_code = 'MEASURER', is_active = true, color = '#00ff00', base_lat = 49.83, base_lng = 24.02 WHERE id = v_uid_meas2;
  
  UPDATE public.profiles SET full_name = 'Конструктор Олексій', role_code = 'ENGINEER', is_active = true WHERE id = v_uid_eng1;
  UPDATE public.profiles SET full_name = 'Конструктор Марія', role_code = 'ENGINEER', is_active = true WHERE id = v_uid_eng2;
  
  UPDATE public.profiles SET full_name = 'Водій Василь', role_code = 'LOGIST', is_active = true WHERE id = v_uid_logist;
  UPDATE public.profiles SET full_name = 'Монтажник Андрій', role_code = 'INSTALLER', is_active = true WHERE id = v_uid_inst;
END $$;

-- 7. BASELINE ORDERS
DO $$
DECLARE
  v_kyiv uuid; v_lviv uuid;
  v_res1 json; v_res2 json; v_res3 json;
  v_id1 uuid; v_id2 uuid; v_id3 uuid;
BEGIN
  SELECT id INTO v_kyiv FROM public.branches WHERE name = 'Київ-Центр' LIMIT 1;
  SELECT id INTO v_lviv FROM public.branches WHERE name = 'Львів' LIMIT 1;

  -- Order 1: New (MEASUREMENT_SCHEDULING)
  SELECT public.create_order('ORD-001', v_kyiv, 'FULL_CYCLE', 'Клієнт 1', '380501112233', 'Київ', 'Хрещатик', '1', 'Акрил Pure', 3.5, false, null) INTO v_res1;
  v_id1 := (v_res1->>'order_id')::uuid;

  -- Order 2: Engineering (ENGINEERING_QUEUE)
  SELECT public.create_order('ORD-002', v_lviv, 'FULL_CYCLE', 'Клієнт 2', '380671112233', 'Львів', 'Площа Ринок', '1', 'Граніт Black Galaxy', 5.0, false, null) INTO v_res2;
  v_id2 := (v_res2->>'order_id')::uuid;
  -- Manually push to ENGINEERING_QUEUE
  UPDATE public.orders SET status = 'ENGINEERING_QUEUE' WHERE id = v_id2;

  -- Order 3: Production (IN_PRODUCTION)
  SELECT public.create_order('ORD-003', v_kyiv, 'FULL_CYCLE', 'Клієнт 3', '380631112233', 'Київ', 'Перемоги', '50', 'Кварц White', 2.8, false, null) INTO v_res3;
  v_id3 := (v_res3->>'order_id')::uuid;
  -- Manually push to IN_PRODUCTION
  UPDATE public.orders SET status = 'IN_PRODUCTION' WHERE id = v_id3;
END $$;

COMMIT;
    `);
    
    // Check results
    const ord = await client.query('SELECT count(*) FROM orders');
    console.log('Orders:', ord.rows[0].count);
    
    const profs = await client.query('SELECT count(*) FROM profiles WHERE is_active=true');
    console.log('Active Profiles:', profs.rows[0].count);
    
    const profList = await client.query('SELECT auth.users.email, profiles.role_code, profiles.is_active FROM profiles JOIN auth.users ON profiles.id = auth.users.id WHERE is_active=true ORDER BY role_code');
    console.table(profList.rows);
    
  } catch(e) { console.error('Seed Error:', e.message); }
  await client.end();
}
run();
