CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION admin_create_user(
  user_email text,
  user_password text,
  user_full_name text,
  user_role_code text,
  user_region_id uuid,
  user_color text
) RETURNS uuid AS $$
DECLARE
  new_uid uuid;
BEGIN
  new_uid := gen_random_uuid();
  
  -- Insert into auth.users
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, 
    email_confirmed_at, raw_user_meta_data, created_at, updated_at
  )
  VALUES (
    new_uid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    user_email,
    crypt(user_password, gen_salt('bf')),
    now(),
    json_build_object('name', user_full_name),
    now(),
    now()
  );

  -- The handle_new_user trigger automatically creates public.profiles row.
  -- We now update it with our custom fields.
  UPDATE public.profiles
  SET 
    role_code = user_role_code,
    region_id = user_region_id,
    color = user_color,
    is_active = true
  WHERE id = new_uid;

  RETURN new_uid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
