import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: orderData } = await supabase
    .from('orders')
    .select('order_addresses(lat, lng)')
    .limit(1)
    .maybeSingle();
  console.log("orderData.order_addresses is Array?", Array.isArray(orderData?.order_addresses));
  console.log("Value:", orderData?.order_addresses);
}
run();
