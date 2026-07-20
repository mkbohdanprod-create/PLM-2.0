CREATE TABLE audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name text NOT NULL,
  record_id text NOT NULL,
  action text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  source text NOT NULL DEFAULT 'UI',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ONLY SELECT FOR SUPER ADMIN
CREATE POLICY "Audit logs viewable by SUPER_ADMIN" ON audit_logs FOR SELECT USING (public.get_user_role() = 'SUPER_ADMIN');

CREATE OR REPLACE FUNCTION public.log_changes()
RETURNS trigger AS $$
DECLARE
  v_old_data jsonb := NULL;
  v_new_data jsonb := NULL;
  v_record_id text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    v_record_id := NEW.id::text;
  ELSIF TG_OP = 'DELETE' THEN
    v_old_data := to_jsonb(OLD);
    v_record_id := OLD.id::text;
  ELSIF TG_OP = 'INSERT' THEN
    v_new_data := to_jsonb(NEW);
    v_record_id := NEW.id::text;
  END IF;

  INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by, source)
  VALUES (
    TG_TABLE_NAME, 
    v_record_id, 
    TG_OP, 
    v_old_data, 
    v_new_data, 
    auth.uid(), 
    COALESCE(NULLIF(current_setting('app.source', true), ''), 'UI')
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to orders
CREATE TRIGGER audit_orders_changes
  AFTER INSERT OR UPDATE OR DELETE ON orders
  FOR EACH ROW EXECUTE PROCEDURE public.log_changes();

CREATE TRIGGER audit_profiles_changes
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE PROCEDURE public.log_changes();

CREATE TRIGGER audit_branches_changes
  AFTER INSERT OR UPDATE OR DELETE ON branches
  FOR EACH ROW EXECUTE PROCEDURE public.log_changes();

CREATE TRIGGER audit_regions_changes
  AFTER INSERT OR UPDATE OR DELETE ON regions
  FOR EACH ROW EXECUTE PROCEDURE public.log_changes();

CREATE TRIGGER audit_roles_changes
  AFTER INSERT OR UPDATE OR DELETE ON roles
  FOR EACH ROW EXECUTE PROCEDURE public.log_changes();
