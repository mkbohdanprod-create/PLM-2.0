const fs = require('fs');
let code = fs.readFileSync('C:\\\\hhgh\\\\PLM module\\\\frontend\\\\src\\\\OrderCard.tsx', 'utf8');
code = code.replace(/border: '1px solid var\(--border-color\)' \}\}\n\s*<div style/g, "border: '1px solid var(--border-color)' }}>\n          <div style");
fs.writeFileSync('C:\\\\hhgh\\\\PLM module\\\\frontend\\\\src\\\\OrderCard.tsx', code);
console.log('Fixed');
