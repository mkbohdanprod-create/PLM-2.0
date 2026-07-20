const fs = require('fs');

const path = 'c:/hhgh/PLM module/frontend/src/OrderCard.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Rename activeTask to activeMeasTask in fetchDeparture
content = content.replace(
  /const activeTask = order\?\.measurement_tasks\?\.find\(\(t: any\) => t\.outcome === 'SCHEDULED' \|\| t\.outcome === 'IN_PROGRESS'\);/g,
  "const activeMeasTask = order?.measurement_tasks?.find((t: any) => t.outcome === 'SCHEDULED' || t.outcome === 'IN_PROGRESS');"
);
content = content.replace(/activeTask\./g, "activeMeasTask.");
content = content.replace(/!activeTask/g, "!activeMeasTask");

// 2. Add activeMeasTask and activeDeliveryTask below spec
content = content.replace(
  /const spec = order\.order_specifications\?\.\[0\] \|\| \{\};/,
  "const spec = order.order_specifications?.[0] || {};\n  const activeMeasTask = order.measurement_tasks?.find((t: any) => t.outcome === 'SCHEDULED' || t.outcome === 'IN_PROGRESS');\n  const activeDeliveryTask = order.delivery_tasks?.find((t: any) => t.outcome === 'SCHEDULED' || t.outcome === 'IN_PROGRESS');"
);

// 3. Update the 'Логістика' tab rendering
const oldLogistics = `{activeTask && (
                <>
                   <span style={{ color: 'var(--text-secondary)' }}>Замірник:</span>
                   <span style={{ color: 'var(--accent-color)', fontWeight: 600 }}>{activeTask.profiles?.full_name || 'Без замірника'}</span>
                   <span style={{ color: 'var(--text-secondary)' }}>Дата заміру:</span>
                   <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{activeTask.scheduled_date}</span>
                   <span style={{ color: 'var(--text-secondary)' }}>Час:</span>
                   <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{activeTask.start_time.slice(0,5)} - {activeTask.end_time.slice(0,5)}</span>
                   {departurePoint && (
                     <>
                       <span style={{ color: 'var(--text-secondary)' }}>Виїзд з:</span>
                       <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{departurePoint}</span>
                     </>
                   )}
                </>
              )}`;

const newLogistics = `{activeMeasTask && (
                <>
                   <span style={{ color: 'var(--text-secondary)' }}>Замірник:</span>
                   <span style={{ color: 'var(--accent-color)', fontWeight: 600 }}>{activeMeasTask.profiles?.full_name || 'Без замірника'}</span>
                   <span style={{ color: 'var(--text-secondary)' }}>Дата заміру:</span>
                   <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{activeMeasTask.scheduled_date}</span>
                   <span style={{ color: 'var(--text-secondary)' }}>Час:</span>
                   <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{activeMeasTask.start_time.slice(0,5)} - {activeMeasTask.end_time.slice(0,5)}</span>
                   {departurePoint && (
                     <>
                       <span style={{ color: 'var(--text-secondary)' }}>Виїзд з:</span>
                       <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{departurePoint}</span>
                     </>
                   )}
                </>
              )}
              {order.delivery_method && (
                <>
                  <span style={{ color: 'var(--text-secondary)' }}>Тип логістики:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{order.delivery_method === 'DELIVERY' ? 'Доставка' : 'Самовивіз'}</span>
                </>
              )}
              {activeDeliveryTask && (
                <>
                   <span style={{ color: 'var(--text-secondary)' }}>Водій:</span>
                   <span style={{ color: 'var(--accent-color)', fontWeight: 600 }}>{activeDeliveryTask.driver?.full_name || 'Не призначено'}</span>
                   <span style={{ color: 'var(--text-secondary)' }}>Авто:</span>
                   <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{activeDeliveryTask.vehicles?.name} ({activeDeliveryTask.vehicles?.plate_number})</span>
                   <span style={{ color: 'var(--text-secondary)' }}>Дата доставки:</span>
                   <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{new Date(activeDeliveryTask.scheduled_date).toLocaleDateString('uk-UA')}</span>
                </>
              )}`;

content = content.replace(oldLogistics, newLogistics);

fs.writeFileSync(path, content);
console.log('OrderCard patched!');
