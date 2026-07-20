const fs = require('fs');
const path = 'C:\\\\Users\\\\b_dulysh\\\\.gemini\\\\antigravity-ide\\\\brain\\\\7bae951a-6ce6-40a9-8160-004e0ee4d97c\\\\.system_generated\\\\logs\\\\transcript_full.jsonl';
const lines = fs.readFileSync(path, 'utf8').split('\n');

let latestOrderCardLines = [];

for (let l of lines) {
    if (!l) continue;
    try {
        const step = JSON.parse(l);
        if (step.content && step.content.includes('OrderCard.tsx') && step.content.includes('The following code has been modified')) {
            const parts = step.content.split('\n');
            const startIdx = parts.findIndex(p => p.includes('The following code has been modified'));
            if (startIdx !== -1) {
                for (let i = startIdx + 1; i < parts.length; i++) {
                    const match = parts[i].match(/^(\d+):\s(.*)$/);
                    if (match) {
                        const lineNum = parseInt(match[1]);
                        const text = match[2];
                        latestOrderCardLines[lineNum] = text;
                    }
                }
            }
        }
    } catch (e) {}
}

const out = [];
for (let i = 0; i < latestOrderCardLines.length; i++) {
    if (latestOrderCardLines[i] !== undefined) {
        out.push(`${i}: ${latestOrderCardLines[i]}`);
    }
}

fs.writeFileSync('C:\\\\hhgh\\\\PLM module\\\\extracted.txt', out.join('\n'), 'utf8');
console.log('Extracted ' + out.length + ' lines.');
