-- 05_order_details.sql
ALTER TABLE public.orders 
ADD COLUMN order_type text CHECK (order_type IN ('FULL_CYCLE', 'BY_DRAWING', 'NO_INSTALLATION')) DEFAULT 'FULL_CYCLE',
ADD COLUMN payment_percent numeric DEFAULT 0,
ADD COLUMN is_credit boolean DEFAULT false,
ADD COLUMN payment_updated_at timestamptz,
ADD COLUMN payment_source text,
ADD COLUMN previous_status text,
ADD COLUMN parent_order_id uuid REFERENCES public.orders(id);

CREATE TABLE public.order_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  full_name text NOT NULL,
  phone text NOT NULL,
  phone_normalized text,
  email text,
  role text DEFAULT 'CUSTOMER'
);

CREATE OR REPLACE FUNCTION public.normalize_phone() RETURNS trigger AS $$
BEGIN
  NEW.phone_normalized = regexp_replace(NEW.phone, '[^0-9]', '', 'g');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_normalize_phone
BEFORE INSERT OR UPDATE OF phone ON public.order_contacts
FOR EACH ROW EXECUTE PROCEDURE public.normalize_phone();

CREATE TABLE public.order_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  city text NOT NULL,
  street text NOT NULL,
  building text NOT NULL,
  lat numeric,
  lng numeric
);

CREATE TABLE public.order_specifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  material_type text,
  area_sqm numeric DEFAULT 0,
  total_amount numeric DEFAULT 0
);

-- RLS policies for new tables
ALTER TABLE public.order_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_specifications ENABLE ROW LEVEL SECURITY;

-- Helper to check if order is visible to user
CREATE OR REPLACE FUNCTION public.can_access_order(p_order_id uuid) RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = p_order_id AND (
      public.get_user_role() = 'SUPER_ADMIN' OR
      (public.get_user_role() = 'REGION_MANAGER' AND public.is_order_in_user_region(o.branch_id)) OR
      (public.get_user_role() IN ('BRANCH_MANAGER', 'DISPATCHER') AND o.branch_id = public.get_user_branch())
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE POLICY "Contacts access" ON public.order_contacts FOR ALL USING (public.can_access_order(order_id)) WITH CHECK (public.can_access_order(order_id));
CREATE POLICY "Addresses access" ON public.order_addresses FOR ALL USING (public.can_access_order(order_id)) WITH CHECK (public.can_access_order(order_id));
CREATE POLICY "Specifications access" ON public.order_specifications FOR ALL USING (public.can_access_order(order_id)) WITH CHECK (public.can_access_order(order_id));
