-- Fix overloaded create_order function that accepts p_lat and p_lng to bypass NEW status

CREATE OR REPLACE FUNCTION public.create_order(
  p_external_id text,
  p_branch_id uuid,
  p_order_type text,
  p_full_name text,
  p_phone text,
  p_city text,
  p_street text DEFAULT NULL,
  p_building text DEFAULT NULL,
  p_material text DEFAULT NULL,
  p_area numeric DEFAULT NULL,
  p_force boolean DEFAULT false,
  p_lat numeric DEFAULT NULL,
  p_lng numeric DEFAULT NULL
) RETURNS json AS $$
DECLARE
  v_dup_check json;
  v_order_id uuid;
  v_phone_norm text;
  v_initial_status text;
BEGIN
  v_phone_norm := regexp_replace(p_phone, '[^0-9]', '', 'g');

  IF NOT p_force THEN
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_dup_check 
    FROM public.check_order_duplicates(p_full_name, p_phone, p_city, COALESCE(p_street, ''), COALESCE(p_building, '')) as t;
    
    IF json_array_length(v_dup_check) > 0 THEN
      RETURN json_build_object('success', false, 'error', 'DUPLICATES_FOUND', 'duplicates', v_dup_check);
    END IF;
  END IF;
  
  -- Determine initial status based on order type (bypassing NEW)
  IF p_order_type = 'BY_DRAWING' THEN
    v_initial_status := 'ENGINEERING_DESIGN';
  ELSE
    v_initial_status := 'MEASUREMENT_SCHEDULING';
  END IF;

  INSERT INTO public.orders (order_number, external_id, branch_id, status, order_type)
  VALUES ('O-' || upper(substr(md5(random()::text), 1, 6)), p_external_id, p_branch_id, v_initial_status, p_order_type)
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_contacts (order_id, full_name, phone, phone_normalized)
  VALUES (v_order_id, p_full_name, p_phone, v_phone_norm);

  IF p_street IS NOT NULL OR p_city IS NOT NULL THEN
    INSERT INTO public.order_addresses (order_id, city, street, building, lat, lng)
    VALUES (v_order_id, COALESCE(p_city, ''), COALESCE(p_street, ''), COALESCE(p_building, ''), p_lat, p_lng);
  END IF;

  IF p_material IS NOT NULL OR p_area IS NOT NULL THEN
    INSERT INTO public.order_specifications (order_id, material_type, area_sqm)
    VALUES (v_order_id, COALESCE(p_material, ''), COALESCE(p_area, 0));
  END IF;

  -- Записуємо початковий статус в історію
  INSERT INTO public.order_status_history (
    order_id, from_status, to_status, changed_by, source, reason, reason_id
  ) VALUES (
    v_order_id, NULL, v_initial_status, auth.uid(),
    COALESCE(current_setting('app.source', true), 'API'),
    NULL, NULL
  );

  -- Оновлюємо is_incomplete через тригер або вручну якщо треба, але тригер вже має працювати
  UPDATE public.orders SET id = id WHERE id = v_order_id;

  RETURN json_build_object('success', true, 'order_id', v_order_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER VOLATILE;

-- Update existing manually created test orders
UPDATE public.orders 
SET status = CASE 
  WHEN order_type = 'BY_DRAWING' THEN 'ENGINEERING_DESIGN'
  ELSE 'MEASUREMENT_SCHEDULING'
END
WHERE status = 'NEW';
