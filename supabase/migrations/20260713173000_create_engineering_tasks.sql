CREATE TABLE public.engineering_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    assigned_to uuid REFERENCES auth.users(id),
    specialization_type text NOT NULL,
    status text DEFAULT 'IN_PROGRESS' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED')),
    area_sqm numeric DEFAULT 0,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    completed_at timestamptz
);

ALTER TABLE public.engineering_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for authenticated users" ON public.engineering_tasks
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Тригер для updated_at
CREATE OR REPLACE FUNCTION public.set_engineering_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_engineering_tasks_updated_at
BEFORE UPDATE ON public.engineering_tasks
FOR EACH ROW
EXECUTE FUNCTION public.set_engineering_tasks_updated_at();
