const fs = require('fs');
let code = fs.readFileSync('C:\\\\hhgh\\\\PLM module\\\\frontend\\\\src\\\\OrderCard.tsx', 'utf8');

// I will extract the blocks and reconstruct the return statement.
// The easiest way is to find the strings and rebuild them properly.
// The right column starts at:
// {/* Timeline Progress Bar */}

const startIdx = code.indexOf('{/* Timeline Progress Bar */}');
let before = code.substring(0, startIdx);
let rest = code.substring(startIdx);

// We want to completely replace 'rest' with a properly structured one.
// We can extract the components:
// 1. Timeline
// 2. Tabs Menu
// 3. Інформація (includes Загальна інформація and Поточний замір)
// 4. Комунікація (includes Активні задачі and Історія комунікацій)
// 5. Специфікація
// 6. Фінанси
// 7. Історія
// 8. selectedTaskDetails modal

// Let's just write the correct JSX string. We know what it looks like.
const timelineCode = `
      {/* Timeline Progress Bar */}
      <div style={{ display: 'flex', gap: '4px', margin: '24px 0', position: 'relative' }}>
        {['MEASUREMENT_SCHEDULING', 'MEASUREMENT_SCHEDULED', 'IN_CONSTRUCT'].map((st, i) => {
          const isActive = order.status === st;
          const isPassed = ['MEASUREMENT_SCHEDULING', 'MEASUREMENT_SCHEDULED', 'IN_CONSTRUCT'].indexOf(order.status) > i;
          
          return (
            <div key={st} style={{ flex: 1, height: '4px', background: isActive ? 'var(--accent-color)' : isPassed ? 'var(--accent-success)' : 'var(--bg-input)', borderRadius: '2px' }} title={STATUS_LABELS[st] || st} />
          );
        })}
      </div>
`;

const tabsCode = `
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
`;

const infoCode = `
      {activeTab === 'Інформація' && (
        <div style={{ display: 'flex', gap: '24px', flexDirection: 'column' }}>
          <div style={{ padding: 'var(--space-16)', background: 'var(--bg-panel)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Загальна інформація</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '8px', fontSize: '14px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Клієнт:</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{order.customers?.first_name || ''} {order.customers?.last_name || ''}</span>
              <span style={{ color: 'var(--text-secondary)' }}>Телефон:</span>
              <span style={{ color: 'var(--text-primary)' }}>{order.customers?.phone || '—'}</span>
              <span style={{ color: 'var(--text-secondary)' }}>Адреса:</span>
              <span style={{ color: 'var(--text-primary)' }}>{order.city || '—'}, {order.street || '—'} {order.building || ''}</span>
              <span style={{ color: 'var(--text-secondary)' }}>Філія:</span>
              <span style={{ color: 'var(--text-primary)' }}>{order.branches?.name || '—'}</span>
              <br/>
              <span style={{ color: 'var(--text-secondary)' }}>Готовність по базі:</span>
              <span style={{ color: 'var(--text-primary)' }}>{order.base_readiness_date ? format(new Date(order.base_readiness_date), 'dd.MM.yyyy') : '—'}</span>
              <span style={{ color: 'var(--text-secondary)' }}>Оплата:</span>
              <span style={{ color: 'var(--text-primary)' }}>{order.payment_percent ? order.payment_percent + '%' : '—'}</span>
              <span style={{ color: 'var(--text-secondary)' }}>Розрахункова готовність:</span>
              <span style={{ color: 'var(--text-primary)' }}>{order.calculated_readiness_date ? format(new Date(order.calculated_readiness_date), 'dd.MM.yyyy') : '—'}</span>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Дата прозвону:</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{order.call_date ? format(new Date(order.call_date), 'dd.MM.yyyy, HH:mm:ss') : '—'}</span>
              <span style={{ color: 'var(--text-secondary)' }}>Коментар:</span>
              <span style={{ color: 'var(--text-primary)' }}>{order.comment || '—'}</span>
            </div>
          </div>

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
        </div>
      )}
`;

