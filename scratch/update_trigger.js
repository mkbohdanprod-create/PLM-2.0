const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  await client.connect();
  
  try {
    // 1. Insert NEW_USER role if it doesn't exist
    await client.query(`
      INSERT INTO roles (code, name_ua, is_system, permissions) 
      VALUES ('NEW_USER', 'Новий користувач', true, '[]'::jsonb)
      ON CONFLICT (code) DO NOTHING;
    `);
    console.log('Created NEW_USER role');
  } catch (e) { console.log('Error inserting NEW_USER role:', e.message); }

  try {
    // 2. Update the trigger function
    await client.query(`
      CREATE OR REPLACE FUNCTION public.handle_new_user()
      RETURNS trigger AS $$
      BEGIN
        INSERT INTO public.profiles (id, full_name, role_code, is_active)
        VALUES (
          new.id, 
          COALESCE(new.raw_user_meta_data->>'full_name', new.email),
          'NEW_USER',
          false
        );
        RETURN new;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `);
    console.log('Updated handle_new_user trigger');
  } catch (e) { console.log('Error updating trigger:', e.message); }

  await client.end();
}

run().catch(console.error);
