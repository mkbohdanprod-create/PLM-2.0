import { useDraggable, useDroppable } from '@dnd-kit/core';
import { MapPin, AlertTriangle } from 'lucide-react';

interface EngineeringBacklogProps {
  orders: any[];
}

export function EngineeringBacklog({ orders }: EngineeringBacklogProps) {
  const { setNodeRef } = useDroppable({
    id: 'backlog',
  });

  return (
    <div ref={setNodeRef} className="panel sidebar" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Беклог: Конструктив</h3>
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Замовлення, готові до роботи</span>
      </div>
      
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px', background: 'var(--bg-main)' }}>
        {orders.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '20px', fontSize: '13px' }}>Беклог порожній</div>
        ) : (
          orders.map(o => <BacklogCard key={o.id} order={o} />)
        )}
      </div>
    </div>
  );
}

function BacklogCard({ order }: { order: any }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: order.id,
    data: { ...order, type: 'engineering_order' }
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '12px',
        cursor: 'grab',
        opacity: isDragging ? 0.5 : 1,
        borderLeft: '4px solid var(--accent-color)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {order.order_number || order.external_id || 'Без номера'}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--accent-color)', fontWeight: 600 }}>
          {order.status === 'ENGINEERING_DESIGN' ? 'Конструювання' : 'В роботі'}
        </span>
      </div>
      
      <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '8px', color: 'var(--text-primary)' }}>
        {order.order_contacts?.[0]?.full_name || 'Без імені'}
      </div>
      
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
        <MapPin size={12} style={{ marginTop: '2px', flexShrink: 0 }} />
        <span>
          {order.order_addresses?.[0] ? `${order.order_addresses[0].street}, ${order.order_addresses[0].building || ''}, ${order.order_addresses[0].city}` : 'Адреса не вказана'}
        </span>
      </div>
    </div>
  );
}
