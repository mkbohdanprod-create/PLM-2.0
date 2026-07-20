const fs = require('fs');
let data = fs.readFileSync('C:\\\\hhgh\\\\PLM module\\\\frontend\\\\src\\\\OrdersList.tsx', 'utf8');

// Add import
if (!data.includes('getMacroStage')) {
  data = data.replace(
    `import { isPaused, STATUS_LABELS } from './utils/orderStages';`,
    `import { isPaused, STATUS_LABELS, getMacroStage } from './utils/orderStages';`
  );
  if (!data.includes('getMacroStage')) {
     data = data.replace(
       `import { isPaused } from './utils/orderStages';`,
       `import { isPaused, getMacroStage } from './utils/orderStages';`
     );
  }
}

data = data.replace(
  /const statusMatches = statusFilter\.includes\(o\.status\);/g,
  `const statusMatches = statusFilter.includes(o.status) || statusFilter.includes(getMacroStage(o.status));`
);

const oldRender = `          const items = [];
          items.push(
            <DraggableOrder key={o.id} order={o} onSelectOrder={onSelectOrder} isSelected={o.id === selectedOrderId} activeModule={activeModule} />
          );`;

const newRender = `          const items = [];
          let showOrderCard = true;
          if (!statusFilter.includes('DEFAULT') && !statusFilter.includes('ALL')) {
             showOrderCard = statusFilter.includes(o.status) || statusFilter.includes(getMacroStage(o.status));
          }
          if (showOrderCard) {
            items.push(
              <DraggableOrder key={o.id} order={o} onSelectOrder={onSelectOrder} isSelected={o.id === selectedOrderId} activeModule={activeModule} />
            );
          }`;

data = data.replace(oldRender, newRender);

fs.writeFileSync('C:\\\\hhgh\\\\PLM module\\\\frontend\\\\src\\\\OrdersList.tsx', data);
