-- 20260702130000_master_data.sql

-- 1. Create tables
CREATE TABLE public.materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text, -- 'SOLID', 'SOFT', 'SLAB' etc
  is_hidden boolean DEFAULT false,
  is_system boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.decors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid REFERENCES public.materials(id) ON DELETE CASCADE,
  name text NOT NULL,
  code_1c text,
  is_hidden boolean DEFAULT false,
  is_system boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.pause_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  default_days integer,
  is_hidden boolean DEFAULT false,
  is_system boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.brigades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_hidden boolean DEFAULT false,
  is_system boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.task_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order integer DEFAULT 0,
  is_hidden boolean DEFAULT false,
  is_system boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.cancel_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_hidden boolean DEFAULT false,
  is_system boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 2. Protect system records trigger
CREATE OR REPLACE FUNCTION public.protect_system_records() RETURNS trigger AS $$
BEGIN
  IF OLD.is_system = true AND TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Cannot delete system record';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protect_materials BEFORE DELETE ON public.materials FOR EACH ROW EXECUTE PROCEDURE public.protect_system_records();
CREATE TRIGGER trg_protect_decors BEFORE DELETE ON public.decors FOR EACH ROW EXECUTE PROCEDURE public.protect_system_records();
CREATE TRIGGER trg_protect_pause_reasons BEFORE DELETE ON public.pause_reasons FOR EACH ROW EXECUTE PROCEDURE public.protect_system_records();
CREATE TRIGGER trg_protect_brigades BEFORE DELETE ON public.brigades FOR EACH ROW EXECUTE PROCEDURE public.protect_system_records();
CREATE TRIGGER trg_protect_task_types BEFORE DELETE ON public.task_types FOR EACH ROW EXECUTE PROCEDURE public.protect_system_records();
CREATE TRIGGER trg_protect_cancel_reasons BEFORE DELETE ON public.cancel_reasons FOR EACH ROW EXECUTE PROCEDURE public.protect_system_records();


-- 3. Modify existing tables
ALTER TABLE public.orders RENAME COLUMN cancel_reason TO cancel_reason_text;
ALTER TABLE public.orders ADD COLUMN cancel_reason_id uuid REFERENCES public.cancel_reasons(id);
ALTER TABLE public.orders ADD COLUMN pause_reason_id uuid REFERENCES public.pause_reasons(id);

ALTER TABLE public.order_specifications ADD COLUMN material_id uuid REFERENCES public.materials(id);
ALTER TABLE public.order_specifications ADD COLUMN decor_id uuid REFERENCES public.decors(id);

-- 4. Enable RLS and Policies
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pause_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brigades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cancel_reasons ENABLE ROW LEVEL SECURITY;

-- SELECT for all authenticated
CREATE POLICY "Select materials" ON public.materials FOR SELECT USING (true);
CREATE POLICY "Select decors" ON public.decors FOR SELECT USING (true);
CREATE POLICY "Select pause_reasons" ON public.pause_reasons FOR SELECT USING (true);
CREATE POLICY "Select brigades" ON public.brigades FOR SELECT USING (true);
CREATE POLICY "Select task_types" ON public.task_types FOR SELECT USING (true);
CREATE POLICY "Select cancel_reasons" ON public.cancel_reasons FOR SELECT USING (true);

-- INSERT/UPDATE/DELETE only for SUPER_ADMIN
CREATE POLICY "Modify materials" ON public.materials FOR ALL USING (public.get_user_role() = 'SUPER_ADMIN');
CREATE POLICY "Modify decors" ON public.decors FOR ALL USING (public.get_user_role() = 'SUPER_ADMIN');
CREATE POLICY "Modify pause_reasons" ON public.pause_reasons FOR ALL USING (public.get_user_role() = 'SUPER_ADMIN');
CREATE POLICY "Modify brigades" ON public.brigades FOR ALL USING (public.get_user_role() = 'SUPER_ADMIN');
CREATE POLICY "Modify task_types" ON public.task_types FOR ALL USING (public.get_user_role() = 'SUPER_ADMIN');
CREATE POLICY "Modify cancel_reasons" ON public.cancel_reasons FOR ALL USING (public.get_user_role() = 'SUPER_ADMIN');


-- 5. Seed Data
INSERT INTO public.materials (name, category, is_system) VALUES 
('Граніт', 'SOLID', true),
('Кварц', 'SOLID', true),
('Акрил', 'SOFT', true),
('HPL', 'SLAB', true),
('Компакт-плита', 'SLAB', true);

INSERT INTO public.pause_reasons (name, default_days, is_system) VALUES 
('Чекаємо кухню', 14, true),
('Клієнт у від''їзді', 7, true),
('Проблема на об''єкті', 3, true);

INSERT INTO public.cancel_reasons (name, is_system) VALUES 
('Дорого', true),
('Передумав', true),
('Не підходять строки', true),
('Технічно неможливо', true);

INSERT INTO public.task_types (name, sort_order, is_system) VALUES 
('Конструктив', 1, true),
('Технолог', 2, true),
('Розкрій твердих', 3, true),
('Розкрій акрилу', 4, true),
('Розкрій компакт-плити', 5, true);
