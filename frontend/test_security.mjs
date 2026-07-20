import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runTest() {
  console.log("Testing direct UPDATE on 'status' column...");
  const { data: orders } = await supabase.from('orders').select('id').limit(1);
  if (!orders || orders.length === 0) {
    console.log("No orders found to test on.");
    return;
  }
  
  const testId = orders[0].id;
  console.log(`Attempting to update order ${testId} status to COMPLETED...`);
  
  const { error } = await supabase.from('orders').update({ status: 'COMPLETED' }).eq('id', testId);
  
  if (error) {
    console.log("✅ Security Check PASSED. Update blocked with error:");
    console.error(error);
  } else {
    console.log("❌ Security Check FAILED. Update succeeded.");
  }
}

runTest();
