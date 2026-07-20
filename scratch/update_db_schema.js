const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  await client.connect();
  
  try {
    await client.query(`ALTER TABLE roles ADD COLUMN permissions JSONB DEFAULT '[]'::jsonb;`);
    console.log('Added permissions to roles');
  } catch (e) { console.log('Error adding permissions:', e.message); }

  try {
    await client.query(`ALTER TABLE profiles ADD COLUMN default_filters JSONB DEFAULT '{}'::jsonb;`);
    console.log('Added default_filters to profiles');
  } catch (e) { console.log('Error adding default_filters:', e.message); }

  try {
    // Insert NEW_USER role if it doesn't exist
    await client.query(`
      INSERT INTO roles (code, name_ua, is_system, permissions) 
      VALUES ('NEW_USER', 'Новий користувач', true, '[]'::jsonb)
      ON CONFLICT (code) DO NOTHING;
    `);
    console.log('Created NEW_USER role');
  } catch (e) { console.log('Error inserting NEW_USER role:', e.message); }

  await client.end();
}

run().catch(console.error);
