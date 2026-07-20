-- Fix create_order function to accept delivery_method added in Wave 5
-- First drop the old function to avoid overloading errors when frontend calls it
DROP FUNCTION IF EXISTS public.create_order(
  text, uuid, text, text, text, text, text, text, text, numeric, boolean, numeric, numeric, date, date, date, date
);

CREATE OR REPLACE FUNCTION public.create_order(
  p_external_id text, 
  p_branch_id uuid, 
  p_order_type text, 
  p_full_name text, 
  p_phone text, 
  p_city text, 
  p_street text DEFAULT NULL::text, 
  p_building text DEFAULT NULL::text, 
  p_material text DEFAULT NULL::text, 
  p_area numeric DEFAULT NULL::numeric, 
  p_force boolean DEFAULT false, 
  p_lat numeric DEFAULT NULL::numeric, 
  p_lng numeric DEFAULT NULL::numeric,
  p_document_date date DEFAULT NULL::date,
  p_base_readiness_date date DEFAULT NULL::date,
  p_payment_date date DEFAULT NULL::date,
  p_calc_readiness_date date DEFAULT NULL::date,
  p_delivery_method text DEFAULT 'DELIVERY'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_dup_check json;
  v_order_id uuid;
  v_phone_norm text;
  v_initial_status text;
  v_planned_call_date timestamptz;
  v_is_incomplete boolean;
BEGIN
  v_phone_norm := regexp_replace(p_phone, '[^0-9]', '', 'g');

  IF NOT p_force THEN
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_dup_check 
    FROM public.check_order_duplicates(p_full_name, p_phone, p_city, COALESCE(p_street, ''), COALESCE(p_building, '')) as t;
    
    IF json_array_length(v_dup_check) > 0 THEN
      RETURN json_build_object('success', false, 'error', 'DUPLICATES_FOUND', 'duplicates', v_dup_check);
    END IF;
  END IF;
  
  v_is_incomplete := false;
  IF p_street IS NULL OR p_street = '' OR p_building IS NULL OR p_building = '' THEN
    v_is_incomplete := true;
  END IF;
  IF p_material IS NULL OR p_material = '' OR p_area IS NULL OR p_area <= 0 THEN
    v_is_incomplete := true;
  END IF;

  IF p_order_type = 'BY_DRAWING' THEN
    v_initial_status := 'ENGINEERING_DESIGN';
  ELSE
    v_initial_status := 'MEASUREMENT_SCHEDULING';
  END IF;

  v_planned_call_date := CASE 
    WHEN v_initial_status = 'MEASUREMENT_SCHEDULING' THEN now() + interval '4 hours'
    ELSE NULL
  END;

  INSERT INTO public.orders (
    order_number, external_id, branch_id, status, order_type, is_incomplete, 
    document_date, base_readiness_date, payment_date, calc_readiness_date, 
    planned_call_date, call_comment, delivery_method
  )
  VALUES (
    'O-' || upper(substr(md5(random()::text), 1, 6)), p_external_id, p_branch_id, 
    v_initial_status, p_order_type, v_is_incomplete, p_document_date, 
    p_base_readiness_date, p_payment_date, p_calc_readiness_date, 
    v_planned_call_date, CASE WHEN v_planned_call_date IS NOT NULL THEN 'Нове замовлення' ELSE NULL END,
    p_delivery_method
  )
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

  INSERT INTO public.order_status_history (
    order_id, from_status, to_status, changed_by, source, reason, reason_id
  ) VALUES (
    v_order_id, NULL, v_initial_status, auth.uid(),
    COALESCE(current_setting('app.source', true), 'API'),
    NULL, NULL
  );

  -- Trigger is_incomplete check
  UPDATE public.orders SET id = id WHERE id = v_order_id;

  RETURN json_build_object('success', true, 'order_id', v_order_id);
END;
$function$;
