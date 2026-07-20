const { Client } = require('pg')

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
})

async function seed() {
  await client.connect()
  console.log('Connected to Postgres')

  // 1. Delete ALL existing data
  await client.query("DELETE FROM measurement_tasks")
  await client.query("DELETE FROM order_contacts")
  await client.query("DELETE FROM order_addresses")
  await client.query("DELETE FROM orders WHERE id != '00000000-0000-0000-0000-000000000000'")
  await client.query("DELETE FROM profiles WHERE role_code = 'MEASURER'")
  await client.query("UPDATE profiles SET branch_id = NULL")
  await client.query("DELETE FROM branches")
  await client.query("DELETE FROM regions")
  console.log('Cleaned database')

  // 2. Create regions
  await client.query("INSERT INTO regions (name) VALUES ('Захід'), ('Центр')")
  const resRegions = await client.query('SELECT * FROM regions')
  const regions = resRegions.rows
  const zakhid = regions.find(r => r.name === 'Захід')
  const tsentr = regions.find(r => r.name === 'Центр')

  // 3. Create branches
  await client.query(`
    INSERT INTO branches (name, region_id) VALUES 
    ('Філія Львів', $1),
    ('Філія Київ', $2)
  `, [zakhid.id, tsentr.id])
  const resBranches = await client.query('SELECT * FROM branches')
  const branches = resBranches.rows
  const branchLviv = branches.find(b => b.name === 'Філія Львів')
  const branchKyiv = branches.find(b => b.name === 'Філія Київ')

  // 4. Create measurers
  const zakhidArr = `{${zakhid.id}}`
  const tsentrArr = `{${tsentr.id}}`
  await client.query(`
    INSERT INTO profiles (id, full_name, role_code, is_active, branch_id, color, allowed_action_regions) VALUES 
    ('11111111-1111-1111-1111-111111111111', 'Олег Замірник (Львів)', 'MEASURER', true, $1, '#3b82f6', $3),
    ('22222222-2222-2222-2222-222222222222', 'Антон Замірник (Київ)', 'MEASURER', true, $2, '#ef4444', $4)
    ON CONFLICT (id) DO UPDATE SET 
      full_name = EXCLUDED.full_name,
      role_code = EXCLUDED.role_code,
      branch_id = EXCLUDED.branch_id,
      allowed_action_regions = EXCLUDED.allowed_action_regions
  `, [branchLviv.id, branchKyiv.id, zakhidArr, tsentrArr])
  const resMeasurers = await client.query("SELECT * FROM profiles WHERE role_code = 'MEASURER'")
  const measurers = resMeasurers.rows

  console.log('Regions:', regions.length, 'Branches:', branches.length, 'Measurers:', measurers.length)

  const firstNames = ['Олександр', 'Марія', 'Іван', 'Анна', 'Дмитро', 'Олена', 'Сергій', 'Тетяна', 'Андрій', 'Наталія']
  const lastNames = ['Мельник', 'Шевченко', 'Бойко', 'Коваленко', 'Бондаренко', 'Ткаченко', 'Кравченко', 'Олійник', 'Лисенко', 'Поліщук']
  const lvivStreets = ['вул. Шевченка', 'вул. Франка', 'просп. Бандери', 'вул. Городоцька', 'просп. Чорновола', 'вул. Зелена', 'вул. Стрийська', 'вул. Личаківська', 'вул. Наукова', 'вул. Сахарова']
  const kyivStreets = ['вул. Хрещатик', 'просп. Перемоги', 'вул. Велика Васильківська', 'просп. Лобановського', 'вул. Борщагівська', 'вул. Саксаганського', 'просп. Бажана', 'вул. Жилянська', 'вул. Антоновича', 'просп. Оболонський']
  
  // Use ONLY measurement and scheduling statuses
  const statuses = ['MEASUREMENT_SCHEDULING', 'MEASUREMENT_SCHEDULED', 'MEASUREMENT_COMPLETED']

  for (let i = 0; i < 20; i++) {
    const branch = branches[Math.floor(Math.random() * branches.length)]
    const region = regions.find(r => r.id === branch.region_id)
    
    const availableMeasurers = measurers.filter(m => m.branch_id === branch.id)
    const measurer = availableMeasurers.length > 0 ? availableMeasurers[0] : null
    
    const status = statuses[Math.floor(Math.random() * statuses.length)]
    
    let baseLat = 49.8397 
    let baseLng = 24.0297
    let city = 'Львів'
    let street = lvivStreets[Math.floor(Math.random() * lvivStreets.length)]

    if (branch.name === 'Філія Київ') {
      baseLat = 50.4501
      baseLng = 30.5234
      city = 'Київ'
      street = kyivStreets[Math.floor(Math.random() * kyivStreets.length)]
    }

    baseLat += (Math.random() - 0.5) * 0.1
    baseLng += (Math.random() - 0.5) * 0.1
    
    const order_number = `ORD-${2026}-${(i + 1).toString().padStart(4, '0')}`
    
    // Insert into orders
    const resOrder = await client.query(`
      INSERT INTO orders (order_number, status, branch_id) 
      VALUES ($1, $2, $3) RETURNING id
    `, [order_number, status, branch.id])
    
    const orderId = resOrder.rows[0].id

    // Insert into order_contacts
    const client_name = `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`
    const client_phone = `+380${Math.floor(Math.random() * 900000000 + 100000000)}`
    
    await client.query(`
      INSERT INTO order_contacts (order_id, full_name, phone, role) 
      VALUES ($1, $2, $3, 'CUSTOMER')
    `, [orderId, client_name, client_phone])

    // Insert into order_addresses
    const building = (Math.floor(Math.random() * 100) + 1).toString()

    await client.query(`
      INSERT INTO order_addresses (order_id, city, street, building, lat, lng) 
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [orderId, city, street, building, baseLat, baseLng])

    // Insert into measurement_tasks if measurer exists and status is SCHEDULED or COMPLETED
    if (measurer && (status === 'MEASUREMENT_SCHEDULED' || status === 'MEASUREMENT_COMPLETED')) {
      const isFuture = status === 'MEASUREMENT_SCHEDULED';
      const offsetDays = isFuture ? Math.floor(Math.random() * 3) : -(Math.floor(Math.random() * 3) + 1);
      
      const d = new Date()
      d.setDate(d.getDate() + offsetDays)
      
      const scheduled_date = d.toISOString().split('T')[0]
      const start_time = `${(9 + Math.floor(Math.random() * 8)).toString().padStart(2, '0')}:00:00`
      const end_time = `${(parseInt(start_time.substring(0, 2)) + 1).toString().padStart(2, '0')}:00:00`

      await client.query(`
        INSERT INTO measurement_tasks (order_id, measurer_id, scheduled_date, start_time, end_time) 
        VALUES ($1, $2, $3, $4, $5)
      `, [orderId, measurer.id, scheduled_date, start_time, end_time])
    }
  }

  console.log('Successfully inserted 20 orders via pg client')
  await client.end()
}

seed().catch(console.error)
