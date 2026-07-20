const { createClient } = require('@supabase/supabase-js');
// Find the anon key and url. Local dev usually:
const supabaseUrl = 'http://127.0.0.1:54321';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYzNjAyMTEzOSwiZXhwIjoxOTUxMzgxMTM5fQ.N_l-x48P6xV_hG-P3-jF0cZ7f2V4h0M9D-t4vH0D1wQ'; // default local anon key
// Wait, the project might have .env with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
const fs = require('fs');
let env = '';
try { env = fs.readFileSync('c:/hhgh/PLM module/.env', 'utf8'); } catch(e){}
let url = supabaseUrl; let key = supabaseKey;
const matchUrl = env.match(/VITE_SUPABASE_URL=(.+)/);
if (matchUrl) url = matchUrl[1].trim();
const matchKey = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/);
if (matchKey) key = matchKey[1].trim();

const supabase = createClient(url, key);

async function testLogin() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'admin@test.com',
    password: 'password123',
  });
  if (error) {
    console.error('Login Error:', error.message);
  } else {
    console.log('Login Success! User ID:', data.user.id);
  }
}
testLogin();
