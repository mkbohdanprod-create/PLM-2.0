import fs from 'fs';
const file = 'C:\\hhgh\\PLM module\\Status Migr\\WAVE_8_TESTING_BUGS.md';
let content = fs.readFileSync(file, 'utf8');

// Find the start of the garbled text by finding the last good heading
const idx = content.lastIndexOf('### Покращення: Дефолтний етап при створенні Комунікації');
if (idx !== -1) {
  // Find the end of that paragraph
  const nextHeading = content.indexOf('###', idx + 10);
  if (nextHeading !== -1) {
    content = content.substring(0, nextHeading);
  }
}

const correctText = `### Баг №22: Неможливість відновити замовлення з паузи
**Проблема:** При натисканні "Відновити" виникала помилка: \`column "created_at" does not exist\`. 
**Причина:** В RPC \`change_order_status\` при розрахунку зсуву дат (SLA) для відновлення з паузи, SQL-запит шукав колонку \`created_at\` у таблиці \`order_status_history\`, тоді як в цій таблиці використовується назва \`changed_at\`. Ця помилка виникла під час створення Хвилі 3 (і перенесена у Хвилю 7).
**Вирішення:** 
- Створено міграцію \`20260720141004_fix_change_order_status_created_at.sql\`.
- В тілі функції \`change_order_status\` змінено \`ORDER BY created_at DESC LIMIT 1\` на \`ORDER BY changed_at DESC LIMIT 1\` та \`SELECT created_at\` на \`SELECT changed_at\`.
- Застосовано оновлення через \`npx supabase db reset\`.
`;

fs.writeFileSync(file, content + correctText, 'utf8');
console.log('Fixed file');
