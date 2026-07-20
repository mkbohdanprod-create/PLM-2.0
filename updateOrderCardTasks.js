const fs = require('fs');
let data = fs.readFileSync('C:\\\\hhgh\\\\PLM module\\\\frontend\\\\src\\\\OrderCard.tsx', 'utf8');

const pendingReplacement = `{pendingTasks.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>Активні задачі</h4>
                {pendingTasks.map((t: any) => (
                  <div key={t.id} style={{ padding: '12px', background: 'var(--bg-panel)', border: '1px solid var(--danger-color)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
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
                    <button onClick={() => setTaskToClose(t)} style={{ padding: '6px 12px', background: 'var(--success-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Виконано</button>
                  </div>
                ))}
              </div>
            )}`;

const completedReplacement = `{completedTasks.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>Історія комунікацій</h4>
                {completedTasks.map((t: any) => (
                  <div key={t.id} style={{ padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{t.title}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{t.completed_at ? format(new Date(t.completed_at), "d MMM, HH:mm", { locale: uk }) : 'Без дати'}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <span>Етап: {TASK_STAGE_LABELS[t.macro_stage] || t.macro_stage || 'Не вказано'}</span>
                      <span>Створено: {format(new Date(t.created_at), 'd MMM HH:mm', { locale: uk })} {t.creator?.full_name && \`(\${t.creator.full_name})\`}</span>
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
            )}`;

data = data.replace(/\{pendingTasks\.length > 0 && \([\s\S]*?\{completedTasks\.length > 0 && \(/, pendingReplacement + '\n\n            {completedTasks.length > 0 && (');
data = data.replace(/\{completedTasks\.length > 0 && \([\s\S]*?\{pendingTasks\.length === 0 && completedTasks\.length === 0 && \(/, completedReplacement + '\n\n            {pendingTasks.length === 0 && completedTasks.length === 0 && (');

fs.writeFileSync('C:\\\\hhgh\\\\PLM module\\\\frontend\\\\src\\\\OrderCard.tsx', data);
