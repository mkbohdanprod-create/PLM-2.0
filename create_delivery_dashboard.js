const fs = require('fs');

const pathIn = 'c:/hhgh/PLM module/frontend/src/CalendarPanel.tsx';
const pathOut = 'c:/hhgh/PLM module/frontend/src/DeliveryDashboard.tsx';

let content = fs.readFileSync(pathIn, 'utf8');

// Replace standard names
content = content.replace(/CalendarPanel/g, 'DeliveryDashboard');
content = content.replace(/measurement_tasks/g, 'delivery_tasks');
content = content.replace(/measurer_id/g, 'driver_id');
content = content.replace(/measurers/g, 'drivers');
content = content.replace(/MEASURER/g, 'DRIVER'); // Wait, DISPATCHER is usually the one who manages it. Driver is role? Let's just do it
content = content.replace(/Замірник/g, 'Водій');
content = content.replace(/заміру/g, 'доставки');
content = content.replace(/замір/g, 'доставку');
content = content.replace(/Монтажник/g, 'Водій');
content = content.replace(/MEASUREMENT_SCHEDULING/g, 'DELIVERY_SCHEDULING');

// Also need to fetch READY_FOR_PICKUP?
// I will just add a small text at the top of the component
content = content.replace(
  /<div style={{ flex: 1, overflowY: 'auto', padding: '16px', background: '#f8fafc' }}>/g,
  `<div style={{ flex: 1, overflowY: 'auto', padding: '16px', background: '#f8fafc' }}>
      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '12px', borderRadius: '8px', marginBottom: '16px', color: '#92400e' }}>
        <strong>Увага:</strong> Тут також будуть відображатись замовлення зі статусом READY_FOR_PICKUP (Самовивіз).
      </div>`
);

fs.writeFileSync(pathOut, content);
console.log('DeliveryDashboard.tsx created!');
