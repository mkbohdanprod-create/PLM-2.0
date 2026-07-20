-- 20260702123500_draft_simplification.sql

-- 1. Add columns to orders
ALTER TABLE public.orders 
ADD COLUMN external_id text,
ADD COLUMN is_incomplete boolean NOT NULL DEFAULT false;

-- 2. Function to update is_incomplete based on children
CREATE OR REPLACE FUNCTION public.update_order_incomplete_status() RETURNS trigger AS $$
DECLARE
  v_order_id uuid;
  v_has_address boolean;
  v_has_spec boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_order_id := OLD.order_id;
  ELSE
    v_order_id := NEW.order_id;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.order_addresses 
    WHERE order_id = v_order_id 
      AND street IS NOT NULL AND street != '' 
      AND building IS NOT NULL AND building != ''
  ) INTO v_has_address;

  SELECT EXISTS(
    SELECT 1 FROM public.order_specifications 
    WHERE order_id = v_order_id 
      AND material_type IS NOT NULL AND material_type != '' 
      AND area_sqm IS NOT NULL AND area_sqm > 0
  ) INTO v_has_spec;

  UPDATE public.orders 
  SET is_incomplete = NOT (v_has_address AND v_has_spec)
  WHERE id = v_order_id;

  RETURN NULL; -- AFTER trigger
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_incomplete_addr
AFTER INSERT OR UPDATE OR DELETE ON public.order_addresses
FOR EACH ROW EXECUTE PROCEDURE public.update_order_incomplete_status();

CREATE TRIGGER trg_check_incomplete_spec
AFTER INSERT OR UPDATE OR DELETE ON public.order_specifications
FOR EACH ROW EXECUTE PROCEDURE public.update_order_incomplete_status();

-- 3. Update state machine: block scheduling if incomplete
-- (Handled explicitly in change_order_status below)

-- 4. Delete DRAFT from transitions
DELETE FROM public.status_transitions WHERE from_status = 'DRAFT' OR to_status = 'DRAFT';

-- 5. Update change_order_status
CREATE OR REPLACE FUNCTION public.change_order_status(
  p_order_id uuid,
  p_new_status text
) RETURNS boolean AS $$
DECLARE
  v_current_status text;
  v_is_incomplete boolean;
  v_role text;
BEGIN
  SELECT status, is_incomplete INTO v_current_status, v_is_incomplete 
  FROM public.orders WHERE id = p_order_id FOR UPDATE;
  
  v_role := public.get_user_role();
  
  IF v_current_status = p_new_status THEN
    RETURN true;
  END IF;

  IF v_current_status = 'PAUSED' AND p_new_status = 'RESUME' THEN
    SELECT previous_status INTO p_new_status FROM public.orders WHERE id = p_order_id;
    IF p_new_status IS NULL THEN
      p_new_status := 'NEW';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.status_transitions 
      WHERE from_status = v_current_status AND to_status = p_new_status AND v_role = ANY(allowed_roles)
    ) THEN
      RAISE EXCEPTION 'Transition from % to % not allowed for role %', v_current_status, p_new_status, v_role;
    END IF;
  END IF;

  -- Check if incomplete and moving to a working state
  IF v_is_incomplete = true AND p_new_status NOT IN ('PAUSED', 'CANCELLED', 'NEW') THEN
    RAISE EXCEPTION 'Cannot transition: Order is incomplete. Please fill all required fields.';
  END IF;

  UPDATE public.orders 
  SET previous_status = v_current_status, status = p_new_status
  WHERE id = p_order_id;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Replace create_order_draft with create_order
DROP FUNCTION IF EXISTS public.create_order_draft(uuid, text, text, text, text, text, text, boolean);

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
  p_force boolean DEFAULT false
) RETURNS json AS $$
DECLARE
  v_dup_check json;
  v_order_id uuid;
  v_phone_norm text;
  v_is_incomplete boolean;
BEGIN
  v_phone_norm := regexp_replace(p_phone, '[^0-9]', '', 'g');

  IF NOT p_force THEN
    v_dup_check := public.check_order_duplicates(p_full_name, p_phone, p_city, p_street, p_building);
    IF json_array_length(v_dup_check) > 0 THEN
      RETURN json_build_object('success', false, 'error', 'DUPLICATES_FOUND', 'duplicates', v_dup_check);
    END IF;
  END IF;
  
  -- Compute incomplete initially
  v_is_incomplete := false;
  IF p_street IS NULL OR p_street = '' OR p_building IS NULL OR p_building = '' THEN
    v_is_incomplete := true;
  END IF;
  IF p_material IS NULL OR p_material = '' OR p_area IS NULL OR p_area <= 0 THEN
    v_is_incomplete := true;
  END IF;

  INSERT INTO public.orders (order_number, external_id, branch_id, status, order_type, is_incomplete)
  VALUES ('O-' || upper(substr(md5(random()::text), 1, 6)), p_external_id, p_branch_id, 'NEW', p_order_type, v_is_incomplete)
  RETURNING id INTO v_order_id;
  
  INSERT INTO public.order_contacts (order_id, full_name, phone, phone_normalized)
  VALUES (v_order_id, p_full_name, p_phone, v_phone_norm);
  
  IF p_street IS NOT NULL OR p_city IS NOT NULL THEN
    INSERT INTO public.order_addresses (order_id, city, street, building)
    VALUES (v_order_id, COALESCE(p_city, ''), COALESCE(p_street, ''), COALESCE(p_building, ''));
  END IF;

  IF p_material IS NOT NULL OR p_area IS NOT NULL THEN
    INSERT INTO public.order_specifications (order_id, material_type, area_sqm)
    VALUES (v_order_id, COALESCE(p_material, ''), COALESCE(p_area, 0));
  END IF;
  
  RETURN json_build_object('success', true, 'order_id', v_order_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
