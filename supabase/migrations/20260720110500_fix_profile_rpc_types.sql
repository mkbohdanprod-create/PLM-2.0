DROP FUNCTION IF EXISTS public.update_employee_profile(uuid, text, boolean, uuid, text, numeric, numeric, text[], text[]);
DROP FUNCTION IF EXISTS public.update_employee_profile(uuid, text, boolean, uuid, text, numeric, numeric, text[], text[], uuid);

CREATE OR REPLACE FUNCTION public.update_employee_profile(
  p_id uuid,
  p_role_code text,
  p_is_active boolean,
  p_branch_id uuid,
  p_color text,
  p_base_lat numeric,
  p_base_lng numeric,
  p_allowed_view_regions uuid[],
  p_allowed_action_regions uuid[],
  p_region_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.profiles 
  SET role_code = p_role_code, 
      is_active = p_is_active,
      branch_id = p_branch_id,
      region_id = p_region_id,
      color = p_color,
      base_lat = p_base_lat,
      base_lng = p_base_lng,
      allowed_view_regions = p_allowed_view_regions,
      allowed_action_regions = p_allowed_action_regions,
      updated_at = now() 
  WHERE id = p_id;
  RETURN FOUND;
END;
$function$;
