import { useDroppable } from '@dnd-kit/core';
import { User } from 'lucide-react';

interface ConstructorLaneProps {
  employee: any;
  tasks: any[];
  allOrders: any[];
  onSelect: () => void;
}

export function ConstructorLane({ employee, tasks, allOrders, onSelect }: ConstructorLaneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: employee.id,
  });

  return (
    <div style={{ marginBottom: '24px', background: 'var(--bg-panel)', borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
      
      {/* Employee Header */}
      <div 
        onClick={onSelect}
        style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'background 0.2s' }}
        onMouseOver={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <User size={16} color="var(--text-secondary)" />
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {employee.full_name || employee.email || 'Співробітник'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Спеціаліст</div>
          </div>
        </div>
        <div style={{ background: 'var(--accent-color)', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
          {tasks.length} завд.
        </div>
      </div>

      {/* Drop Zone */}
      <div 
        ref={setNodeRef} 
        style={{ 
          padding: '16px', 
          minHeight: '100px', 
          background: isOver ? 'var(--bg-secondary)' : 'transparent',
          transition: 'background 0.2s',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Зараз в роботі</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-color)' }}>{tasks.length} од.</div>
          </div>
          <div style={{ textAlign: 'right' }}>
             <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Виконано за місяць</div>
             <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>0 кв.м</div>
          </div>
        </div>
        
        {tasks.length === 0 ? (
          <div style={{ padding: '20px', border: '1px dashed var(--border-color)', borderRadius: '4px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
            Перетягніть сюди замовлення для роботи
          </div>
        ) : (
          tasks.map(t => {
            const order = allOrders.find(o => o.id === t.order_id);
            if (!order) return null;
            return (
              <div key={t.id} style={{ padding: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '4px', display: 'flex', justifyContent: 'space-between' }}>
                 <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {order.order_number || order.external_id || 'Без номера'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      {order.order_contacts?.[0]?.full_name || ''}
                    </div>
                 </div>
                 <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    КД не розпочато
                 </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
