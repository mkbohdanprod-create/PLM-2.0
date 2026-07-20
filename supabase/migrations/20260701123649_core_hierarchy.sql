-- 1. Roles table
CREATE TABLE roles (
  code text PRIMARY KEY,
  name_ua text NOT NULL,
  is_system boolean DEFAULT true
);

-- Seed Roles
INSERT INTO roles (code, name_ua, is_system) VALUES 
('SUPER_ADMIN', 'Супер-адміністратор', true),
('REGION_MANAGER', 'Регіональний керівник', true),
('BRANCH_MANAGER', 'Керівник філії', true),
('DISPATCHER', 'Диспетчер', true),
('ENGINEER', 'Конструктор / Інженер', true),
('MEASURER', 'Замірник', true),
('INSTALLER', 'Монтажник', true);

-- 2. Regions
CREATE TABLE regions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE
);

-- Seed Regions
INSERT INTO regions (name) VALUES 
('Центр'), ('Південь'), ('Захід'), ('Варшава');

-- 3. Branches
CREATE TABLE branches (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  region_id uuid REFERENCES regions(id) ON DELETE CASCADE
);

-- 4. Profiles (extends auth.users)
CREATE TABLE profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name text NOT NULL,
  role_code text REFERENCES roles(code) ON DELETE RESTRICT,
  branch_id uuid REFERENCES branches(id) ON DELETE RESTRICT,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Helper function to avoid RLS recursion
CREATE OR REPLACE FUNCTION public.get_user_role() RETURNS text AS $$
  SELECT role_code FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_user_branch() RETURNS uuid AS $$
  SELECT branch_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- RLS Setup
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Roles viewable by everyone" ON roles FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Regions viewable by everyone" ON regions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Regions editable by SUPER_ADMIN" ON regions FOR ALL USING (public.get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "Branches viewable by everyone" ON branches FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Branches editable by SUPER_ADMIN" ON branches FOR ALL USING (public.get_user_role() = 'SUPER_ADMIN');

CREATE POLICY "Profiles viewable by everyone" ON profiles FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Profiles updatable by SUPER_ADMIN or self" ON profiles FOR UPDATE USING (
  auth.uid() = id OR public.get_user_role() = 'SUPER_ADMIN'
) WITH CHECK (
  auth.uid() = id OR public.get_user_role() = 'SUPER_ADMIN'
);

CREATE POLICY "Profiles deletable by SUPER_ADMIN" ON profiles FOR DELETE USING (
  public.get_user_role() = 'SUPER_ADMIN'
);

CREATE POLICY "Profiles insertable by trigger" ON profiles FOR INSERT WITH CHECK (true);

-- Trigger for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role_code)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    NULL -- No role by default = minimal access
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
