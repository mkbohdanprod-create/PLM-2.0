ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_id text;

CREATE OR REPLACE FUNCTION public.admin_update_user_email(p_user_id uuid, p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE auth.users
  SET email = p_email
  WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_employee_profile_v2(
  p_id uuid,
  p_full_name text,
  p_phone text,
  p_telegram_id text,
  p_role_code text,
  p_is_active boolean,
  p_color text,
  p_base_lat numeric,
  p_base_lng numeric,
  p_allowed_view_regions uuid[],
  p_allowed_action_regions uuid[],
  p_region_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles 
  SET 
      full_name = p_full_name,
      phone = p_phone,
      telegram_id = p_telegram_id,
      role_code = p_role_code, 
      is_active = p_is_active,
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
$$;
