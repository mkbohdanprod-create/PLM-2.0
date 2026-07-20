-- 20260702145000_fix_profile_regions.sql

CREATE OR REPLACE FUNCTION public.set_default_profile_regions()
RETURNS trigger AS $$
DECLARE
  v_region_id uuid;
BEGIN
  IF NEW.role_code = 'SUPER_ADMIN' THEN
    NEW.allowed_view_regions := NULL;
    NEW.allowed_action_regions := NULL;
  ELSIF NEW.role_code IS NULL THEN
    NEW.allowed_view_regions := ARRAY[]::uuid[];
    NEW.allowed_action_regions := ARRAY[]::uuid[];
  ELSIF NEW.branch_id IS NOT NULL AND (
    NEW.allowed_view_regions IS NULL OR 
    NEW.allowed_view_regions = ARRAY[]::uuid[] OR 
    NEW.allowed_action_regions IS NULL OR 
    NEW.allowed_action_regions = ARRAY[]::uuid[]
  ) THEN
    SELECT region_id INTO v_region_id FROM public.branches WHERE id = NEW.branch_id;
    IF v_region_id IS NOT NULL THEN
      IF NEW.allowed_view_regions IS NULL OR NEW.allowed_view_regions = ARRAY[]::uuid[] THEN
        NEW.allowed_view_regions := ARRAY[v_region_id];
      END IF;
      IF NEW.allowed_action_regions IS NULL OR NEW.allowed_action_regions = ARRAY[]::uuid[] THEN
        NEW.allowed_action_regions := ARRAY[v_region_id];
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
