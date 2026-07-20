import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { Layers, Search } from 'lucide-react';
import { isPaused, getMacroStage } from './utils/orderStages';

const STATUS_COLORS: Record<string, string> = {
  MEASUREMENT_SCHEDULING: 'var(--accent-color)', // Очікує планування заміру
  MEASUREMENT_PRELIMINARY: '#eab308', // Попередньо заплановано
  MEASUREMENT_SCHEDULED: '#8b5cf6', // Замір
  PAUSED: 'var(--danger-color)', // Пауза
  CANCELLED: 'var(--danger-color)'
};

const STATUS_LABELS: Record<string, string> = {
  PAUSED: 'На паузі',
  CANCELLED: 'Скасовано',
  MEASUREMENT_SCHEDULING: 'Очікує планування заміру',
  MEASUREMENT_PRELIMINARY: 'Попередньо заплановано',
  MEASUREMENT_SCHEDULED: 'Замір',
};

export function GanttChartPrototype() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, []);

  const loadOrderHistory = async (order: any) => {
    setSelectedOrder(order);
    setLoadingHistory(true);
    setHistoryItems([]);
    
    // Fetch status history
    const { data, error } = await supabase
      .from('order_status_history')
      .select('*')
      .eq('order_id', order.id)
      .order('changed_at', { ascending: true });
      
    if (!error && data) {
      setHistoryItems(data);
    }
    setLoadingHistory(false);
  };

  const fetchOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select('id, external_id, status, previous_status, resume_date, created_at, updated_at, measurement_tasks ( outcome, scheduled_date )')
      .order('created_at', { ascending: true })
      .limit(30);
      
    if (error) console.error(error);
    setOrders(data || []);
    setLoading(false);
  };

  if (loading) {
    return <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>Завантаження Гант-діаграми...</div>;
  }

  // Calculate timeline boundaries for the prototype
  const now = new Date();
  const minDate = orders.length > 0 
    ? new Date(Math.min(...orders.map(o => new Date(o.created_at).getTime())))
    : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // minus 7 days
    
  const maxDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // plus 14 days
  
  const totalDuration = maxDate.getTime() - minDate.getTime();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '24px', height: '100%' }}>
      <div>
        <h2 style={{ fontSize: '24px', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={24} color="var(--accent-color)" />
          Діаграма Ганта (Прототип)
        </h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>
          Візуалізація життєвого циклу замовлень від створення до планованого завершення.
        </p>
      </div>

      <div style={{ flex: 1, background: 'var(--bg-panel)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '24px', overflowX: 'auto' }}>
        <div style={{ minWidth: '800px', position: 'relative' }}>
          {/* Timeline Header */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '24px', position: 'relative' }}>
            <div style={{ width: '200px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '13px' }}>Замовлення</div>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '12px' }}>
              <span>{minDate.toLocaleDateString('uk-UA')}</span>
              <span>Сьогодні</span>
              <span>{maxDate.toLocaleDateString('uk-UA')}</span>
            </div>
          </div>

          {/* Current Time Line */}
          <div style={{
            position: 'absolute',
            top: '40px',
            bottom: 0,
            left: `calc(200px + ${((now.getTime() - minDate.getTime()) / totalDuration) * 100}%)`,
            width: '2px',
            background: 'var(--danger-color)',
            opacity: 0.3,
            zIndex: 0
          }} />

          {/* Gantt Bars */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', zIndex: 1 }}>
            {orders.map(order => {
              const start = order.created_at ? new Date(order.created_at) : now;
              const updatedAt = order.updated_at ? new Date(order.updated_at) : now;
              
              // Calculate Sub-status and Date
              let subStatusKey = order.status;
              let targetDate = null;
              
              const activeTasks = order.measurement_tasks?.filter((t: any) => t.outcome === 'SCHEDULED' || t.outcome === 'IN_PROGRESS') || [];
              const taskDateStr = activeTasks.length > 0 ? activeTasks[0].scheduled_date : null;
              
              if (order.status === 'MEASUREMENT_SCHEDULING') {
                if (activeTasks.length > 0) {
                  subStatusKey = 'MEASUREMENT_PRELIMINARY';
                  targetDate = new Date(taskDateStr);
                }
              } else if (order.status === 'MEASUREMENT_SCHEDULED') {
                 if (activeTasks.length > 0) {
                   targetDate = new Date(taskDateStr);
                 }
              } else if (isPaused(order.status) && getMacroStage(order.status) === 'MEASUREMENT') {
                subStatusKey = 'PAUSED';
              } else {
                if (order.resume_date) {
                  targetDate = new Date(order.resume_date);
                }
              }
              
              // Determine end date for bar
              let end = targetDate;
              if (!end) {
                end = isPaused(order.status) || order.status === 'CANCELLED' 
                  ? updatedAt 
                  : new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000); // just 1 day default if no date
              }
                
              const leftPercent = Math.max(0, ((start.getTime() - minDate.getTime()) / totalDuration) * 100);
              let rawWidth = ((end.getTime() - start.getTime()) / totalDuration) * 100;
              if (rawWidth < 1) rawWidth = 1; // minimum width to be visible
              const widthPercent = Math.min(100 - leftPercent, rawWidth);
              const color = STATUS_COLORS[subStatusKey] || STATUS_COLORS[order.status] || 'var(--text-secondary)';
              const label = STATUS_LABELS[subStatusKey] || STATUS_LABELS[order.status] || order.status;

              return (
                <div 
                  key={order.id} 
                  style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '4px', borderRadius: '4px', transition: 'background 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.02)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={() => loadOrderHistory(order)}
                >
                  <div style={{ width: '200px', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>
                    <span>{order.external_id || 'Без номера'}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{label}</span>
                  </div>
                  <div style={{ flex: 1, position: 'relative', height: '32px', background: 'var(--bg-input)', borderRadius: '4px' }}>
                    <div 
                      style={{ 
                        position: 'absolute', 
                        left: `${leftPercent}%`, 
                        width: `${widthPercent}%`, 
                        height: '100%', 
                        background: color, 
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 8px',
                        color: 'white',
                        fontSize: '11px',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        opacity: isPaused(order.status) ? 0.7 : 1
                      }}
                      title={label}
                    >
                      {label}
                      {targetDate && <span style={{marginLeft: '8px', opacity: 0.8}}>{targetDate.toLocaleDateString('uk-UA')}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {selectedOrder && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-panel)', borderRadius: '12px', width: '500px', maxWidth: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '18px' }}>Шлях замовлення {selectedOrder.external_id || 'Без номера'}</h3>
              <button onClick={() => setSelectedOrder(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--text-secondary)' }}>×</button>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              {loadingHistory ? (
                <div style={{ color: 'var(--text-secondary)' }}>Завантаження історії...</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Start node */}
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--text-secondary)' }} />
                      <div style={{ width: '2px', flex: 1, background: 'var(--border-color)', minHeight: '30px' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600 }}>Створення замовлення</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{new Date(selectedOrder.created_at).toLocaleString('uk-UA')}</div>
                    </div>
                  </div>
                  
                  {/* History nodes */}
                  {historyItems.map((item, i) => {
                    const isLast = i === historyItems.length - 1;
                    const newLabel = STATUS_LABELS[item.to_status] || item.to_status;
                    const color = STATUS_COLORS[item.to_status] || 'var(--accent-color)';
                    
                    return (
                      <div key={item.id} style={{ display: 'flex', gap: '16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: color }} />
                          {!isLast && <div style={{ width: '2px', flex: 1, background: 'var(--border-color)', minHeight: '30px' }} />}
                        </div>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: color }}>Перехід у: {newLabel}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{new Date(item.changed_at).toLocaleString('uk-UA')}</div>
                          {item.reason && <div style={{ fontSize: '12px', marginTop: '4px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Коментар: {item.reason}</div>}
                        </div>
                      </div>
                    );
                  })}
                  
                  {historyItems.length === 0 && (
                    <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Ще не було змін статусів</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
