import { useState, useEffect } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { supabase } from '../../supabase';
import { EngineeringBacklog } from './EngineeringBacklog';
import { ConstructorLane } from './ConstructorLane';
import { ConstructorKanbanBoard } from './ConstructorKanbanBoard';

interface EngineeringBoardProps {
  profile: any;
  globalRegion: string[];
  globalSearchQuery: string;
}

const TABS = [
  { id: 'CONSTRUCTOR', label: 'Конструктивно' },
  { id: 'TECHNOLOGIST', label: 'Технолог' },
  { id: 'NESTING_HARD', label: 'Розкрій Твердих матеріалів' },
  { id: 'NESTING_ACRYLIC', label: 'Розкрій Акрилу' },
  { id: 'NESTING_COMPACT', label: 'Розкрій Компакт плити' },
];

export function EngineeringBoard({ profile, globalRegion, globalSearchQuery }: EngineeringBoardProps) {
  const [activeTab, setActiveTab] = useState('CONSTRUCTOR');
  const [employees, setEmployees] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [activeDragOrder, setActiveDragOrder] = useState<any>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);

  const isManager = profile?.role_code === 'SUPER_ADMIN' || profile?.role_code === 'HEAD_OF_ENGINEERING';

  useEffect(() => {
    if (!isManager && profile) {
      setSelectedEmployee(profile);
    }
  }, [isManager, profile]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    if (!selectedEmployee) {
       fetchData();
    }
  }, [refreshTrigger, activeTab, globalRegion, globalSearchQuery, selectedEmployee]);

  const fetchData = async () => {
    const { data: usersData } = await supabase
      .from('profiles')
      .select('*')
      .in('role_code', ['CONSTRUCTOR', 'SUPER_ADMIN', 'REGION_MANAGER']);
      
    setEmployees(usersData || []);

    const { data: ordersData } = await supabase
      .from('orders')
      .select('*, branches(name, region_id, regions(name)), order_addresses(city, street, building)')
      .in('status', ['ENGINEERING_DESIGN', 'ENGINEERING_NESTING', 'PAUSED']);
      
    const { data: tasksData } = await supabase
      .from('engineering_tasks')
      .select('*')
      .eq('specialization_type', activeTab)
      .neq('status', 'CANCELLED');

    setOrders(ordersData || []);
    setTasks(tasksData || []);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const order = orders.find(o => o.id === active.id) || tasks.find(t => t.id === active.id)?.order;
    setActiveDragOrder(active.data.current);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragOrder(null);
    const { active, over } = event;
    if (!over) return;

    const data = active.data.current as any;
    if (!data) return;

    const orderId = data.id || data.order_id;
    const dropId = over.id as string;

    if (dropId === 'backlog') {
      const existingTask = tasks.find(t => t.order_id === orderId && t.status === 'IN_PROGRESS');
      if (existingTask) {
        await supabase.rpc('update_engineering_task_status', { p_task_id: existingTask.id, p_status: 'CANCELLED' });
        setRefreshTrigger(prev => prev + 1);
      }
      return;
    }

    const assignedTo = dropId;
    
    const existingTask = tasks.find(t => t.order_id === orderId && t.status === 'IN_PROGRESS');
    if (existingTask) {
      if (existingTask.assigned_to !== assignedTo) {
         await supabase.rpc('assign_engineer', { p_task_id: existingTask.id, p_assigned_to: assignedTo });
      }
    } else {
      await supabase.from('engineering_tasks').insert({
        order_id: orderId,
        assigned_to: assignedTo,
        specialization_type: activeTab,
        status: 'PENDING'
      });
    }
    setRefreshTrigger(prev => prev + 1);
  };

  const ordersInTasks = new Set(tasks.filter(t => t.status !== 'CANCELLED' && t.status !== 'COMPLETED').map(t => t.order_id));
  const backlogOrders = orders.filter(o => !ordersInTasks.has(o.id));

  if (selectedEmployee) {
    return (
      <div className="main-layout" style={{ background: 'var(--bg-main)', flex: 1 }}>
        <ConstructorKanbanBoard 
           employee={selectedEmployee} 
           specializationType={activeTab}
           isManager={isManager} 
           onBack={() => setSelectedEmployee(null)} 
        />
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="main-layout" style={{ background: 'var(--bg-main)', display: 'flex', flex: 1 }}>
        
        {/* Left Sidebar: Backlog */}
        <EngineeringBacklog orders={backlogOrders} />

        {/* Main Kanban Area */}
        <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Розподіл роботи (Kanban)</h2>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Перетягніть замовлення з беклогу в колонку інженера. Відображаються лише спеціалісти обраного пулу.
            </div>
            
            {isManager && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      padding: '6px 16px',
                      borderRadius: '20px',
                      border: 'none',
                      background: activeTab === tab.id ? 'var(--accent-color)' : 'transparent',
                      color: activeTab === tab.id ? 'white' : 'var(--text-primary)',
                      cursor: 'pointer',
                      fontWeight: activeTab === tab.id ? 600 : 400
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {employees.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Немає працівників для цієї спеціалізації</div>
            ) : (
              employees.map(emp => (
                <ConstructorLane 
                  key={emp.id} 
                  employee={emp} 
                  tasks={tasks.filter(t => t.assigned_to === emp.id && t.status !== 'CANCELLED' && t.status !== 'COMPLETED')}
                  allOrders={orders}
                  onSelect={() => setSelectedEmployee(emp)}
                />
              ))
            )}
          </div>

        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDragOrder ? (
          <div style={{
            background: 'var(--bg-surface)',
            padding: '12px',
            borderRadius: '8px',
            boxShadow: 'var(--shadow-lg)',
            borderLeft: '4px solid var(--accent-color)',
            width: '280px',
            opacity: 0.9,
            cursor: 'grabbing'
          }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {activeDragOrder.order_number || activeDragOrder.external_id || 'Без номера'}
            </div>
          </div>
        ) : null}
      </DragOverlay>

    </DndContext>
  );
}
