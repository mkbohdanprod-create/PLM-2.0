import { useState, useEffect } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, useDraggable, useDroppable } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { supabase } from '../../supabase';
import { ArrowLeft, MapPin, AlertTriangle, CheckCircle } from 'lucide-react';

interface ConstructorKanbanBoardProps {
  employee: any;
  specializationType?: string;
  onBack?: () => void;
  isManager: boolean;
}

const COLUMNS = [
  { id: 'PENDING', label: 'В черзі' },
  { id: 'IN_PROGRESS', label: 'В роботі' },
  { id: 'CLIENT_APPROVAL', label: 'Уточнення' },
  { id: 'PAUSED', label: 'На паузі' },
  { id: 'COMPLETED', label: 'Готово' },
];

export function ConstructorKanbanBoard({ employee, specializationType, onBack, isManager }: ConstructorKanbanBoardProps) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [activeDragTask, setActiveDragTask] = useState<any>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    fetchData();
  }, [employee.id, refreshTrigger]);

  const fetchData = async () => {
    // Fetch all tasks for this employee
    let query = supabase.from('engineering_tasks').select('*').eq('assigned_to', employee.id).neq('status', 'CANCELLED');
    if (specializationType) {
        query = query.eq('specialization_type', specializationType);
    }
    const { data: tasksData } = await query;
    setTasks(tasksData || []);

    if (tasksData && tasksData.length > 0) {
      const orderIds = tasksData.map(t => t.order_id);
      const { data: ordersData } = await supabase
        .from('orders')
        .select('*, order_addresses(city, street, building), order_contacts(full_name)')
        .in('id', orderIds);
      setOrders(ordersData || []);
    } else {
      setOrders([]);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveDragTask(active.data.current);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragTask(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id;
    const newStatus = over.id as string;

    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status === newStatus) return;

    if (newStatus === 'COMPLETED') {
      // Completed is manual via button, ignore drag to completed
      alert("Перехід в 'Готово' відбувається через кнопку 'Завершити' всередині картки.");
      return;
    }

    await supabase.rpc('update_engineering_task_status', { p_task_id: taskId, p_status: newStatus });
    setRefreshTrigger(prev => prev + 1);
  };

  const handleProblem = async (taskId: string) => {
    if (window.confirm("Оголосити проблему? Замовлення повернеться на етап 'Виїзд замірника' (MEASUREMENT_SCHEDULING).")) {
      await supabase.rpc('update_engineering_task_status', { p_task_id: taskId, p_status: 'FAILED' });
      setRefreshTrigger(prev => prev + 1);
    }
  };

  const handleComplete = async (taskId: string, nextStatus: string) => {
    if (window.confirm("Завершити завдання?")) {
      await supabase.rpc('update_engineering_task_status', { 
        p_task_id: taskId, 
        p_status: 'COMPLETED',
        p_next_order_status: nextStatus
      });
      setRefreshTrigger(prev => prev + 1);
    }
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-main)' }}>
        
        {/* Header */}
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-panel)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {isManager && (
              <button 
                onClick={onBack}
                style={{ background: 'var(--bg-secondary)', border: 'none', padding: '8px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-primary)' }}
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <div>
              <h2 style={{ margin: 0, fontSize: '18px' }}>Робочий стіл: {employee.full_name || employee.email}</h2>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Спеціалізація: {specializationType || 'Всі'}</div>
            </div>
          </div>
        </div>

        {/* Kanban Board */}
        <div style={{ flex: 1, display: 'flex', overflowX: 'auto', padding: '20px', gap: '20px' }}>
          {COLUMNS.map(col => (
            <KanbanColumn 
              key={col.id} 
              column={col} 
              tasks={tasks.filter(t => t.status === col.id)} 
              orders={orders} 
              onProblem={handleProblem}
              onComplete={handleComplete}
            />
          ))}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDragTask ? (
          <div style={{ background: 'var(--bg-surface)', padding: '12px', borderRadius: '8px', boxShadow: 'var(--shadow-lg)', borderLeft: '4px solid var(--accent-color)', width: '280px', opacity: 0.9, cursor: 'grabbing' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
               {orders.find(o => o.id === activeDragTask.order_id)?.order_number || 'Замовлення'}
            </div>
          </div>
        ) : null}
      </DragOverlay>

    </DndContext>
  );
}

function KanbanColumn({ column, tasks, orders, onProblem, onComplete }: { column: any, tasks: any[], orders: any[], onProblem: (id: string) => void, onComplete: (id: string, st: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  const totalArea = tasks.reduce((sum, t) => sum + (Number(t.area_sqm) || 0), 0);

  return (
    <div 
      ref={setNodeRef}
      style={{
        flex: '0 0 300px',
        background: isOver ? 'var(--bg-secondary)' : 'var(--bg-panel)',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '100%',
        transition: 'background 0.2s'
      }}
    >
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>{column.label}</h3>
          {column.id === 'IN_PROGRESS' && (
             <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                KPI (зараз в роботі): {totalArea.toFixed(2)} м²
             </div>
          )}
        </div>
        <span style={{ background: 'var(--bg-main)', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
          {tasks.length}
        </span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {tasks.map(task => {
          const order = orders.find(o => o.id === task.order_id);
          if (!order) return null;
          return <KanbanCard key={task.id} task={task} order={order} onProblem={onProblem} onComplete={onComplete} />;
        })}
      </div>
    </div>
  );
}

function KanbanCard({ task, order, onProblem, onComplete }: { task: any, order: any, onProblem: (id: string) => void, onComplete: (id: string, st: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: task
  });
  
  const [showComplete, setShowComplete] = useState(false);
  const [nextStatus, setNextStatus] = useState('ENGINEERING_NESTING');

  // Prevent drag if dropdown is open
  const dragProps = showComplete ? {} : { ...listeners, ...attributes };

  return (
    <div
      ref={setNodeRef}
      {...dragProps}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        padding: '12px',
        cursor: showComplete ? 'default' : 'grab',
        opacity: isDragging ? 0.5 : 1,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {order.order_number || order.external_id || 'Без номера'}
        </span>
        {task.status !== 'COMPLETED' && (
          <button 
            onClick={(e) => { e.stopPropagation(); onProblem(task.id); }}
            title="Оголосити проблему (Брак інфо)"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger-color)', padding: '2px' }}
          >
            <AlertTriangle size={14} />
          </button>
        )}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
        {order.order_contacts?.[0]?.full_name || 'Без імені'}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
        <MapPin size={12} style={{ marginTop: '2px', flexShrink: 0 }} />
        <span>
          {order.order_addresses?.[0] ? `${order.order_addresses[0].street}, ${order.order_addresses[0].building || ''}, ${order.order_addresses[0].city}` : 'Адреса не вказана'}
        </span>
      </div>

      {task.status !== 'COMPLETED' && (
         <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
           {!showComplete ? (
             <button
                onClick={(e) => { e.stopPropagation(); setShowComplete(true); }}
                style={{ width: '100%', background: 'var(--success-color)', color: 'white', border: 'none', borderRadius: '4px', padding: '6px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
             >
                <CheckCircle size={14} /> Завершити
             </button>
           ) : (
             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
               <select 
                 value={nextStatus} 
                 onChange={(e) => setNextStatus(e.target.value)}
                 style={{ width: '100%', padding: '4px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)' }}
               >
                 <option value="CLIENT_APPROVAL">На погодження (CLIENT_APPROVAL)</option>
                 <option value="ENGINEERING_NESTING">На розкрій (ENGINEERING_NESTING)</option>
                 <option value="PRODUCTION_QUEUE">У виробництво (PRODUCTION_QUEUE)</option>
               </select>
               <div style={{ display: 'flex', gap: '8px' }}>
                 <button
                    onClick={(e) => { e.stopPropagation(); onComplete(task.id, nextStatus); setShowComplete(false); }}
                    style={{ flex: 1, background: 'var(--success-color)', color: 'white', border: 'none', borderRadius: '4px', padding: '6px', fontSize: '12px', cursor: 'pointer' }}
                 >
                    ОК
                 </button>
                 <button
                    onClick={(e) => { e.stopPropagation(); setShowComplete(false); }}
                    style={{ flex: 1, background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: 'none', borderRadius: '4px', padding: '6px', fontSize: '12px', cursor: 'pointer' }}
                 >
                    Скасувати
                 </button>
               </div>
             </div>
           )}
         </div>
      )}
    </div>
  );
}
