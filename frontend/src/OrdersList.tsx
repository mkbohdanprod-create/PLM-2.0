import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { MapPin, User, Clock, AlertTriangle, Lock, Building, PhoneCall, Mail, Calendar, MessageSquare, StickyNote, FileText } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';

import { getMacroStage, STATUS_LABELS, isPaused, MACRO_STAGE_LABELS } from './utils/orderStages';

interface OrdersListProps {
  onSelectOrder: (orderId: string) => void;
  refreshTrigger: number;
  profile?: any;
  activeModule?: string;
  selectedOrderId?: string | null;
  statusFilter?: string[];
  subStatusFilter?: string[];
  sortMode?: string;
  globalRegion?: string[];
  globalStatus?: string;
  globalType?: string;
  globalSearchQuery?: string;
}

const getActivityIcon = (type: string) => {
  switch (type) {
    case 'CALL': return <PhoneCall size={14} />;
    case 'SMS': return <MessageSquare size={14} />;
    case 'EMAIL': return <Mail size={14} />;
    case 'MEETING': return <Calendar size={14} />;
    case 'INTERNAL_NOTE': return <StickyNote size={14} />;
    default: return <FileText size={14} />;
  }
};

const getExpectedMacroStage = (module: string | undefined): string[] | null => {
  switch (module) {
    case 'Планування замірів': return ['MEASUREMENT_SCHEDULING', 'MEASUREMENT'];
    case 'Конструктив': return ['ENGINEERING'];
    case 'Виробництво': return ['MANUFACTURING'];
    case 'Логістика': return ['DELIVERY_SCHEDULING', 'DELIVERY', 'READY_FOR_PICKUP'];
    case 'Монтажі': return ['INSTALLATION_SCHEDULING', 'INSTALLATION'];
    default: return null;
  }
};

