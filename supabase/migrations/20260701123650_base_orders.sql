CREATE TABLE orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number text NOT NULL UNIQUE,
  branch_id uuid REFERENCES branches(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'NEW',
  version integer NOT NULL DEFAULT 1,
  locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  lock_expires_at timestamptz,
  is_hidden boolean DEFAULT false,
  cancel_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Helper to check region
CREATE OR REPLACE FUNCTION public.is_order_in_user_region(order_branch_id uuid) RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.branches user_branch
    JOIN public.branches order_branch ON order_branch.region_id = user_branch.region_id
    WHERE user_branch.id = public.get_user_branch() AND order_branch.id = order_branch_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- RLS Policies
CREATE POLICY "Orders viewable by SUPER_ADMIN" ON orders FOR SELECT USING (public.get_user_role() = 'SUPER_ADMIN');
CREATE POLICY "Orders editable by SUPER_ADMIN" ON orders FOR ALL USING (public.get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "Orders viewable by REGION_MANAGER" ON orders FOR SELECT USING (
  public.get_user_role() = 'REGION_MANAGER' AND public.is_order_in_user_region(branch_id)
);
CREATE POLICY "Orders insertable by REGION_MANAGER" ON orders FOR INSERT WITH CHECK (
  public.get_user_role() = 'REGION_MANAGER' AND public.is_order_in_user_region(branch_id)
);
CREATE POLICY "Orders updatable by REGION_MANAGER" ON orders FOR UPDATE USING (
  public.get_user_role() = 'REGION_MANAGER' AND public.is_order_in_user_region(branch_id)
) WITH CHECK (
  public.get_user_role() = 'REGION_MANAGER' AND public.is_order_in_user_region(branch_id)
);

CREATE POLICY "Orders viewable by BRANCH_MANAGER_DISPATCHER" ON orders FOR SELECT USING (
  public.get_user_role() IN ('BRANCH_MANAGER', 'DISPATCHER') AND branch_id = public.get_user_branch()
);
CREATE POLICY "Orders insertable by BRANCH_MANAGER_DISPATCHER" ON orders FOR INSERT WITH CHECK (
  public.get_user_role() IN ('BRANCH_MANAGER', 'DISPATCHER') AND branch_id = public.get_user_branch()
);
CREATE POLICY "Orders updatable by BRANCH_MANAGER_DISPATCHER" ON orders FOR UPDATE USING (
  public.get_user_role() IN ('BRANCH_MANAGER', 'DISPATCHER') AND branch_id = public.get_user_branch()
) WITH CHECK (
  public.get_user_role() IN ('BRANCH_MANAGER', 'DISPATCHER') AND branch_id = public.get_user_branch()
);
