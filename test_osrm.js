import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  const { data: o1 } = await supabase.from('orders').select('order_addresses(lat, lng)').eq('order_number', '83-5549854').single();
  const { data: o2 } = await supabase.from('orders').select('order_addresses(lat, lng)').eq('order_number', '83-454554').single();
  
  const lat1 = parseFloat(o1.order_addresses[0].lat);
  const lng1 = parseFloat(o1.order_addresses[0].lng);
  
  const lat2 = parseFloat(o2.order_addresses[0].lat);
  const lng2 = parseFloat(o2.order_addresses[0].lng);
  
  const baseLat = 50.4501;
  const baseLng = 30.5234;
  
  let res = await fetch(`https://router.project-osrm.org/route/v1/driving/${baseLng},${baseLat};${lng1},${lat1}?overview=false`);
  let json = await res.json();
  console.log("Leg 1 (Base -> Petro B) duration mins:", Math.round(json.routes[0].duration / 60));

  res = await fetch(`https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=false`);
  json = await res.json();
  console.log("Leg 2 (Petro B -> Vasylkiv) duration mins:", Math.round(json.routes[0].duration / 60));
  
  res = await fetch(`https://router.project-osrm.org/route/v1/driving/${baseLng},${baseLat};${lng2},${lat2}?overview=false`);
  json = await res.json();
  console.log("Leg 3 (Base -> Vasylkiv) duration mins:", Math.round(json.routes[0].duration / 60));
  
  res = await fetch(`https://router.project-osrm.org/route/v1/driving/${baseLng},${baseLat};${lng1},${lat1};${lng2},${lat2}?overview=false`);
  json = await res.json();
  console.log("Total Route duration mins:", Math.round(json.routes[0].duration / 60));
}
test();
