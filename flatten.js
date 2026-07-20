const fs = require('fs');
let code = fs.readFileSync('C:\\\\hhgh\\\\PLM module\\\\frontend\\\\src\\\\OrderCard.tsx', 'utf8');

// Remove Tabs Menu completely
code = code.replace(/\{\/\* Tabs Menu \*\/\}\s*<div[\s\S]*?<\/div>/, '');

// Replace activeTab === 'Інформація'
code = code.replace(/\{activeTab === 'Інформація' && \(/, 
`{/* Інформація */}
      <div style={{ display: 'flex', gap: '24px', flexDirection: 'column' }}>
        <div style={{ padding: 'var(--space-16)', background: 'var(--bg-panel)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}`);

// Replace end of Інформація and start of Комунікація
// Add the activeMeasTask logic with "Точка виїзду" right before "Комунікація"
code = code.replace(/\)\}\s*\{activeTab === 'Комунікація' && \(/, 
`</div>
        
        {activeMeasTask && (
          <div style={{ padding: 'var(--space-16)', background: 'var(--bg-panel)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Поточний замір</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '8px', fontSize: '14px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Точка виїзду:</span>
              <span style={{ color: 'var(--text-primary)' }}>{departurePoint || '—'}</span>
              <span style={{ color: 'var(--text-secondary)' }}>Замірник:</span>
              <span style={{ color: 'var(--text-primary)' }}>{activeMeasTask.profiles?.full_name || 'Не призначено'}</span>
            </div>
          </div>
        )}

        {/* Комунікація */}
        <div style={{ padding: 'var(--space-16)', background: 'var(--bg-panel)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>Комунікація та задачі</h3>
            <button onClick={() => setShowCreateTask(true)} style={{ padding: '6px 12px', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>+ Створити активність</button>
          </div>`);

// Replace end of Комунікація and start of Специфікація
code = code.replace(/\)\}\s*\{activeTab === 'Специфікація' && \(/, 
`</div>
        
        {/* Специфікація */}
        <div style={{ padding: 'var(--space-16)', background: 'var(--bg-panel)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}`);

// Replace end of Специфікація and start of Фінанси
code = code.replace(/\)\}\s*\{activeTab === 'Фінанси' && \(/, 
`</div>
        
        {/* Фінанси */}
        <div style={{ padding: 'var(--space-16)', background: 'var(--bg-panel)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}`);

// Replace end of Фінанси and start of Історія
code = code.replace(/\)\}\s*\{activeTab === 'Історія' && \(/, 
`</div>
        
        {/* Історія */}
        <div style={{ padding: 'var(--space-16)', background: 'var(--bg-panel)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}`);

// Look for the last `)}` and `</div>` to match the `<div style={{ display: 'flex', gap: '24px', flexDirection: 'column' }}>` that we added.
code = code.replace(/\n            \)\}\n          <\/div>\n        \)\}\n      <\/div>\n  \);\n}/, 
`\n            )}\n          </div>\n      </div>\n    </div>\n  );\n}`);

fs.writeFileSync('C:\\\\hhgh\\\\PLM module\\\\frontend\\\\src\\\\OrderCard.tsx', code);
console.log('OrderCard flattened!');
