DO $$
DECLARE
  v_kyiv uuid := '22560ced-76bb-434e-8ac8-64b48d5f9247';
  v_lviv uuid := '1c9de803-1319-408c-b9aa-80fc19137948';
  v_id uuid;
BEGIN
  INSERT INTO orders (branch_id, status, order_number, external_id) VALUES (v_kyiv, 'MEASUREMENT_SCHEDULING', 'TEST-K7', '77-100001') RETURNING id INTO v_id;
  INSERT INTO order_contacts (order_id, full_name, phone) VALUES (v_id, 'Андрій Коваленко', '+380671001001');
  INSERT INTO order_addresses (order_id, city, street, building, lat, lng) VALUES (v_id, 'Київ', 'Бульвар Лесі Українки', '7Б', '50.4270', '30.5410');
  INSERT INTO order_specifications (order_id, material_type, area_sqm) VALUES (v_id, 'Граніт', 18.5);

  INSERT INTO orders (branch_id, status, order_number, external_id) VALUES (v_kyiv, 'MEASUREMENT_SCHEDULING', 'TEST-K8', '77-100002') RETURNING id INTO v_id;
  INSERT INTO order_contacts (order_id, full_name, phone) VALUES (v_id, 'Олена Шевченко', '+380671001002');
  INSERT INTO order_addresses (order_id, city, street, building, lat, lng) VALUES (v_id, 'Київ', 'Проспект Науки', '42', '50.3945', '30.4760');
  INSERT INTO order_specifications (order_id, material_type, area_sqm) VALUES (v_id, 'Мармур', 24.0);

  INSERT INTO orders (branch_id, status, order_number, external_id) VALUES (v_kyiv, 'MEASUREMENT_SCHEDULING', 'TEST-K9', '77-100003') RETURNING id INTO v_id;
  INSERT INTO order_contacts (order_id, full_name, phone) VALUES (v_id, 'Ігор Бондаренко', '+380671001003');
  INSERT INTO order_addresses (order_id, city, street, building, lat, lng) VALUES (v_id, 'Київ', 'Сагайдачного', '10', '50.4622', '30.5156');
  INSERT INTO order_specifications (order_id, material_type, area_sqm) VALUES (v_id, 'Кварц', 12.0);

  INSERT INTO orders (branch_id, status, order_number, external_id) VALUES (v_kyiv, 'MEASUREMENT_SCHEDULING', 'TEST-K10', '77-100004') RETURNING id INTO v_id;
  INSERT INTO order_contacts (order_id, full_name, phone) VALUES (v_id, 'Марина Ткаченко', '+380671001004');
  INSERT INTO order_addresses (order_id, city, street, building, lat, lng) VALUES (v_id, 'Київ', 'Велика Васильківська', '100', '50.4220', '30.5152');
  INSERT INTO order_specifications (order_id, material_type, area_sqm) VALUES (v_id, 'Граніт', 30.0);

  INSERT INTO orders (branch_id, status, order_number, external_id) VALUES (v_kyiv, 'MEASUREMENT_SCHEDULING', 'TEST-K11', '77-100005') RETURNING id INTO v_id;
  INSERT INTO order_contacts (order_id, full_name, phone) VALUES (v_id, 'Дмитро Мельник', '+380671001005');
  INSERT INTO order_addresses (order_id, city, street, building, lat, lng) VALUES (v_id, 'Київ', 'Харківське шосе', '56', '50.3980', '30.6350');
  INSERT INTO order_specifications (order_id, material_type, area_sqm) VALUES (v_id, 'Мармур', 15.0);

  INSERT INTO orders (branch_id, status, order_number, external_id) VALUES (v_kyiv, 'MEASUREMENT_SCHEDULING', 'TEST-K12', '77-100006') RETURNING id INTO v_id;
  INSERT INTO order_contacts (order_id, full_name, phone) VALUES (v_id, 'Наталія Гончаренко', '+380671001006');
  INSERT INTO order_addresses (order_id, city, street, building, lat, lng) VALUES (v_id, 'Київ', 'Героїв Дніпра', '18', '50.5198', '30.4987');
  INSERT INTO order_specifications (order_id, material_type, area_sqm) VALUES (v_id, 'Кварц', 22.0);

  INSERT INTO orders (branch_id, status, order_number, external_id) VALUES (v_kyiv, 'MEASUREMENT_SCHEDULING', 'TEST-K13', '77-100007') RETURNING id INTO v_id;
  INSERT INTO order_contacts (order_id, full_name, phone) VALUES (v_id, 'Сергій Литвиненко', '+380671001007');
  INSERT INTO order_addresses (order_id, city, street, building, lat, lng) VALUES (v_id, 'Київ', 'Академіка Палладіна', '33', '50.4750', '30.3650');
  INSERT INTO order_specifications (order_id, material_type, area_sqm) VALUES (v_id, 'Граніт', 8.5);

  INSERT INTO orders (branch_id, status, order_number, external_id) VALUES (v_kyiv, 'MEASUREMENT_SCHEDULING', 'TEST-K14', '77-100008') RETURNING id INTO v_id;
  INSERT INTO order_contacts (order_id, full_name, phone) VALUES (v_id, 'Юлія Кравченко', '+380671001008');
  INSERT INTO order_addresses (order_id, city, street, building, lat, lng) VALUES (v_id, 'Київ', 'Червоноткацька', '44', '50.4415', '30.5800');
  INSERT INTO order_specifications (order_id, material_type, area_sqm) VALUES (v_id, 'Мармур', 35.0);

  INSERT INTO orders (branch_id, status, order_number, external_id) VALUES (v_kyiv, 'MEASUREMENT_SCHEDULING', 'TEST-K15', '77-100009') RETURNING id INTO v_id;
  INSERT INTO order_contacts (order_id, full_name, phone) VALUES (v_id, 'Олексій Поліщук', '+380671001009');
  INSERT INTO order_addresses (order_id, city, street, building, lat, lng) VALUES (v_id, 'Київ', 'Маршала Тимошенка', '21', '50.4833', '30.4544');
  INSERT INTO order_specifications (order_id, material_type, area_sqm) VALUES (v_id, 'Кварц', 19.0);

  INSERT INTO orders (branch_id, status, order_number, external_id) VALUES (v_kyiv, 'MEASUREMENT_SCHEDULING', 'TEST-K16', '77-100010') RETURNING id INTO v_id;
  INSERT INTO order_contacts (order_id, full_name, phone) VALUES (v_id, 'Вікторія Савченко', '+380671001010');
  INSERT INTO order_addresses (order_id, city, street, building, lat, lng) VALUES (v_id, 'Київ', 'Антоновича', '172', '50.4145', '30.5198');
  INSERT INTO order_specifications (order_id, material_type, area_sqm) VALUES (v_id, 'Граніт', 27.0);

  INSERT INTO orders (branch_id, status, order_number, external_id) VALUES (v_lviv, 'MEASUREMENT_SCHEDULING', 'TEST-LV1', '88-200001') RETURNING id INTO v_id;
  INSERT INTO order_contacts (order_id, full_name, phone) VALUES (v_id, 'Роман Яцишин', '+380671002001');
  INSERT INTO order_addresses (order_id, city, street, building, lat, lng) VALUES (v_id, 'Львів', 'Проспект Свободи', '28', '49.8419', '24.0319');
  INSERT INTO order_specifications (order_id, material_type, area_sqm) VALUES (v_id, 'Граніт', 14.0);

  INSERT INTO orders (branch_id, status, order_number, external_id) VALUES (v_lviv, 'MEASUREMENT_SCHEDULING', 'TEST-LV2', '88-200002') RETURNING id INTO v_id;
  INSERT INTO order_contacts (order_id, full_name, phone) VALUES (v_id, 'Оксана Федишин', '+380671002002');
  INSERT INTO order_addresses (order_id, city, street, building, lat, lng) VALUES (v_id, 'Львів', 'Городоцька', '60', '49.8383', '24.0070');
  INSERT INTO order_specifications (order_id, material_type, area_sqm) VALUES (v_id, 'Мармур', 20.0);

  INSERT INTO orders (branch_id, status, order_number, external_id) VALUES (v_lviv, 'MEASUREMENT_SCHEDULING', 'TEST-LV3', '88-200003') RETURNING id INTO v_id;
  INSERT INTO order_contacts (order_id, full_name, phone) VALUES (v_id, 'Василь Дмитрик', '+380671002003');
  INSERT INTO order_addresses (order_id, city, street, building, lat, lng) VALUES (v_id, 'Львів', 'Стрийська', '95', '49.8072', '24.0168');
  INSERT INTO order_specifications (order_id, material_type, area_sqm) VALUES (v_id, 'Кварц', 11.5);

  INSERT INTO orders (branch_id, status, order_number, external_id) VALUES (v_lviv, 'MEASUREMENT_SCHEDULING', 'TEST-LV4', '88-200004') RETURNING id INTO v_id;
  INSERT INTO order_contacts (order_id, full_name, phone) VALUES (v_id, 'Ірина Павлик', '+380671002004');
  INSERT INTO order_addresses (order_id, city, street, building, lat, lng) VALUES (v_id, 'Львів', 'Січових Стрільців', '15', '49.8475', '24.0275');
  INSERT INTO order_specifications (order_id, material_type, area_sqm) VALUES (v_id, 'Граніт', 32.0);

  INSERT INTO orders (branch_id, status, order_number, external_id) VALUES (v_lviv, 'MEASUREMENT_SCHEDULING', 'TEST-LV5', '88-200005') RETURNING id INTO v_id;
  INSERT INTO order_contacts (order_id, full_name, phone) VALUES (v_id, 'Тарас Гнатюк', '+380671002005');
  INSERT INTO order_addresses (order_id, city, street, building, lat, lng) VALUES (v_id, 'Львів', 'Шевченка', '120', '49.8325', '24.0105');
  INSERT INTO order_specifications (order_id, material_type, area_sqm) VALUES (v_id, 'Мармур', 16.0);

  UPDATE orders SET id = id WHERE order_number LIKE 'TEST-K%' OR order_number LIKE 'TEST-LV%';
END $$;
