require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createVehicle(name, plate, branch_id) {
  const { data, error } = await supabase.rpc('create_vehicle', {
    p_name: name,
    p_plate_number: plate,
    p_branch_id: branch_id
  });
  if (error) throw new Error(`Vehicle creation failed: ${error.message}`);
  return data;
}

async function runTest() {
  console.log('--- E2E TEST: WAVE 5 (DELIVERY) ---');

  // 1. Get dispatcher and branch
  const { data: dispatcher } = await supabase.from('profiles').select('*').eq('role_code', 'DISPATCHER').limit(1).single();
  const { data: admin } = await supabase.from('profiles').select('*').eq('role_code', 'SUPER_ADMIN').limit(1).single();
  if (!dispatcher || !admin) {
    console.error('Missing required profiles.');
    return;
  }
  const branch_id = admin.branch_id;

  // 2. Create a vehicle
  const vehicleName = 'Test Truck ' + Math.floor(Math.random() * 1000);
  let vehicleId;
  try {
    vehicleId = await createVehicle(vehicleName, 'AA1234BB', branch_id);
    console.log(`✅ Created vehicle: ${vehicleName} (${vehicleId})`);
  } catch(e) {
    console.log(e.message);
    const { data } = await supabase.from('vehicles').select('id').limit(1).single();
    vehicleId = data.id;
  }

  console.log('\\n>>> SCENARIO A: FULL CYCLE + DELIVERY');
  // 3. Create Order
  const { data: order1, error: e1 } = await supabase.from('orders').insert({
    order_number: 'E2E-W5-DEL-' + Math.floor(Math.random() * 10000),
    client_name: 'Delivery Client',
    client_phone: '+380501112233',
    address: 'Kyiv',
    branch_id: branch_id,
    order_type: 'FULL_CYCLE',
    delivery_method: 'DELIVERY',
    status: 'PRODUCTION_COMPLETED' // We can jump directly for testing
  }).select().single();
  if (e1) { console.error('Order1 error:', e1); return; }
  console.log(`Created order: ${order1.order_number}`);

  // Transition to DELIVERY_SCHEDULING using change_order_status
  console.log('Moving from PRODUCTION_COMPLETED to DELIVERY_SCHEDULING...');
  const { error: e2 } = await supabase.rpc('change_order_status', { p_order_id: order1.id, p_new_status: 'DELIVERY_SCHEDULING' });
  if (e2) console.error('Error:', e2);

  const { data: state1 } = await supabase.from('orders').select('status, macro_stage').eq('id', order1.id).single();
  console.log(`✅ Status: ${state1.status}, Macro Stage: ${state1.macro_stage}`);

  // Assign delivery
  console.log('Assigning delivery...');
  const { error: e3 } = await supabase.rpc('assign_delivery', {
    p_order_id: order1.id,
    p_driver_id: dispatcher.id,
    p_vehicle_id: vehicleId,
    p_scheduled_date: new Date().toISOString(),
    p_route_order: 1
  });
  if (e3) console.error('Assign error:', e3);
  
  const { data: tasks1 } = await supabase.from('delivery_tasks').select('*').eq('order_id', order1.id);
  console.log(`✅ Delivery tasks created: ${tasks1.length}`);

  // Delivery In Transit
  console.log('Starting delivery (DELIVERY_IN_TRANSIT)...');
  await supabase.rpc('change_order_status', { p_order_id: order1.id, p_new_status: 'DELIVERY_IN_TRANSIT' });

  // Delivery completed -> goes to INSTALLATION_SCHEDULING
  console.log('Completing delivery (attempting INSTALLATION_SCHEDULING)...');
  await supabase.rpc('change_order_status', { p_order_id: order1.id, p_new_status: 'INSTALLATION_SCHEDULING' });
  
  const { data: state2 } = await supabase.from('orders').select('status').eq('id', order1.id).single();
  console.log(`✅ Final status for FULL CYCLE: ${state2.status}`);

  console.log('\\n>>> SCENARIO B: BY DRAWING + PICKUP');
  const { data: order2 } = await supabase.from('orders').insert({
    order_number: 'E2E-W5-PIC-' + Math.floor(Math.random() * 10000),
    client_name: 'Pickup Client',
    client_phone: '+380501112233',
    address: 'Kyiv',
    branch_id: branch_id,
    order_type: 'BY_DRAWING',
    delivery_method: 'PICKUP',
    status: 'PRODUCTION_COMPLETED'
  }).select().single();

  console.log('Moving from PRODUCTION_COMPLETED to READY_FOR_PICKUP (auto-routes due to delivery_method=PICKUP)...');
  // We send DELIVERY_SCHEDULING but expect READY_FOR_PICKUP due to routing logic in change_order_status
  await supabase.rpc('change_order_status', { p_order_id: order2.id, p_new_status: 'DELIVERY_SCHEDULING' });
  const { data: state3 } = await supabase.from('orders').select('status, macro_stage').eq('id', order2.id).single();
  console.log(`✅ Status: ${state3.status}, Macro Stage: ${state3.macro_stage}`);

  console.log('Completing pickup (moving to COMPLETED)...');
  await supabase.rpc('change_order_status', { p_order_id: order2.id, p_new_status: 'COMPLETED' });
  const { data: state4 } = await supabase.from('orders').select('status').eq('id', order2.id).single();
  console.log(`✅ Final status for PICKUP: ${state4.status}`);

  console.log('\\n--- TESTS FINISHED ---');
}

runTest();
