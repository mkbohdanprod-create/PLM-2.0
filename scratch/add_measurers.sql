DO $$
DECLARE
  v_branch_kyiv uuid;
  v_branch_lviv uuid;
  v_branch_warsaw uuid;
  v_alex_id uuid := gen_random_uuid();
  v_krzysztof_id uuid := gen_random_uuid();
  v_date date;
BEGIN
  -- Отримуємо філії
  SELECT id INTO v_branch_kyiv FROM branches WHERE name = 'Філія Центр-1' LIMIT 1;
  SELECT id INTO v_branch_lviv FROM branches WHERE name = 'Філія Захід-1' LIMIT 1;
  SELECT id INTO v_branch_warsaw FROM branches WHERE name = 'Філія Варшава-1' LIMIT 1;

  -- Прив'язуємо Петра до Києва
  UPDATE profiles SET branch_id = v_branch_kyiv WHERE full_name = 'Петро Замірник';

  -- Створюємо Олександра (Львів)
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at) 
  VALUES (v_alex_id, 'alexander@plm.com', 'dummy_hash', now());
  
  -- Тригер handle_new_user вже створив профіль, ми його просто оновимо
  UPDATE profiles 
  SET full_name = 'Олександр', role_code = 'MEASURER', branch_id = v_branch_lviv, color = '#10b981'
  WHERE id = v_alex_id;

  -- Створюємо Кшиштофа (Варшава)
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at) 
  VALUES (v_krzysztof_id, 'krzysztof@plm.com', 'dummy_hash', now());
  
  UPDATE profiles 
  SET full_name = 'Кшиштоф', role_code = 'MEASURER', branch_id = v_branch_warsaw, color = '#f59e0b'
  WHERE id = v_krzysztof_id;

  -- Графік для Кшиштофа 5/2 (ПН-ПТ) з 8:00 до 17:00 на липень і серпень 2026
  FOR v_date IN 
    SELECT generate_series('2026-07-01'::date, '2026-08-31'::date, '1 day'::interval) 
  LOOP
    IF extract(isodow from v_date) IN (1, 2, 3, 4, 5) THEN -- ПН-ПТ
      INSERT INTO worker_schedules (profile_id, work_date, start_time, end_time, status)
      VALUES (v_krzysztof_id, v_date, '08:00:00', '17:00:00', 'WORKING');
    ELSE
      INSERT INTO worker_schedules (profile_id, work_date, start_time, end_time, status)
      VALUES (v_krzysztof_id, v_date, '00:00:00', '00:00:00', 'DAY_OFF');
    END IF;
  END LOOP;

  -- Графік для Олександра (Львів) - теж стандартний (09:00 - 18:00)
  FOR v_date IN 
    SELECT generate_series('2026-07-01'::date, '2026-08-31'::date, '1 day'::interval) 
  LOOP
    IF extract(isodow from v_date) IN (1, 2, 3, 4, 5) THEN
      INSERT INTO worker_schedules (profile_id, work_date, start_time, end_time, status)
      VALUES (v_alex_id, v_date, '09:00:00', '18:00:00', 'WORKING');
    ELSE
      INSERT INTO worker_schedules (profile_id, work_date, start_time, end_time, status)
      VALUES (v_alex_id, v_date, '00:00:00', '00:00:00', 'DAY_OFF');
    END IF;
  END LOOP;

END $$;
