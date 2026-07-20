const fs = require('fs');

let data = fs.readFileSync('C:\\\\hhgh\\\\PLM module\\\\frontend\\\\src\\\\OrderCard.tsx', 'utf8');

// 1. Replace the missing tabs menu before pendingTasks.
const pendingStart = "{pendingTasks.length > 0 && (";
const menuAndCommTab = `      {/* Tabs Menu */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '24px', overflowX: 'auto' }}>
        {['Інформація', 'Комунікація', 'Специфікація', 'Фінанси', 'Історія'].map(tab => (
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
      </div>

      {activeTab === 'Інформація' && (
        <div style={{ padding: 'var(--space-16)', background: 'var(--bg-panel)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Загальна інформація</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '8px', fontSize: '14px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Готовність по базі:</span>
            <span style={{ color: 'var(--text-primary)' }}>{order.base_readiness_date ? new Date(order.base_readiness_date).toLocaleDateString('uk-UA') : '—'}</span>

            <span style={{ color: 'var(--text-secondary)' }}>Оплата:</span>
            <span style={{ color: 'var(--text-primary)' }}>{order.payment_date ? new Date(order.payment_date).toLocaleDateString('uk-UA') : '—'}</span>

            <span style={{ color: 'var(--text-secondary)' }}>Розрахункова готовність:</span>
            <span style={{ color: 'var(--text-primary)' }}>{order.calc_readiness_date ? new Date(order.calc_readiness_date).toLocaleDateString('uk-UA') : '—'}</span>
            
            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Дата продзвону:</span>
            <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{order.planned_call_date ? new Date(order.planned_call_date).toLocaleString('uk-UA') : 'Не заплановано'}</span>

            <span style={{ color: 'var(--text-secondary)' }}>Коментар:</span>
            <span style={{ color: 'var(--text-primary)' }}>{order.call_comment || '—'}</span>
          </div>
        </div>
      )}

      {activeTab === 'Комунікація' && (
        <div style={{ padding: 'var(--space-16)', background: 'var(--bg-panel)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
          {pendingTasks.length > 0 && (`

data = data.replace(pendingStart, menuAndCommTab);

// 2. Add the missing closing divs for the Комунікація tab right before the Специфікація tab.
const specTabStart = "{activeTab === 'Специфікація' && (";
const closingDivs = `        </div>
      )}

      {activeTab === 'Специфікація' && (`

// Replace the stray `)}` and `</div>` at the end of completedTasks ?
// Actually, `pendingTasks` and `completedTasks` end with:
//             {pendingTasks.length === 0 && completedTasks.length === 0 && (
//               <div ...>...</div>
//             )}
//           </div>
//         )}
//
// Let's replace those two closing lines with just `</div>` so it stays inside our Комунікація tab.
// Then the Комунікація tab is closed properly!
data = data.replace(/<\/[dD][iI][vV]>\s*\)\}\s*\{activeTab === 'Специфікація'/, '</div>\n\n      {activeTab === \\'Специфікація\\'');

// And if there is `)}` at the end of the empty tasks block:
data = data.replace(/Немає активностей<\/div>\s*\)\}\s*<\/div>\s*\)\}/, 'Немає активностей</div>\n            )}\n          </div>\n        )}');

fs.writeFileSync('C:\\\\hhgh\\\\PLM module\\\\frontend\\\\src\\\\OrderCard.tsx', data, 'utf8');
console.log('Done!');
