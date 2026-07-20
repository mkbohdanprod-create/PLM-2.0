CREATE TYPE public.activity_type AS ENUM ('CALL', 'SMS', 'EMAIL', 'MEETING', 'INTERNAL_NOTE', 'OTHER');
CREATE TYPE public.activity_outcome AS ENUM ('ANSWERED', 'NO_ANSWER', 'REFUSED', 'RESCHEDULED', 'DONE');

CREATE TABLE public.order_activities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    title text NOT NULL,
    activity_type public.activity_type NOT NULL,
    planned_at timestamptz NOT NULL,
    comment text,
    status text DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED')),
    outcome public.activity_outcome,
    outcome_notes text,
    assigned_to_role text,
    created_by uuid REFERENCES auth.users(id),
    completed_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    completed_at timestamptz
);

ALTER TABLE public.order_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all actions for authenticated users" ON public.order_activities
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
