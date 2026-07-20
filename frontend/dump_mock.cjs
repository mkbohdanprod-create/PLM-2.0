const { Client } = require('pg');
const fs = require('fs');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function dump() {
  await client.connect();

  const regions = (await client.query('SELECT * FROM regions')).rows;
  const branches = (await client.query('SELECT * FROM branches')).rows;
  const profiles = (await client.query('SELECT * FROM profiles')).rows;
  
  // For orders, we need the nested structure:
  // orders(*, order_addresses(*), branches(*, regions(*)), measurement_tasks(*, profiles(*)), order_contacts(*))
  const ordersRaw = (await client.query('SELECT * FROM orders')).rows;
  const addresses = (await client.query('SELECT * FROM order_addresses')).rows;
  const tasks = (await client.query('SELECT * FROM measurement_tasks')).rows;
  const contacts = (await client.query('SELECT * FROM order_contacts')).rows;

  const orders = ordersRaw.map(o => {
    const branch = branches.find(b => b.id === o.branch_id);
    const region = branch ? regions.find(r => r.id === branch.region_id) : null;
    
    return {
      ...o,
      order_addresses: addresses.filter(a => a.order_id === o.id),
      branches: branch ? { ...branch, regions: region } : null,
      measurement_tasks: tasks.filter(t => t.order_id === o.id).map(t => ({
        ...t,
        profiles: profiles.find(p => p.id === t.measurer_id)
      })),
      order_contacts: contacts.filter(c => c.order_id === o.id)
    };
  });

  const roles = (await client.query('SELECT * FROM roles')).rows;
  const engineering_tasks = (await client.query('SELECT * FROM engineering_tasks')).rows;
  const worker_schedules = (await client.query('SELECT * FROM worker_schedules')).rows;

  const mockData = {
    regions,
    branches,
    profiles,
    roles,
    engineering_tasks,
    worker_schedules,
    orders,
    measurement_tasks: tasks.map(t => ({
      ...t,
      profiles: profiles.find(p => p.id === t.measurer_id),
      orders: orders.find(o => o.id === t.order_id)
    }))
  };

  fs.writeFileSync('src/mockData.json', JSON.stringify(mockData, null, 2));
  console.log('Mock data dumped to src/mockData.json');
  await client.end();
}

dump().catch(console.error);
