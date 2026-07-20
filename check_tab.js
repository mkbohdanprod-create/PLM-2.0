const fs = require('fs');
const content = fs.readFileSync('c:/hhgh/PLM module/frontend/src/OrderCard.tsx', 'utf8');
const lines = content.split('\n');
const match = lines.findIndex(l => l.includes("activeTab === 'Логістика'"));
if (match !== -1) {
  console.log(lines.slice(Math.max(0, match - 5), match + 30).join('\n'));
} else {
  console.log('Not found');
}