const communicationCode = `
      {activeTab === 'Комунікація' && (
        <div style={{ padding: 'var(--space-16)', background: 'var(--bg-panel)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
            
            {pendingTasks.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>Активні задачі</h4>
                {pendingTasks.map((t: any) => (
                  <div key={t.id} onClick={() => setSelectedTaskDetails(t)} style={{ padding: '12px', background: 'var(--bg-panel)', border: '1px solid var(--danger-color)', cursor: 'pointer', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <PhoneCall size={14} color="var(--danger-color)" />
                        {t.title}
                        {t.planned_at && <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal', fontSize: '12px' }}>{format(new Date(t.planned_at), 'd MMM HH:mm', { locale: uk })}</span>}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        <span style={{ background: 'var(--bg-input)', padding: '2px 4px', borderRadius: '4px', marginRight: '6px' }}>Етап: {TASK_STAGE_LABELS[t.macro_stage] || t.macro_stage || 'Не вказано'}</span>
                        Створено: {format(new Date(t.created_at), 'd MMM HH:mm', { locale: uk })} {t.creator?.full_name && \`(\${t.creator.full_name})\`}
                      </div>
                      {t.comment && <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{t.comment}</div>}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setTaskToClose(t); }} style={{ padding: '6px 12px', background: 'var(--success-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Виконано</button>
                  </div>
                ))}
              </div>
            )}

            {completedTasks.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>Історія комунікацій</h4>
                {completedTasks.map((t: any) => (
                  <div key={t.id} onClick={() => setSelectedTaskDetails(t)} style={{ padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{t.title}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{t.completed_at ? format(new Date(t.completed_at), "d MMM, HH:mm", { locale: uk }) : 'Без дати'}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Створено: {t.creator?.full_name || ''}</span>
                      {t.completed_at && <span>Закрито: {t.completer?.full_name || ''}</span>}
                    </div>
                    <div style={{ fontSize: '12px', marginTop: '6px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ background: t.status === 'CANCELLED' ? 'var(--danger-color)' : 'var(--success-color)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>
                        {t.status === 'CANCELLED' ? 'СКАСОВАНО' : (t.outcome || 'ВИКОНАНО')}
                      </span>
                      {t.outcome_notes && <span style={{ color: 'var(--text-primary)' }}>{t.outcome_notes}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {pendingTasks.length === 0 && completedTasks.length === 0 && (
              <div style={{ color: 'var(--text-tertiary)', fontSize: '13px', textAlign: 'center', padding: '24px' }}>Немає активностей</div>
            )}
        </div>
      )}
`;

const specCode = `
      {activeTab === 'Специфікація' && (
        <div style={{ padding: 'var(--space-16)', background: 'var(--bg-panel)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Виріб</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '8px', fontSize: '14px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Матеріал:</span>
            <span style={{ color: 'var(--text-primary)' }}>{spec.material_type || '—'}</span>
            <span style={{ color: 'var(--text-secondary)' }}>Орієнтовна площа:</span>
            <span style={{ color: 'var(--text-primary)' }}>{spec.area_sqm ? \`\${spec.area_sqm} м²\` : '—'}</span>
          </div>
        </div>
      )}
`;

const finCode = `
      {activeTab === 'Фінанси' && (
        <div style={{ padding: 'var(--space-16)', background: 'var(--bg-panel)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Оплата</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '8px', fontSize: '14px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Сума (орієнтовна):</span>
            <span style={{ color: 'var(--text-primary)' }}>{spec.total_amount ? \`\${spec.total_amount} ₴\` : '—'}</span>
            <span style={{ color: 'var(--text-secondary)' }}>% оплати:</span>
            <span style={{ color: 'var(--text-primary)' }}>{order.payment_percent || 0}%</span>
            <span style={{ color: 'var(--text-secondary)' }}>Кредит:</span>
            <span style={{ color: 'var(--text-primary)' }}>{order.is_credit ? 'Так' : 'Ні'}</span>
            <span style={{ color: 'var(--text-secondary)' }}>Джерело оплати:</span>
            <span style={{ color: 'var(--text-primary)' }}>{order.payment_source || '—'}</span>
          </div>
        </div>
      )}
`;

const histCode = `
      {activeTab === 'Історія' && (
        <div style={{ padding: 'var(--space-16)', background: 'var(--bg-panel)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Історія статусів</h3>
          
          {history.length === 0 ? (
            <div style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>Історія порожня</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
              <div style={{ position: 'absolute', left: '15px', top: '10px', bottom: '10px', width: '2px', background: 'var(--border-color)', zIndex: 0 }} />
              
              {history.map((h, i) => {
                const isLatest = i === 0;
                return (
                  <div key={h.id} style={{ display: 'flex', gap: '16px', position: 'relative', zIndex: 1 }}>
                    <div style={{ 
                      width: '32px', height: '32px', borderRadius: '50%', 
                      background: isLatest ? 'var(--accent-color)' : 'var(--bg-input)',
                      border: \`2px solid \${isLatest ? 'var(--accent-color)' : 'var(--border-color)'}\`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 
                    }}>
                      {isLatest ? <Clock size={14} color="white" /> : <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-tertiary)' }} />}
                    </div>
                    
                    <div style={{ flex: 1, padding: '12px', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {h.from_status && (
                            <>
                              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{STATUS_LABELS[h.from_status] || h.from_status}</span>
                              <ArrowRight size={12} color="var(--text-tertiary)" />
                            </>
                          )}
                          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {STATUS_LABELS[h.to_status] || h.to_status}
                          </span>
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {format(new Date(h.changed_at), 'd MMM yyyy, HH:mm', { locale: uk })}
                        </span>
                      </div>
                      
                      {(h.reason || h.source) && (
                        <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '12px' }}>
                          {h.source && <span style={{ color: 'var(--text-tertiary)' }}>Джерело: <span style={{ color: 'var(--text-secondary)' }}>{h.source}</span></span>}
                          {h.reason && <span style={{ color: 'var(--danger-color)' }}>Причина: {h.reason}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
`;

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

const endCode = `
      </div>
    </div>
  );
}
`;

const fullRightCol = timelineCode + tabsCode + infoCode + communicationCode + specCode + finCode + histCode;

code = before + fullRightCol + modalCode + endCode;

fs.writeFileSync('C:\\\\hhgh\\\\PLM module\\\\frontend\\\\src\\\\OrderCard.tsx', code);
console.log('Rebuilt successfully');
