const fs = require('fs');

let content = fs.readFileSync('src/OrderCard.tsx', 'utf8');

// 1. Update fetch
content = content.replace(
  /measurement_tasks\(\*, profiles\(full_name, branches\(name\)\)\), communication_tasks\(\*\)/g,
  'measurement_tasks(*, profiles(full_name, branches(name))), order_activities(*)'
);

// 2. Update state variable for pendingTasks
content = content.replace(
  /const pendingTasks = order\.communication_tasks\?\.filter\(\(t: any\) => t\.status === 'PENDING'\) \|\| \[\];/g,
  `const pendingTasks = order.order_activities?.filter((t: any) => t.status === 'PENDING') || [];
  const completedTasks = order.order_activities?.filter((t: any) => t.status === 'COMPLETED' || t.status === 'CANCELLED') || [];`
);

// 3. Update tabs list
content = content.replace(
  /\[\'Інформація\', \'Специфікація\', \'Фінанси\', \'Логістика\', \'Історія\'\]/g,
  "['Інформація', 'Комунікація', 'Специфікація', 'Фінанси', 'Логістика', 'Історія']"
);

// 4. Update complete logic
content = content.replace(
  /const { error } = await supabase\.rpc\('complete_communication_task', {\s+p_task_id: taskToClose\.id\s+}\);/g,
  `const { error } = await supabase.rpc('complete_activity', {
        p_activity_id: taskToClose.id,
        p_outcome: closeOutcome,
        p_outcome_notes: closeOutcomeNotes,
        p_next_planned_at: (closeOutcome === 'RESCHEDULED' || closeOutcome === 'NO_ANSWER') && newTaskDate ? new Date(newTaskDate).toISOString() : null
      });`
);

// 5. Update create task logic
content = content.replace(
  /const { error } = await supabase\.rpc\('create_communication_task', {[\s\S]*?}\);/g,
  `const { error } = await supabase.rpc('create_activity', {
         p_order_id: orderId,
         p_title: newTaskTitle || 'Дзвінок клієнту',
         p_type: newTaskType,
         p_planned_at: newTaskDate ? new Date(newTaskDate).toISOString() : new Date(Date.now() + 86400000).toISOString(),
         p_comment: newTaskComment
      });`
);

// 6. Update pause logic to use create_activity
content = content.replace(
  /await supabase\.rpc\('create_communication_task', {[\s\S]*?p_comment: pauseActivityComment \|\| \('Причина паузи: ' \+ pauseReason\)\s*}\);/g,
  `await supabase.rpc('create_activity', {
           p_order_id: orderId,
           p_title: 'Дзвінок (Вихід з паузи)',
           p_type: 'CALL',
           p_planned_at: new Date(pauseActivityDate).toISOString(),
           p_comment: pauseActivityComment || ('Причина паузи: ' + pauseReason)
         });`
);

// 7. REMOVE old tasks block from Інформація
// The old block looks roughly like: <div style={{ background: 'rgba(239, 68, 68, 0.05)', ... }}> <h3>Задачі та Комунікація</h3> ... </div>
// It ends somewhere before {/* Tabs Menu */} or similar. We can just replace it entirely using regex or indexOf.
const oldTaskBlockStart = content.indexOf("<div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid var(--danger-color)', padding: '16px', borderRadius: 'var(--radius-lg)' }}>");
if (oldTaskBlockStart !== -1) {
  // Find the end of this div. It's followed by a div wrapping the date edits.
  const oldTaskBlockEnd = content.indexOf("<div style={{ background: 'var(--bg-panel)', padding: '16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>", oldTaskBlockStart);
  if (oldTaskBlockEnd !== -1) {
    content = content.substring(0, oldTaskBlockStart) + content.substring(oldTaskBlockEnd);
  }
}

// 8. INSERT Комунікація tab content
const tabContent = `
        {activeTab === 'Комунікація' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary)' }}>Комунікація</h3>
              <button onClick={() => setShowCreateTask(true)} style={{ background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 16px', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}>
                + Нова активність
              </button>
            </div>

            {pendingTasks.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>Заплановані (Pending)</h4>
                {pendingTasks.map((t: any) => (
                  <div key={t.id} style={{ padding: '12px', background: '#fefce8', border: '1px solid #fef08a', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                         {t.title}
                         <span style={{ fontSize: '10px', background: '#eab308', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>{t.activity_type}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={12} /> {format(new Date(t.planned_at), "d MMM, HH:mm", { locale: uk })}
                      </div>
                      {t.comment && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', fontStyle: 'italic' }}>{t.comment}</div>}
                    </div>
                    <button onClick={() => setTaskToClose(t)} style={{ padding: '6px 12px', background: 'var(--success-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Виконано</button>
                  </div>
                ))}
              </div>
            )}

            {completedTasks.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>Історія комунікацій</h4>
                {completedTasks.map((t: any) => (
                  <div key={t.id} style={{ padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{t.title}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{t.completed_at ? format(new Date(t.completed_at), "d MMM, HH:mm", { locale: uk }) : 'Без дати'}</span>
                    </div>
                    <div style={{ fontSize: '12px', marginTop: '4px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ background: t.status === 'CANCELLED' ? 'var(--danger-color)' : 'var(--success-color)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>
                        {t.status === 'CANCELLED' ? 'СКАСОВАНО' : (t.outcome || 'ВИКОНАНО')}
                      </span>
                      {t.outcome_notes && <span style={{ color: 'var(--text-secondary)' }}>{t.outcome_notes}</span>}
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

content = content.replace(/{activeTab === 'Специфікація'/g, tabContent + "\n        {activeTab === 'Специфікація'");

// 9. Modals replacement
// Find taskToClose modal
const taskModalStart = content.indexOf("{taskToClose && (");
if (taskModalStart !== -1) {
  const taskModalEnd = content.indexOf("{showCreateTask && (");
  if (taskModalEnd !== -1) {
    const newTaskModal = `
      {taskToClose && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-panel)', padding: '24px', borderRadius: 'var(--radius-lg)', width: '400px', maxWidth: '90%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0 }}>Результат задачі: {taskToClose.title}</h3>
            
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
              Результат:
              <select value={closeOutcome} onChange={e => setCloseOutcome(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)' }}>
                <option value="ANSWERED">Взяли слухавку</option>
                <option value="NO_ANSWER">Не взяли слухавку</option>
                <option value="REFUSED">Відмовились (Кинули слухавку)</option>
                <option value="RESCHEDULED">Попросили перетелефонувати</option>
                <option value="DONE">Вирішено / Інше</option>
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
              Коментар:
              <textarea value={closeOutcomeNotes} onChange={e => setCloseOutcomeNotes(e.target.value)} rows={3} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', resize: 'none' }} placeholder="Про що домовились?" />
            </label>

            {(closeOutcome === 'RESCHEDULED' || closeOutcome === 'NO_ANSWER') && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
                Перенести на:
                <input type="datetime-local" value={newTaskDate} onChange={e => setNewTaskDate(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)' }} />
              </label>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button onClick={() => setTaskToClose(null)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer' }}>Скасувати</button>
              <button onClick={() => handleProcessTaskClose(closeOutcome)} style={{ padding: '8px 16px', background: 'var(--success-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Зберегти</button>
            </div>
          </div>
        </div>
      )}

`;
    content = content.substring(0, taskModalStart) + newTaskModal + content.substring(taskModalEnd);
  }
}

// 10. Update Create Task Modal
const createModalStart = content.indexOf("{showCreateTask && (");
if (createModalStart !== -1) {
  // Find where showCreateTask modal ends. It's a bit tricky. We can replace it using regex.
  const createModalRegex = /{showCreateTask && \([\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?<\/div>\n\s*\)}/;
  const createModalNew = `
      {showCreateTask && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-panel)', padding: '24px', borderRadius: 'var(--radius-lg)', width: '400px', maxWidth: '90%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0 }}>Нова комунікація/задача</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select value={newTaskType} onChange={e => setNewTaskType(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)' }}>
                <option value="CALL">Дзвінок</option>
                <option value="SMS">SMS</option>
                <option value="EMAIL">Email</option>
                <option value="MEETING">Зустріч</option>
                <option value="INTERNAL_NOTE">Внутрішня задача</option>
              </select>
              <input type="text" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder="Короткий заголовок" style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)' }} />
            </div>
            <input type="datetime-local" value={newTaskDate} onChange={e => setNewTaskDate(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)' }} />
            <textarea value={newTaskComment} onChange={e => setNewTaskComment(e.target.value)} rows={3} placeholder="Коментар..." style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', resize: 'none' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setShowCreateTask(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer' }}>Скасувати</button>
              <button onClick={handleCreateTask} style={{ padding: '8px 16px', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Зберегти</button>
            </div>
          </div>
        </div>
      )}
  `;
  content = content.replace(createModalRegex, createModalNew);
}

fs.writeFileSync('src/OrderCard.tsx', content);
