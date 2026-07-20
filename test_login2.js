const fs = require('fs');

const supabaseUrl = 'http://127.0.0.1:54321';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYzNjAyMTEzOSwiZXhwIjoxOTUxMzgxMTM5fQ.N_l-x48P6xV_hG-P3-jF0cZ7f2V4h0M9D-t4vH0D1wQ';

let env = '';
try { env = fs.readFileSync('c:/hhgh/PLM module/.env', 'utf8'); } catch(e){}
let url = supabaseUrl; let key = supabaseKey;
const matchUrl = env.match(/VITE_SUPABASE_URL=(.+)/);
if (matchUrl) url = matchUrl[1].trim();
const matchKey = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/);
if (matchKey) key = matchKey[1].trim();

async function testLogin() {
  const req = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email: 'admin@test.com', password: 'password123' })
  });
  
  const res = await req.json();
  if (req.status !== 200) {
    console.error('Login Error:', res.error_description || res.msg || res);
  } else {
    console.log('Login Success! User ID:', res.user.id);
  }
}
testLogin();
