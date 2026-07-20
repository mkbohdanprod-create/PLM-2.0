const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('http://127.0.0.1:54321', process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZmF1bHQiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNzM1Njg5NjAwLCJleHAiOjIwNTEyMjU2MDB9');

async function test() {
  const { data: users } = await supabase.from('profiles').select('*');
  console.log('PROFILES:', users);
  
  // Try acting as dispatcher
  const dispatcher = users.find(u => u.role_code === 'DISPATCHER');
  console.log('DISPATCHER:', dispatcher);
  
  if (dispatcher) {
     const client = createClient('http://127.0.0.1:54321', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZmF1bHQiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTczNTY4OTYwMCwiZXhwIjoyMDUxMjI1NjAwfQ');
     // Login as dispatcher
     const { data: auth, error } = await client.auth.signInWithPassword({
        email: 'dispatcher@example.com',
        password: 'password123'
     });
     console.log('AUTH ERROR:', error);
     
     const { data: orders, error: ordErr } = await client.from('orders').select('id, branch_id');
     console.log('DISPATCHER ORDERS:', orders, ordErr);
     
     const { data: addresses, error: addErr } = await client.from('order_addresses').select('*');
     console.log('DISPATCHER ADDRESSES:', addresses, addErr);
  }
}
test();
