const fs = require('fs');
let data = fs.readFileSync('C:\\\\hhgh\\\\PLM module\\\\frontend\\\\src\\\\App.tsx', 'utf8');

const replacement = `                {[
                  { id: 'DEFAULT', label: 'За замовчуванням (для модуля)' },
                  { id: 'ALL', label: 'Абсолютно всі етапи' },
                  { id: 'MEASUREMENT_SCHEDULING', label: 'Планування Замірів' },
                  { id: 'MEASUREMENT', label: 'Замір' },
                  { id: 'ENGINEERING', label: 'Конструктив' },
                  { id: 'MANUFACTURING', label: 'Виробництво' },
                  { id: 'DELIVERY_SCHEDULING', label: 'Планування Доставок' },
                  { id: 'INSTALLATION_SCHEDULING', label: 'Планування Монтажів' },
                  { id: 'DELIVERY', label: 'Доставка' },
                  { id: 'INSTALLATION', label: 'Монтаж' },
                  { id: 'PAUSED', label: 'Пауза' },
                  { id: 'CANCELLED', label: 'Скасовано' }
                ].map(opt => {`;

data = data.replace(/\{\[\s*\{\s*id:\s*'DEFAULT'[\s\S]*?\]\.map\(opt => \{/g, replacement);

const spanReplacement = `{statusFilter.includes('DEFAULT') ? 'За замовчуванням' : statusFilter.includes('ALL') ? 'Абсолютно всі етапи' : statusFilter.map(s => { const labels: any = {'MEASUREMENT_SCHEDULING': 'Планування Замірів', 'MEASUREMENT': 'Замір', 'ENGINEERING': 'Конструктив', 'MANUFACTURING': 'Виробництво', 'DELIVERY_SCHEDULING': 'Планування Доставок', 'INSTALLATION_SCHEDULING': 'Планування Монтажів', 'DELIVERY': 'Доставка', 'INSTALLATION': 'Монтаж', 'PAUSED': 'Пауза', 'CANCELLED': 'Скасовано'}; return labels[s] || s; }).join(', ')}`;

data = data.replace(/\{statusFilter\.includes\('DEFAULT'\).*?\.join\(\', \'\)\}/g, spanReplacement);

fs.writeFileSync('C:\\\\hhgh\\\\PLM module\\\\frontend\\\\src\\\\App.tsx', data);