export function OrdersList({ onSelectOrder, refreshTrigger, profile, activeModule, selectedOrderId, statusFilter = ['DEFAULT'], subStatusFilter = ['ALL'], sortMode = 'planned_call', globalRegion = ['Всі'], globalStatus = 'Актуальні', globalType = 'Всі', globalSearchQuery = '' }: OrdersListProps) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();
  }, [refreshTrigger, profile]);

  const fetchOrders = async () => {
    setLoading(true);
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id, 
        created_at,
        order_number,
        external_id, 
        status, 
        resume_date,
        branch_id,
        planned_call_date,
        call_comment,
        is_incomplete,
        order_type,
        branches (name, region_id, regions(name)),
        order_contacts (full_name, phone),
        order_addresses (city, street, building),
        measurement_tasks (id, outcome, scheduled_date, start_time),
        order_activities (id, title, activity_type, planned_at, status, outcome, macro_stage, created_at, completed_at, outcome_notes)
      `)
      .eq('is_hidden', false)
      .order('created_at', { ascending: false });

    if (ordersError) {
      console.error(ordersError);
      alert("Error fetching orders: " + JSON.stringify(ordersError));
    }

    let filteredOrders = (ordersData || []).map((o: any) => {
      const pendingActivities = (o.order_activities || []).filter((a: any) => a.status === 'PENDING');
      if (pendingActivities.length > 0) {
        pendingActivities.sort((a: any, b: any) => new Date(a.planned_at).getTime() - new Date(b.planned_at).getTime());
        o.next_activity_at = pendingActivities[0].planned_at;
      } else {
        o.next_activity_at = null;
      }
      return o;
    });

    if (activeModule === 'Пауза (Відкладені)') {
      filteredOrders = filteredOrders.filter((o: any) => isPaused(o.status));
    }

    setOrders(filteredOrders);
    setLoading(false);
  };

  const { setNodeRef, isOver } = useDroppable({
    id: 'orders_list',
  });

  if (loading) return <div style={{ padding: 'var(--space-24)', color: 'var(--text-secondary)' }}>Завантаження...</div>;

  let finalOrders = orders;

  const expectedStage = getExpectedMacroStage(activeModule);

  if (statusFilter.includes('ALL')) {
    finalOrders = orders;
  } else if (statusFilter.includes('DEFAULT')) {
    finalOrders = orders.filter(o => {
      const pendingActivities = o.order_activities?.filter((a: any) => a.status === 'PENDING') || [];
      const hasModuleTask = expectedStage 
        ? pendingActivities.some((a: any) => !a.macro_stage || expectedStage.includes(a.macro_stage))
        : pendingActivities.length > 0;

      if (activeModule === 'Планування замірів') {
        return hasModuleTask || ['MEASUREMENT_SCHEDULING'].includes(o.status) || isPaused(o.status) || !!o.next_activity_at;
      } else if (activeModule === 'Конструктив') {
        return hasModuleTask || getMacroStage(o.status) === 'ENGINEERING' || isPaused(o.status);
      }
      return hasModuleTask;
    });
  } else {
    finalOrders = orders.filter(o => {
      const statusMatches = statusFilter.includes(o.status) || statusFilter.includes(getMacroStage(o.status));
      const pendingActivities = o.order_activities?.filter((a: any) => a.status === 'PENDING') || [];
      const taskMatches = pendingActivities.some((a: any) => statusFilter.includes(a.macro_stage));
      return statusMatches || taskMatches;
    });
  }

  // Apply SubStatus Filter
  if (!subStatusFilter.includes('ALL')) {
    finalOrders = finalOrders.filter(o => subStatusFilter.includes(o.status));
  }

  // Apply Global Filters
  if (!globalRegion.includes('Всі')) {
    finalOrders = finalOrders.filter(o => {
      const rName = o.branches?.regions?.name;
      return rName && globalRegion.includes(rName);
    });
  }

  if (globalStatus !== 'Всі' && globalStatus !== 'Актуальні') {
    if (globalStatus === 'На паузі') {
      finalOrders = finalOrders.filter(o => isPaused(o.status));
    }
  }

  if (globalType !== 'Всі') {
    if (globalType === 'По кресленню') {
      finalOrders = finalOrders.filter(o => o.order_type === 'BY_DRAWING');
    } else if (globalType === 'Повний цикл') {
      finalOrders = finalOrders.filter(o => o.order_type === 'FULL_CYCLE');
    } else if (globalType === 'Без монтажу') {
      finalOrders = finalOrders.filter(o => o.order_type === 'NO_INSTALLATION');
    }
  }

  // Apply text search
  if (globalSearchQuery.trim()) {
    const searchTerms = globalSearchQuery.toLowerCase().split(' ').filter(t => t.trim().length > 0);
    finalOrders = finalOrders.filter(o => {
      const contact = o.order_contacts?.[0];
      const address = o.order_addresses?.[0] || {};
      const extId = o.external_id;

      const searchableText = [
        extId,
        o.order_number,
        contact?.full_name,
        contact?.phone,
        address?.city,
        address?.street,
        address?.building
      ].filter(Boolean).join(' ').toLowerCase();

      return searchTerms.every(term => searchableText.includes(term));
    });
  }

  if (finalOrders.length === 0) return <div style={{ padding: 'var(--space-24)', color: 'var(--text-secondary)' }}>Немає замовлень</div>;

  if (sortMode === 'oldest') {
    finalOrders = [...finalOrders].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  } else if (sortMode === 'newest') {
    finalOrders = [...finalOrders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } else if (sortMode === 'status') {
    finalOrders = [...finalOrders].sort((a, b) => (a.status || '').localeCompare(b.status || ''));
  } else if (sortMode === 'planned_call') {
    finalOrders = [...finalOrders].sort((a, b) => {
      let dateA = a.planned_call_date ? new Date(a.planned_call_date).getTime() : 0;
      const tasksA = a.order_activities?.filter((t: any) => t.status === 'PENDING') || [];
      tasksA.forEach((t: any) => {
        if (t.planned_at) {
          const tDate = new Date(t.planned_at).getTime();
          if (dateA === 0 || tDate < dateA) dateA = tDate;
        }
      });

      let dateB = b.planned_call_date ? new Date(b.planned_call_date).getTime() : 0;
      const tasksB = b.order_activities?.filter((t: any) => t.status === 'PENDING') || [];
      tasksB.forEach((t: any) => {
        if (t.planned_at) {
          const tDate = new Date(t.planned_at).getTime();
          if (dateB === 0 || tDate < dateB) dateB = tDate;
        }
      });

      if (dateA === 0 && dateB === 0) return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (dateA === 0) return 1;
      if (dateB === 0) return -1;
      return dateA - dateB;
    });
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'flex', flexDirection: 'column', gap: '8px', padding: '0 16px 16px 16px', overflowY: 'auto', flex: 1,
        background: isOver ? 'rgba(0,0,0,0.05)' : 'transparent',
        transition: 'background 0.2s'
      }}>
        {finalOrders.flatMap(o => {
          let pendingActivities = o.order_activities?.filter((a: any) => a.status === 'PENDING') || [];
          
          if (expectedStage) {
            pendingActivities = pendingActivities.filter((a: any) => !a.macro_stage || expectedStage.includes(a.macro_stage));
          }
          
          const items = [];
          let showOrderCard = true;
          if (!statusFilter.includes('DEFAULT') && !statusFilter.includes('ALL')) {
             showOrderCard = statusFilter.includes(o.status) || statusFilter.includes(getMacroStage(o.status));
          }
          if (showOrderCard) {
            items.push(
              <DraggableOrder key={o.id} order={o} onSelectOrder={onSelectOrder} isSelected={o.id === selectedOrderId} activeModule={activeModule} />
            );
          }
          
          pendingActivities.forEach((task: any) => {
            items.push(
              <TaskListItem key={task.id} order={o} task={task} onSelectOrder={onSelectOrder} isSelected={false} />
            );
          });
          
          return items;
        })}
    </div>
  );
}

function TaskListItem({ order: o, task: t, onSelectOrder, isSelected }: { order: any, task: any, onSelectOrder: (id: string) => void, isSelected?: boolean }) {
  let isOverdue = false;
  let dateString = 'Без дати';
  try {
    if (t.planned_at) {
      const d = new Date(t.planned_at);
      isOverdue = d.getTime() < Date.now();
      dateString = format(d, "d MMM yyyy, HH:mm", { locale: uk });
    }
  } catch (e) {
    dateString = 'Помилка дати';
  }

  const contact = o.order_contacts?.[0];
  const clientName = contact?.full_name || 'Немає клієнта';
  const phone = contact?.phone || '';

  const addressObj = o.order_addresses?.[0];
  const addressStr = addressObj ? `${addressObj.city || ''} ${addressObj.street ? 'вул. ' + addressObj.street : ''} ${addressObj.building || ''}`.trim() : 'Адреса не вказана';

  const activeTasks = o.measurement_tasks?.filter((mt: any) => mt.outcome === 'SCHEDULED' || mt.outcome === 'IN_PROGRESS') || [];
  let measurementDateStr = null;
  if (activeTasks.length > 0 && activeTasks[0].scheduled_date) {
    measurementDateStr = format(new Date(activeTasks[0].scheduled_date), 'd MMM yyyy', { locale: uk }) + (activeTasks[0].start_time ? `, ${activeTasks[0].start_time.slice(0, 5)}` : '');
  }

  return (
    <div
      onClick={() => onSelectOrder(o.id)}
      style={{
        background: 'var(--bg-panel)',
        borderRadius: 'var(--radius-md)',
        border: `1px solid var(--border-color)`,
        boxShadow: isSelected ? '0 0 0 2px #10b981' : 'var(--shadow-sm)',
        display: 'flex', position: 'relative', overflow: 'hidden', cursor: 'pointer',
        flexShrink: 0,
        minHeight: 'fit-content'
      }}>

      <div style={{
        width: '6px',
        background: '#10b981',
        flexShrink: 0
      }} />

      <div style={{ flex: 1, padding: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
              {o.external_id || 'Без номера (1С)'}
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px' }}>
              {clientName}
            </div>
            {phone && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {phone}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <div style={{
              background: 'rgba(16, 185, 129, 0.1)',
              color: '#10b981',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 600,
              border: '1px solid #10b981'
            }}>
              {t.title || 'Активність'}
            </div>
            {measurementDateStr && (
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Замір: {measurementDateStr}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '12px' }}>
            <MapPin size={12} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{addressStr}</span>
          </div>

          <span style={{ 
            fontSize: '11px', 
            color: isOverdue ? '#b91c1c' : 'var(--text-secondary)', 
            background: isOverdue ? '#fecaca' : 'transparent',
            padding: isOverdue ? '2px 6px' : '0',
            borderRadius: '4px',
            fontWeight: isOverdue ? 600 : 400,
            display: 'flex', alignItems: 'center', gap: '4px',
            border: isOverdue ? '1px solid #ef4444' : 'none',
            animation: isOverdue ? 'pulse 2s infinite' : 'none',
            width: 'fit-content'
          }}>
            <Clock size={12} />
            {dateString}
          </span>
        </div>
      </div>
    </div>
  );
}

function DraggableOrder({ order: o, onSelectOrder, isSelected, activeModule }: { order: any, onSelectOrder: (id: string) => void, isSelected?: boolean, activeModule?: string }) {
  const activeTasks = o.measurement_tasks?.filter((t: any) => t.outcome === 'SCHEDULED' || t.outcome === 'IN_PROGRESS') || [];
  const isDraft = ['MEASUREMENT_SCHEDULING', 'MEASUREMENT_PRE_SCHEDULED'].includes(o.status) && activeTasks.length > 0;
  const isLocked = o.status === 'MEASUREMENT_SCHEDULED';
  const isOverdueCall = activeModule === 'Планування замірів' && o.planned_call_date && new Date(o.planned_call_date).getTime() < Date.now();

  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: o.id,
    data: { ...o, type: 'order_list_item' },
    disabled: isLocked
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: 100,
    opacity: 0.8
  } : undefined;

  const clientName = o.order_contacts?.[0]?.full_name || 'Немає клієнта';
  const addressObj = o.order_addresses?.[0];
  const addressStr = addressObj ? `${addressObj.city || ''} ${addressObj.street ? 'вул. ' + addressObj.street : ''} ${addressObj.building || ''}`.trim() : 'Адреса не вказана';
  const branchName = o.branches?.name || 'Без філії';
  
  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: isDraft ? '#fefce8' : 'var(--bg-panel)',
        borderRadius: 'var(--radius-md)',
        border: isDraft ? '1px solid #fef08a' : (isOverdueCall ? '2px solid var(--danger-color)' : '1px solid var(--border-color)'),
        padding: '12px 12px 12px 32px',
        cursor: isLocked ? 'pointer' : 'grab',
        opacity: isDraft ? 0.9 : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        boxShadow: transform ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
        position: 'relative',
        animation: isOverdueCall ? 'pulseBorder 2s infinite' : 'none'
      }}
      className={`table-row-hover ${isSelected ? 'selected-pulse' : ''}`}
      onClick={() => onSelectOrder(o.id)}
      {...listeners}
      {...attributes}
    >
      <div
        onPointerDown={(e) => {
          if (isDraft && activeTasks.length > 0 && activeTasks[0].scheduled_date) {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent('jump_to_calendar_date', { detail: { date: activeTasks[0].scheduled_date } }));
          }
        }}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '24px',
          background: isPaused(o.status) ? 'var(--danger-color)' : (o.status === 'MEASUREMENT_SCHEDULED' ? '#8b5cf6' : 'var(--accent-color)'),
          borderRadius: 'var(--radius-md) 0 0 var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          cursor: isDraft ? 'pointer' : 'inherit'
        }}>
        <span style={{
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
          fontSize: '10px',
          fontWeight: 700,
          color: 'white',
          whiteSpace: 'nowrap',
          letterSpacing: '0.5px'
        }}>
          {MACRO_STAGE_LABELS[getMacroStage(o.status)] || getMacroStage(o.status)}
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingLeft: '8px' }}>
        <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {o.external_id || 'Без номера (1С)'}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {o.is_incomplete && (
              <div title="Не всі обов'язкові поля заповнені">
                <AlertTriangle size={14} style={{ color: 'var(--accent-warning)' }} />
              </div>
            )}
          </div>
          {(() => {
            let subStatus = null;
            let subStatusDateStr = null;
            if (o.status === 'MEASUREMENT_SCHEDULING') {
              if (activeTasks.length > 0) {
                subStatus = 'Попередньо заплановано';
                subStatusDateStr = activeTasks[0].scheduled_date ? format(new Date(activeTasks[0].scheduled_date), 'd MMM yyyy', { locale: uk }) + (activeTasks[0].start_time ? `, ${activeTasks[0].start_time.slice(0, 5)}` : '') : 'Дата невідома';
              } else {
                subStatus = STATUS_LABELS[o.status] || o.status;
                if (o.planned_call_date) {
                  subStatusDateStr = format(new Date(o.planned_call_date), 'd MMM yyyy, HH:mm', { locale: uk });
                }
              }
            } else if (isPaused(o.status) && getMacroStage(o.status) === 'MEASUREMENT') {
              subStatus = 'Пауза замір';
              if (o.resume_date) {
                subStatusDateStr = format(new Date(o.resume_date), 'd MMM yyyy', { locale: uk }) + ', 10:00';
              }
            } else {
              subStatus = STATUS_LABELS[o.status] || o.status;
            }

            if (!subStatus) return null;

            let styleOpts = { bg: 'transparent', border: 'none', color: 'var(--text-primary)' };
            if (subStatus === 'Пауза замір' || subStatus === 'На паузі') {
              styleOpts = { bg: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger-color)', color: 'var(--danger-color)' };
            } else if (subStatus === 'Попередньо заплановано') {
              styleOpts = { bg: 'rgba(217, 119, 6, 0.1)', border: '1px solid #d97706', color: '#d97706' };
            } else {
              styleOpts = { bg: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' };
            }

            return (
              <div style={{
                fontSize: '10px', textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginTop: '2px',
                background: styleOpts.bg,
                padding: '4px 6px', borderRadius: '4px',
                border: styleOpts.border
              }}>
                <span style={{ color: styleOpts.color, fontWeight: 600 }}>{subStatus}</span>
                {subStatusDateStr && (
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                    {subStatusDateStr}
                  </span>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      <div style={{ paddingLeft: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
        {clientName}
      </div>

      <div style={{ paddingLeft: '8px', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '12px' }}>
          <MapPin size={12} />
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{addressStr}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '12px' }}>
          <Building size={12} />
          <span>{branchName}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px' }}>
          {activeModule === 'Планування замірів' && o.planned_call_date ? (
            <span style={{ 
              fontSize: '11px', 
              color: isOverdueCall ? '#b91c1c' : 'var(--text-secondary)', 
              background: isOverdueCall ? '#fecaca' : 'transparent', 
              padding: isOverdueCall ? '2px 6px' : '0', 
              borderRadius: '4px', 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '4px', 
              fontWeight: isOverdueCall ? 700 : 400,
              animation: isOverdueCall ? 'pulse 2s infinite' : 'none'
            }}>
              <Clock size={12} />
              {format(new Date(o.planned_call_date), 'd MMM yyyy, HH:mm', { locale: uk })}
            </span>
          ) : (
            <>
              <Clock size={12} />
              <span>
                {activeModule === 'Планування замірів' 
                  ? 'Дату продзвону не вказано' 
                  : (o.created_at ? format(new Date(o.created_at), 'd MMM yyyy, HH:mm', { locale: uk }) : 'Невідомо')}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
