const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  await client.connect();
  
  try {
    await client.query(`
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
          IF TG_TABLE_NAME = 'roles' THEN
            v_record_id := NEW.code::text;
          ELSE
            v_record_id := NEW.id::text;
          END IF;
        ELSIF TG_OP = 'DELETE' THEN
          v_old_data := to_jsonb(OLD);
          IF TG_TABLE_NAME = 'roles' THEN
            v_record_id := OLD.code::text;
          ELSE
            v_record_id := OLD.id::text;
          END IF;
        ELSIF TG_OP = 'INSERT' THEN
          v_new_data := to_jsonb(NEW);
          IF TG_TABLE_NAME = 'roles' THEN
            v_record_id := NEW.code::text;
          ELSE
            v_record_id := NEW.id::text;
          END IF;
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
    `);
    console.log('Fixed log_changes trigger');
    
    await client.query(`
      INSERT INTO roles (code, name_ua, is_system, permissions) 
      VALUES ('NEW_USER', 'Новий користувач', true, '[]'::jsonb)
      ON CONFLICT (code) DO NOTHING;
    `);
    console.log('Created NEW_USER role');

  } catch (e) { console.log('Error:', e.message); }

  await client.end();
}

run().catch(console.error);
