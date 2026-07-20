-- Update update_role_permissions RPC to accept and save permissions
DROP FUNCTION IF EXISTS public.update_role_permissions(text, text);

CREATE OR REPLACE FUNCTION public.update_role_permissions(p_code text, p_name_ua text, p_permissions text[])
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.roles 
  SET name_ua = p_name_ua,
      permissions = p_permissions
  WHERE code = p_code;
  RETURN FOUND;
END;
$$;
