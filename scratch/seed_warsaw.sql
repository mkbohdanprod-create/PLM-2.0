DO $$
DECLARE
  v_region_warsaw uuid := '722675aa-44d2-4342-980c-bd14a38e65dd';
  v_branch_warsaw uuid;
  v_id uuid;
BEGIN
  -- Перевіряємо чи є філія, якщо ні - створюємо
  SELECT id INTO v_branch_warsaw FROM branches WHERE name = 'Філія Варшава-1' LIMIT 1;
  IF v_branch_warsaw IS NULL THEN
    INSERT INTO branches (name, region_id) VALUES ('Філія Варшава-1', v_region_warsaw) RETURNING id INTO v_branch_warsaw;
  END IF;

  -- Видаляємо старі тестові замовлення Варшави, якщо були
  DELETE FROM orders WHERE order_number LIKE 'TEST-W%';

  -- Замовлення 1: Сама Варшава (Центр)
  INSERT INTO orders (branch_id, status, order_number, external_id) VALUES (v_branch_warsaw, 'MEASUREMENT_SCHEDULING', 'TEST-W1', '48-300001') RETURNING id INTO v_id;
  INSERT INTO order_contacts (order_id, full_name, phone) VALUES (v_id, 'Krzysztof Kowalski', '+48111222333');
  INSERT INTO order_addresses (order_id, city, street, building, lat, lng) VALUES (v_id, 'Warszawa', 'Marszałkowska', '140', '52.2319', '21.0067');
  INSERT INTO order_specifications (order_id, material_type, area_sqm) VALUES (v_id, 'Граніт', 15.5);

  -- Замовлення 2: Прушков (Захід, ~15 км)
  INSERT INTO orders (branch_id, status, order_number, external_id) VALUES (v_branch_warsaw, 'MEASUREMENT_SCHEDULING', 'TEST-W2', '48-300002') RETURNING id INTO v_id;
  INSERT INTO order_contacts (order_id, full_name, phone) VALUES (v_id, 'Anna Nowak', '+48111222444');
  INSERT INTO order_addresses (order_id, city, street, building, lat, lng) VALUES (v_id, 'Pruszków', 'Bolesława Prusa', '35', '52.1678', '20.8091');
  INSERT INTO order_specifications (order_id, material_type, area_sqm) VALUES (v_id, 'Кварц', 22.0);

  -- Замовлення 3: Пясечно (Південь, ~20 км)
  INSERT INTO orders (branch_id, status, order_number, external_id) VALUES (v_branch_warsaw, 'MEASUREMENT_SCHEDULING', 'TEST-W3', '48-300003') RETURNING id INTO v_id;
  INSERT INTO order_contacts (order_id, full_name, phone) VALUES (v_id, 'Piotr Wiśniewski', '+48111222555');
  INSERT INTO order_addresses (order_id, city, street, building, lat, lng) VALUES (v_id, 'Piaseczno', 'Puławska', '42', '52.0792', '21.0264');
  INSERT INTO order_specifications (order_id, material_type, area_sqm) VALUES (v_id, 'Мармур', 10.0);

  -- Замовлення 4: Радом (Південь, ~100 км)
  INSERT INTO orders (branch_id, status, order_number, external_id) VALUES (v_branch_warsaw, 'MEASUREMENT_SCHEDULING', 'TEST-W4', '48-300004') RETURNING id INTO v_id;
  INSERT INTO order_contacts (order_id, full_name, phone) VALUES (v_id, 'Maria Wójcik', '+48111222666');
  INSERT INTO order_addresses (order_id, city, street, building, lat, lng) VALUES (v_id, 'Radom', 'Żeromskiego', '50', '51.4014', '21.1471');
  INSERT INTO order_specifications (order_id, material_type, area_sqm) VALUES (v_id, 'Граніт', 35.0);

  -- Замовлення 5: Седльце (Схід, ~90 км)
  INSERT INTO orders (branch_id, status, order_number, external_id) VALUES (v_branch_warsaw, 'MEASUREMENT_SCHEDULING', 'TEST-W5', '48-300005') RETURNING id INTO v_id;
  INSERT INTO order_contacts (order_id, full_name, phone) VALUES (v_id, 'Tomasz Kamiński', '+48111222777');
  INSERT INTO order_addresses (order_id, city, street, building, lat, lng) VALUES (v_id, 'Siedlce', 'Piłsudskiego', '12', '52.1671', '22.2895');
  INSERT INTO order_specifications (order_id, material_type, area_sqm) VALUES (v_id, 'Кварц', 18.0);

  -- Замовлення 6: Плоцьк (Північний Захід, ~100 км)
  INSERT INTO orders (branch_id, status, order_number, external_id) VALUES (v_branch_warsaw, 'MEASUREMENT_SCHEDULING', 'TEST-W6', '48-300006') RETURNING id INTO v_id;
  INSERT INTO order_contacts (order_id, full_name, phone) VALUES (v_id, 'Katarzyna Lewandowski', '+48111222888');
  INSERT INTO order_addresses (order_id, city, street, building, lat, lng) VALUES (v_id, 'Płock', 'Tumska', '8', '52.5463', '19.7061');
  INSERT INTO order_specifications (order_id, material_type, area_sqm) VALUES (v_id, 'Мармур', 28.5);

  -- Замовлення 7: Леґьоново (Північ, ~25 км)
  INSERT INTO orders (branch_id, status, order_number, external_id) VALUES (v_branch_warsaw, 'MEASUREMENT_SCHEDULING', 'TEST-W7', '48-300007') RETURNING id INTO v_id;
  INSERT INTO order_contacts (order_id, full_name, phone) VALUES (v_id, 'Michał Zieliński', '+48111222999');
  INSERT INTO order_addresses (order_id, city, street, building, lat, lng) VALUES (v_id, 'Legionowo', 'Jagiellońska', '20', '52.3995', '20.9328');
  INSERT INTO order_specifications (order_id, material_type, area_sqm) VALUES (v_id, 'Граніт', 12.0);

  -- Тригеруємо оновлення
  UPDATE orders SET id = id WHERE order_number LIKE 'TEST-W%';
END $$;
