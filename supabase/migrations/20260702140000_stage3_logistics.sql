-- 20260702140000_stage3_logistics.sql

-- 1. Modify order_addresses
ALTER TABLE public.order_addresses ADD COLUMN is_manually_pinned boolean DEFAULT false;

-- 2. Create worker_schedules table
CREATE TABLE public.worker_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  work_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text CHECK (status IN ('WORKING', 'SICK', 'VACATION', 'DAY_OFF')) DEFAULT 'WORKING',
  created_at timestamptz DEFAULT now(),
  UNIQUE(profile_id, work_date)
);

ALTER TABLE public.worker_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Select worker_schedules" ON public.worker_schedules FOR SELECT USING (true);
CREATE POLICY "Insert worker_schedules" ON public.worker_schedules FOR INSERT WITH CHECK (
  public.get_user_role() IN ('DISPATCHER', 'SUPER_ADMIN')
);
CREATE POLICY "Update worker_schedules" ON public.worker_schedules FOR UPDATE USING (
  public.get_user_role() IN ('DISPATCHER', 'SUPER_ADMIN')
) WITH CHECK (
  public.get_user_role() IN ('DISPATCHER', 'SUPER_ADMIN')
);
CREATE POLICY "Delete worker_schedules" ON public.worker_schedules FOR DELETE USING (
  public.get_user_role() IN ('DISPATCHER', 'SUPER_ADMIN')
);

-- 3. Create measurement_tasks table
CREATE TABLE public.measurement_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  measurer_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT NOT NULL,
  scheduled_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  estimated_travel_time_mins integer,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.measurement_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Select measurement_tasks" ON public.measurement_tasks FOR SELECT USING (true);
CREATE POLICY "Insert measurement_tasks" ON public.measurement_tasks FOR INSERT WITH CHECK (
  public.get_user_role() IN ('DISPATCHER', 'SUPER_ADMIN')
);
CREATE POLICY "Update measurement_tasks" ON public.measurement_tasks FOR UPDATE USING (
  public.get_user_role() IN ('DISPATCHER', 'SUPER_ADMIN')
) WITH CHECK (
  public.get_user_role() IN ('DISPATCHER', 'SUPER_ADMIN')
);
CREATE POLICY "Delete measurement_tasks" ON public.measurement_tasks FOR DELETE USING (
  public.get_user_role() IN ('DISPATCHER', 'SUPER_ADMIN')
);

-- 4. Seed Data: Create a measurer and assign a schedule
-- Note: Requires a profile with role MEASURER. We can insert a dummy profile directly for testing purposes.
INSERT INTO auth.users (id, email) VALUES ('11111111-1111-1111-1111-111111111111', 'measurer1@test.com') ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, full_name, role_code, branch_id) 
SELECT '11111111-1111-1111-1111-111111111111', 'Іван Замірник', 'MEASURER', id
FROM public.branches LIMIT 1
ON CONFLICT DO NOTHING;

-- Assign schedule for the next 7 days for the test measurer
INSERT INTO public.worker_schedules (profile_id, work_date, start_time, end_time, status)
SELECT 
  '11111111-1111-1111-1111-111111111111', 
  CURRENT_DATE + i, 
  '09:00:00', 
  '18:00:00', 
  CASE WHEN extract(isodow from CURRENT_DATE + i) IN (6, 7) THEN 'DAY_OFF' ELSE 'WORKING' END
FROM generate_series(0, 14) as i
ON CONFLICT DO NOTHING;
