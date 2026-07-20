import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'http://127.0.0.1:54321'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const supabase = createClient(supabaseUrl, supabaseKey, {
  global: { headers: { 'Bypass-Tunnel-Reminder': 'true' } }
})

async function seed() {
  console.log('Seeding data...')
  
  await supabase.from('orders').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('Deleted existing orders')

  let { data: regions } = await supabase.from('regions').select('*')
  
  if (!regions || regions.length === 0) {
    console.log('No regions found, creating regions...')
    const newRegions = [{ name: 'Захід' }, { name: 'Центр' }, { name: 'Схід' }, { name: 'Південь' }]
    const { data: insertedRegions, error: errReg } = await supabase.from('regions').insert(newRegions).select()
    if (errReg) {
      console.error('Error inserting regions:', errReg)
      return
    }
    regions = insertedRegions
  }

  let { data: branches } = await supabase.from('branches').select('*')
  if (!branches || branches.length === 0) {
    console.log('No branches found, creating branches...')
    const zakhid = regions.find(r => r.name === 'Захід')
    const tsentr = regions.find(r => r.name === 'Центр')
    
    const newBranches = [
      { name: 'Філія Львів', region_id: zakhid?.id },
      { name: 'Філія Івано-Франківськ', region_id: zakhid?.id },
      { name: 'Філія Київ', region_id: tsentr?.id }
    ]
    const { data: insertedBranches, error: errBr } = await supabase.from('branches').insert(newBranches).select()
    if (errBr) {
      console.error('Error inserting branches:', errBr)
      return
    }
    branches = insertedBranches
  }

  let { data: measurers } = await supabase.from('profiles').select('*').eq('role_code', 'MEASURER')
  if (!measurers || measurers.length === 0) {
    console.log('No measurers found, creating some measurers...')
    const branchLviv = branches.find(b => b.name === 'Філія Львів')
    const branchKyiv = branches.find(b => b.name === 'Філія Київ')
    const regZakhid = regions.find(r => r.name === 'Захід')
    const regTsentr = regions.find(r => r.name === 'Центр')
    
    const newProfiles = [
      { id: '11111111-1111-1111-1111-111111111111', email: 'measurer_lviv@test.com', full_name: 'Олег Замірник (Львів)', role_code: 'MEASURER', is_active: true, branch_id: branchLviv?.id, color: '#3b82f6', allowed_action_regions: [regZakhid?.id] },
      { id: '22222222-2222-2222-2222-222222222222', email: 'measurer_kyiv@test.com', full_name: 'Антон Замірник (Київ)', role_code: 'MEASURER', is_active: true, branch_id: branchKyiv?.id, color: '#ef4444', allowed_action_regions: [regTsentr?.id] }
    ]
    const { data: insertedMeasurers, error: errMeasurers } = await supabase.from('profiles').insert(newProfiles).select()
    if (errMeasurers) {
      console.error('Error inserting measurers:', errMeasurers)
      // Ignore if auth fails due to constraint
    } else {
      measurers = insertedMeasurers
    }
  }

  console.log('Regions:', regions?.length, 'Branches:', branches?.length, 'Measurers:', measurers?.length)

  const firstNames = ['Олександр', 'Марія', 'Іван', 'Анна', 'Дмитро', 'Олена', 'Сергій', 'Тетяна', 'Андрій', 'Наталія'];
  const lastNames = ['Мельник', 'Шевченко', 'Бойко', 'Коваленко', 'Бондаренко', 'Ткаченко', 'Кравченко', 'Олійник', 'Лисенко', 'Поліщук'];
  const streets = ['вул. Хрещатик', 'просп. Перемоги', 'вул. Шевченка', 'вул. Франка', 'просп. Бандери', 'вул. Лесі Українки', 'вул. Сахарова', 'вул. Наукова', 'вул. Городоцька', 'просп. Чорновола'];
  const materials = ['Кварцит', 'Граніт', 'Мармур', 'Акрил', 'Кераміка'];
  
  const statuses = ['NEW', 'MEASUREMENT_SCHEDULED', 'MEASUREMENT_COMPLETED', 'DRAFT_CREATED', 'APPROVED', 'IN_PRODUCTION'];

  const orders = [];

  for (let i = 0; i < 20; i++) {
    const branch = branches[Math.floor(Math.random() * branches.length)];
    const region = regions.find(r => r.id === branch.region_id) || regions[0];
    
    const availableMeasurers = measurers ? measurers.filter(m => m.branch_id === branch.id || (m.allowed_action_regions || []).includes(region.id)) : [];
    const measurer = availableMeasurers.length > 0 ? availableMeasurers[Math.floor(Math.random() * availableMeasurers.length)] : null;
    
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    
    let baseLat = 49.8397; 
    let baseLng = 24.0297;
    if (branch.name === 'Філія Київ') {
      baseLat = 50.4501;
      baseLng = 30.5234;
    } else if (branch.name === 'Філія Івано-Франківськ') {
      baseLat = 48.9226;
      baseLng = 24.7111;
    }

    baseLat += (Math.random() - 0.5) * 0.1;
    baseLng += (Math.random() - 0.5) * 0.1;

    orders.push({
      order_number: `ORD-${2026}-${(i + 1).toString().padStart(4, '0')}`,
      status,
      region_id: region.id,
      branch_id: branch.id,
      client_name: `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`,
      client_phone: `+380${Math.floor(Math.random() * 900000000 + 100000000)}`,
      address: `${streets[Math.floor(Math.random() * streets.length)]}, ${Math.floor(Math.random() * 100) + 1}`,
      lat: baseLat,
      lng: baseLng,
      measurer_id: measurer ? measurer.id : null,
      planned_measurement_date: Math.random() > 0.5 ? new Date(Date.now() + Math.random() * 10 * 24 * 60 * 60 * 1000).toISOString() : null,
      notes: `Матеріал: ${materials[Math.floor(Math.random() * materials.length)]}. \nДуже важливий клієнт.`,
      priority: Math.random() > 0.8 ? 'HIGH' : 'NORMAL'
    });
  }

  const { error: insErr } = await supabase.from('orders').insert(orders)
  if (insErr) {
    console.error('Error inserting orders:', insErr)
  } else {
    console.log('Successfully inserted 20 orders')
  }
}

seed()
