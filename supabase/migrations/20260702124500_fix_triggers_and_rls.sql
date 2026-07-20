-- 1. Fix RLS function error
CREATE OR REPLACE FUNCTION public.can_access_order(p_order_id uuid) RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = p_order_id AND (
      public.get_user_role() = 'SUPER_ADMIN' OR
      (public.get_user_allowed_view_regions() IS NULL OR (SELECT region_id FROM public.branches WHERE id = o.branch_id) = ANY(public.get_user_allowed_view_regions()))
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2. Convert AFTER triggers to BEFORE triggers for is_incomplete
DROP TRIGGER IF EXISTS trg_check_incomplete_addr ON public.order_addresses;
DROP TRIGGER IF EXISTS trg_check_incomplete_spec ON public.order_specifications;

CREATE OR REPLACE FUNCTION public.check_is_incomplete() RETURNS trigger AS $$
DECLARE
  v_has_address boolean;
  v_has_spec boolean;
BEGIN
  -- We assume this runs BEFORE INSERT OR UPDATE ON orders.
  -- To properly calculate this for newly inserted orders (which have no children yet),
  -- we check the child tables. If they don't exist, it evaluates to TRUE (incomplete).
  -- When create_order runs, it updates the order at the end to trigger this again.
  SELECT EXISTS(
    SELECT 1 FROM public.order_addresses 
    WHERE order_id = NEW.id 
      AND street IS NOT NULL AND street != '' 
      AND building IS NOT NULL AND building != ''
  ) INTO v_has_address;

  SELECT EXISTS(
    SELECT 1 FROM public.order_specifications 
    WHERE order_id = NEW.id 
      AND material_type IS NOT NULL AND material_type != '' 
      AND area_sqm IS NOT NULL AND area_sqm > 0
  ) INTO v_has_spec;

  NEW.is_incomplete := NOT (v_has_address AND v_has_spec);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_is_incomplete
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE PROCEDURE public.check_is_incomplete();

-- 3. Modify create_order to trigger the BEFORE UPDATE after children are inserted
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
BEGIN
  v_phone_norm := regexp_replace(p_phone, '[^0-9]', '', 'g');

  IF NOT p_force THEN
    v_dup_check := public.check_order_duplicates(p_full_name, p_phone, p_city, p_street, p_building);
    IF json_array_length(v_dup_check) > 0 THEN
      RETURN json_build_object('success', false, 'error', 'DUPLICATES_FOUND', 'duplicates', v_dup_check);
    END IF;
  END IF;

  -- Insert order. The BEFORE INSERT trigger will set is_incomplete = true
  -- because child tables are not inserted yet.
  INSERT INTO public.orders (order_number, external_id, branch_id, status, order_type)
  VALUES ('O-' || upper(substr(md5(random()::text), 1, 6)), p_external_id, p_branch_id, 'NEW', p_order_type)
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

  -- Touch the order to fire the BEFORE UPDATE trigger, which will now see the children
  -- and correctly compute is_incomplete.
  UPDATE public.orders SET id = id WHERE id = v_order_id;
  
  RETURN json_build_object('success', true, 'order_id', v_order_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
