-- Migration: Add external dates
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS document_date date,
ADD COLUMN IF NOT EXISTS base_readiness_date date,
ADD COLUMN IF NOT EXISTS payment_date date,
ADD COLUMN IF NOT EXISTS calc_readiness_date date;

-- Update create_order to accept these dates
-- Drop the old one first to avoid overload issues (since we add parameters)
DROP FUNCTION IF EXISTS public.create_order(text, uuid, text, text, text, text, text, text, text, numeric, boolean, numeric, numeric);

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
  p_calc_readiness_date date DEFAULT NULL::date
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

  INSERT INTO public.orders (order_number, external_id, branch_id, status, order_type, document_date, base_readiness_date, payment_date, calc_readiness_date)
  VALUES ('O-' || upper(substr(md5(random()::text), 1, 6)), p_external_id, p_branch_id, v_initial_status, p_order_type, p_document_date, p_base_readiness_date, p_payment_date, p_calc_readiness_date)
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

-- Function to update dates
CREATE OR REPLACE FUNCTION public.update_order_dates(
  p_order_id uuid,
  p_document_date date DEFAULT NULL::date,
  p_base_readiness_date date DEFAULT NULL::date,
  p_payment_date date DEFAULT NULL::date,
  p_calc_readiness_date date DEFAULT NULL::date
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $function$
BEGIN
  -- Basic security check happens via RLS on UPDATE
  UPDATE public.orders
  SET 
    document_date = p_document_date,
    base_readiness_date = p_base_readiness_date,
    payment_date = p_payment_date,
    calc_readiness_date = p_calc_readiness_date,
    updated_at = now()
  WHERE id = p_order_id;

  RETURN json_build_object('success', true);
END;
$function$;
