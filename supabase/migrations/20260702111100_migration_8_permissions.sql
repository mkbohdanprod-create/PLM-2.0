-- 1. Alter profiles
ALTER TABLE public.profiles 
ADD COLUMN allowed_view_regions uuid[] DEFAULT NULL,
ADD COLUMN allowed_action_regions uuid[] DEFAULT NULL;

-- 2. Prevent Self-escalation
CREATE OR REPLACE FUNCTION public.prevent_self_escalation()
RETURNS trigger AS $$
BEGIN
  IF public.get_user_role() != 'SUPER_ADMIN' AND auth.uid() = OLD.id THEN
    IF NEW.role_code IS DISTINCT FROM OLD.role_code OR
       NEW.branch_id IS DISTINCT FROM OLD.branch_id OR
       NEW.allowed_view_regions IS DISTINCT FROM OLD.allowed_view_regions OR
       NEW.allowed_action_regions IS DISTINCT FROM OLD.allowed_action_regions THEN
      RAISE EXCEPTION 'Ви не можете змінити власні права';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER prevent_self_escalation_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.prevent_self_escalation();

-- 3. Default regions assignment
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
  ELSIF NEW.branch_id IS NOT NULL AND (NEW.allowed_view_regions IS NULL OR NEW.allowed_action_regions IS NULL) THEN
    SELECT region_id INTO v_region_id FROM public.branches WHERE id = NEW.branch_id;
    IF v_region_id IS NOT NULL THEN
      IF NEW.allowed_view_regions IS NULL THEN
        NEW.allowed_view_regions := ARRAY[v_region_id];
      END IF;
      IF NEW.allowed_action_regions IS NULL THEN
        NEW.allowed_action_regions := ARRAY[v_region_id];
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER set_default_profile_regions_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.set_default_profile_regions();

-- 4. Update Orders RLS
DROP POLICY IF EXISTS "Orders viewable by SUPER_ADMIN" ON public.orders;
DROP POLICY IF EXISTS "Orders editable by SUPER_ADMIN" ON public.orders;
DROP POLICY IF EXISTS "Orders viewable by REGION_MANAGER" ON public.orders;
DROP POLICY IF EXISTS "Orders insertable by REGION_MANAGER" ON public.orders;
DROP POLICY IF EXISTS "Orders updatable by REGION_MANAGER" ON public.orders;
DROP POLICY IF EXISTS "Orders viewable by BRANCH_MANAGER_DISPATCHER" ON public.orders;
DROP POLICY IF EXISTS "Orders insertable by BRANCH_MANAGER_DISPATCHER" ON public.orders;
DROP POLICY IF EXISTS "Orders updatable by BRANCH_MANAGER_DISPATCHER" ON public.orders;

-- Drop old helper
DROP FUNCTION IF EXISTS public.is_order_in_user_region(uuid);

-- Helpers for new policies
CREATE OR REPLACE FUNCTION public.get_user_allowed_view_regions() RETURNS uuid[] AS $$
  SELECT allowed_view_regions FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_user_allowed_action_regions() RETURNS uuid[] AS $$
  SELECT allowed_action_regions FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Single Unified SELECT Policy
CREATE POLICY "Orders viewable by region" ON public.orders FOR SELECT USING (
  is_hidden = false AND 
  (
    public.get_user_allowed_view_regions() IS NULL 
    OR 
    (SELECT region_id FROM public.branches WHERE id = orders.branch_id) = ANY(public.get_user_allowed_view_regions())
  )
);

-- Unified INSERT Policy
CREATE POLICY "Orders insertable by region" ON public.orders FOR INSERT WITH CHECK (
  (
    public.get_user_allowed_action_regions() IS NULL 
    OR 
    (SELECT region_id FROM public.branches WHERE id = branch_id) = ANY(public.get_user_allowed_action_regions())
  )
);

-- Unified UPDATE Policy
CREATE POLICY "Orders updatable by region" ON public.orders FOR UPDATE USING (
  is_hidden = false AND
  (
    public.get_user_allowed_action_regions() IS NULL 
    OR 
    (SELECT region_id FROM public.branches WHERE id = branch_id) = ANY(public.get_user_allowed_action_regions())
  )
) WITH CHECK (
  is_hidden = false AND
  (
    public.get_user_allowed_action_regions() IS NULL 
    OR 
    (SELECT region_id FROM public.branches WHERE id = branch_id) = ANY(public.get_user_allowed_action_regions())
  )
);
