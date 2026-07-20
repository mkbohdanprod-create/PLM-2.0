const fs = require('fs');
let code = fs.readFileSync('C:\\\\hhgh\\\\PLM module\\\\frontend\\\\src\\\\OrderCard.tsx', 'utf8');

// 1. Add selectedTaskDetails state
code = code.replace(/const \[newTaskComment, setNewTaskComment\] = useState\(''\);/, 
`const [newTaskComment, setNewTaskComment] = useState('');
  const [selectedTaskDetails, setSelectedTaskDetails] = useState<any>(null);`);

// 2. Put tabs menu back right before {/* Інформація */}
const tabsMenu = `
      {/* Tabs Menu */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '24px', overflowX: 'auto', alignItems: 'center' }}>
        {['Інформація', 'Комунікація', 'Специфікація', 'Фінанси', 'Історія', 'Логістика'].map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{ 
              padding: '8px 16px', 
              background: activeTab === tab ? 'var(--accent-color)' : 'transparent',
              color: activeTab === tab ? 'white' : 'var(--text-primary)',
              border: activeTab === tab ? 'none' : '1px solid var(--border-color)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 500,
              whiteSpace: 'nowrap'
            }}
          >
            {tab}
          </button>
        ))}
        <button onClick={() => setShowCreateTask(true)} style={{ marginLeft: 'auto', padding: '8px 16px', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)' }}>
          + Створити активність
        </button>
      </div>

      {activeTab === 'Інформація' && (`;

code = code.replace(/\{\/\* Інформація \*\/\}\s*<div style=\{\{ display: 'flex', gap: '24px', flexDirection: 'column' \}\}>/, tabsMenu);

// Wrap Інформація end and start of Поточний замір (if it was combined, now we separate them into Інформація tab)
// Note: 'Поточний замір' should probably be part of the 'Інформація' tab, or 'Специфікація'.
// Let's keep it in 'Інформація'.
// Wait, the user wants the tabs back.
// I will wrap them using a simple replace strategy.
code = code.replace(/\{activeMeasTask && \(/, `)}

      {activeTab === 'Інформація' && activeMeasTask && (`);

// Start of Комунікація tab
code = code.replace(/\{\/\* Комунікація \*\/\}/, `)}
      {activeTab === 'Комунікація' && (`);

// Remove the inline Create Activity button from Комунікація
code = code.replace(/<button onClick=\{\(\) => setShowCreateTask\(true\)\}[\s\S]*?\+ Створити активність<\/button>/, '');

// Make activities clickable!
code = code.replace(/<div key=\{t\.id\} style=\{\{ padding: '12px', background: 'var\(--bg-panel\)', border: '1px solid var\(--danger-color\)'/g, 
  `<div key={t.id} onClick={() => setSelectedTaskDetails(t)} style={{ padding: '12px', background: 'var(--bg-panel)', border: '1px solid var(--danger-color)', cursor: 'pointer'`);
code = code.replace(/<div key=\{t\.id\} style=\{\{ padding: '12px', background: 'var\(--bg-panel\)', border: '1px solid var\(--border-color\)'/g, 
  `<div key={t.id} onClick={() => setSelectedTaskDetails(t)} style={{ padding: '12px', background: 'var(--bg-panel)', border: '1px solid var(--border-color)', cursor: 'pointer'`);

// Start of Специфікація tab
code = code.replace(/\{\/\* Специфікація \*\/\}/, `)}
      {activeTab === 'Специфікація' && (`);

// Start of Фінанси tab
code = code.replace(/\{\/\* Фінанси \*\/\}/, `)}
      {activeTab === 'Фінанси' && (`);

// Start of Історія tab
code = code.replace(/\{\/\* Історія \*\/\}/, `)}
      {activeTab === 'Історія' && (`);

// Add the selectedTaskDetails Modal at the end of the file before the last closing divs
const modalCode = `
      {selectedTaskDetails && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setSelectedTaskDetails(null)}>
          <div style={{ background: 'var(--bg-panel)', padding: '24px', borderRadius: 'var(--radius-lg)', width: '500px', maxWidth: '90%', display: 'flex', flexDirection: 'column', gap: '16px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Деталі активності</h3>
              <button onClick={() => setSelectedTaskDetails(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><XCircle size={20} /></button>
            </div>
            
            <div style={{ padding: '16px', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Заголовок:</span>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>{selectedTaskDetails.title || '—'}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Тип:</span>
                  <div style={{ fontSize: '13px' }}>{selectedTaskDetails.activity_type || '—'}</div>
                </div>
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Етап:</span>
                  <div style={{ fontSize: '13px' }}>{TASK_STAGE_LABELS[selectedTaskDetails.macro_stage] || selectedTaskDetails.macro_stage || '—'}</div>
                </div>
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Створено:</span>
                  <div style={{ fontSize: '13px' }}>{format(new Date(selectedTaskDetails.created_at), 'd MMM yyyy, HH:mm', { locale: uk })}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Автор: {selectedTaskDetails.creator?.full_name || 'Невідомо'}</div>
                </div>
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Заплановано на:</span>
                  <div style={{ fontSize: '13px' }}>{selectedTaskDetails.planned_at ? format(new Date(selectedTaskDetails.planned_at), 'd MMM yyyy, HH:mm', { locale: uk }) : '—'}</div>
                </div>
              </div>
              
              <div style={{ borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />
              
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Статус:</span>
                <div style={{ fontSize: '13px', fontWeight: 600, color: selectedTaskDetails.status === 'COMPLETED' ? 'var(--success-color)' : (selectedTaskDetails.status === 'CANCELLED' ? 'var(--danger-color)' : 'var(--text-primary)') }}>
                  {selectedTaskDetails.status === 'PENDING' ? 'Очікує виконання' : (selectedTaskDetails.status === 'COMPLETED' ? 'Виконано' : 'Скасовано')}
                </div>
              </div>
              
              {selectedTaskDetails.status !== 'PENDING' && (
                <>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Результат (Outcome):</span>
                    <div style={{ fontSize: '13px' }}>{selectedTaskDetails.outcome || '—'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Коментар до результату:</span>
                    <div style={{ fontSize: '13px' }}>{selectedTaskDetails.outcome_notes || '—'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Закрито:</span>
                    <div style={{ fontSize: '13px' }}>{selectedTaskDetails.completed_at ? format(new Date(selectedTaskDetails.completed_at), 'd MMM yyyy, HH:mm', { locale: uk }) : '—'}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Виконавець: {selectedTaskDetails.completer?.full_name || 'Невідомо'}</div>
                  </div>
                </>
              )}
              
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Коментар при створенні:</span>
                <div style={{ fontSize: '13px', background: 'var(--bg-panel)', padding: '8px', borderRadius: '4px', marginTop: '4px' }}>{selectedTaskDetails.comment || '—'}</div>
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setSelectedTaskDetails(null)} style={{ padding: '8px 16px', background: 'var(--text-primary)', color: 'var(--bg-panel)', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>Закрити</button>
            </div>
          </div>
        </div>
      )}
`;

code = code.replace(/(\s*)<\/div>\n    <\/div>\n  \);\n}/, `\n      )}` + modalCode + `$1</div>\n    </div>\n  );\n}`);

fs.writeFileSync('C:\\\\hhgh\\\\PLM module\\\\frontend\\\\src\\\\OrderCard.tsx', code);
console.log('Tabs restored and Activity modal added');
