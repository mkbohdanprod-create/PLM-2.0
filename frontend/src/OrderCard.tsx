import { useEffect, useState, useRef } from 'react';
import { supabase } from './supabase';
import { Play, Pause, Save, XCircle, AlertTriangle, Lock, ArrowRight, Clock, PhoneCall, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';

import { getMacroStage, STATUS_LABELS, isPaused, TASK_STAGE_LABELS } from './utils/orderStages';

const ORDER_TYPES: Record<string, string> = {
  FULL_CYCLE: 'Повний цикл',
  BY_DRAWING: 'По кресленню',
  NO_INSTALLATION: 'Без монтажу'
};

interface OrderCardProps {
  orderId: string;
  onStatusChanged: () => void;
  profile?: any;
}

export function OrderCard({ orderId, onStatusChanged, profile }: OrderCardProps) {
  const [order, setOrder] = useState<any>(null);
  const [transitions, setTransitions] = useState<string[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [activeTab, setActiveTab] = useState('Інформація');
  const [pauseReason, setPauseReason] = useState('');
  const [pauseEndDate, setPauseEndDate] = useState('');
  const [pauseActivityDate, setPauseActivityDate] = useState('');
  const [pauseActivityComment, setPauseActivityComment] = useState('Дзвінок після паузи');

  useEffect(() => {
    if (pauseEndDate && !pauseActivityDate) {
      const d = new Date(pauseEndDate);
      d.setDate(d.getDate() - 1);
      d.setHours(10, 0, 0, 0);
      try { setPauseActivityDate(d.toISOString().slice(0, 16)); } catch(e){}
    }
  }, [pauseEndDate]);

  const [history, setHistory] = useState<any[]>([]);
  const [departurePoint, setDeparturePoint] = useState<string | null>(null);
  
  const [showFixateConfirm, setShowFixateConfirm] = useState(false);
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false);
  const [showPauseConfirm, setShowPauseConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePin, setDeletePin] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);

  const [isEditingDates, setIsEditingDates] = useState(false);
  const [editDates, setEditDates] = useState({
    document_date: '',
    base_readiness_date: '',
    payment_date: '',
    calc_readiness_date: '',
    planned_call_date: '',
    call_comment: ''
  });
  const [savingDates, setSavingDates] = useState(false);
  
  const [taskToClose, setTaskToClose] = useState<any>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('Планування заміру');
  const [newTaskType, setNewTaskType] = useState('CALL');
  const [newTaskMacroStage, setNewTaskMacroStage] = useState('MEASUREMENT_SCHEDULING');
  const [newTaskDate, setNewTaskDate] = useState('');
  const [newTaskComment, setNewTaskComment] = useState('');
  const [selectedTaskDetails, setSelectedTaskDetails] = useState<any>(null);
  
  const [closeOutcome, setCloseOutcome] = useState('ANSWERED');
  const [closeOutcomeNotes, setCloseOutcomeNotes] = useState('');

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  const fetchOrder = async () => {
    setLoading(true);
    setActionError('');
    const { data: ord, error: ordErr } = await supabase
      .from('orders')
      .select('*, order_contacts(*), order_addresses(*), order_specifications(*), branches(region_id, name, regions(name)), measurement_tasks(*, profiles(full_name, branches(name))), order_activities(*, creator:profiles!order_activities_created_by_fkey(full_name), completer:profiles!order_activities_completed_by_fkey(full_name)), delivery_tasks(*, vehicles(name, plate_number), driver:profiles!driver_id(full_name))')
      .eq('id', orderId)
      .maybeSingle();
    
    if (ordErr) {
      console.error(ordErr);
      setLoading(false);
      return;
    }
    setOrder(ord);
    

    // Fetch transitions using RPC
    const { data: trans, error: transErr } = await supabase.rpc('get_allowed_transitions', { p_order_id: orderId });
    if (!transErr && trans) {
      const allowed = trans.map((t: any) => t.to_status);
      setTransitions(allowed);
      if (allowed.length > 0) {
        setSelectedTarget(allowed[0]);
      }
    }

    const { data: histData } = await supabase
      .from('order_status_history')
      .select('*')
      .eq('order_id', orderId)
      .order('changed_at', { ascending: false });
      
    if (histData) setHistory(histData);

    // Populate dates
    setEditDates({
      document_date: ord.document_date || '',
      base_readiness_date: ord.base_readiness_date || '',
      payment_date: ord.payment_date || '',
      calc_readiness_date: ord.calc_readiness_date || '',
      planned_call_date: ord.planned_call_date ? format(new Date(ord.planned_call_date), "yyyy-MM-dd'T'HH:mm") : '',
      call_comment: ord.call_comment || ''
    });

    setLoading(false);
  };

  useEffect(() => {
    async function fetchDeparture() {
      const activeMeasTask = order?.measurement_tasks?.find((t: any) => t.outcome === 'SCHEDULED' || t.outcome === 'IN_PROGRESS');
      if (!activeMeasTask || !activeMeasTask.measurer_id || !activeMeasTask.scheduled_date || !activeMeasTask.start_time) {
        setDeparturePoint(null);
        return;
      }
      const { data } = await supabase
        .from('measurement_tasks')
        .select('orders!inner(order_addresses(city, street, building))')
        .eq('measurer_id', activeMeasTask.measurer_id)
        .eq('scheduled_date', activeMeasTask.scheduled_date)
        .in('outcome', ['SCHEDULED', 'IN_PROGRESS'])
        .lt('start_time', activeMeasTask.start_time)
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle();
        
      if (data && data.orders?.order_addresses?.[0]) {
        const addr = data.orders.order_addresses[0];
        setDeparturePoint(`Попереднє замовлення: ${addr.city || ''}, ${addr.street || ''} ${addr.building || ''}`.trim());
      } else {
        setDeparturePoint(`База: ${activeMeasTask.profiles?.branches?.name || order?.branches?.name || 'Філія'}`);
      }
    }
    fetchDeparture();
  }, [order?.measurement_tasks]);

  const handleSaveDates = async () => {
    setSavingDates(true);
    const { error } = await supabase.rpc('update_order_dates', {
      p_order_id: orderId,
      p_document_date: editDates.document_date || null,
      p_base_readiness_date: editDates.base_readiness_date || null,
      p_payment_date: editDates.payment_date || null,
      p_calc_readiness_date: editDates.calc_readiness_date || null
    });
    
    // Also update planned_call_date and comment directly
    const { error: plannedError } = await supabase.rpc('update_planned_call', {
       p_order_id: orderId,
       p_date: editDates.planned_call_date ? new Date(editDates.planned_call_date).toISOString() : null,
       p_comment: editDates.call_comment || null
    });

    setSavingDates(false);
    if (error || plannedError) {
      alert('Помилка збереження дат: ' + (error?.message || plannedError?.message));
      return;
    }
    setIsEditingDates(false);
    fetchOrder();
  };

  const handlePause = async () => {
    try {
      const { error } = await supabase.rpc('change_order_status', {
        p_order_id: orderId,
        p_new_status: 'PAUSED',
        p_reason: pauseReason,
        p_planned_call_date: pauseActivityDate ? new Date(pauseActivityDate).toISOString() : null,
        p_call_comment: pauseActivityComment || null
      });
      if (error) throw error;

      if (pauseEndDate) {
        await supabase.from('orders').update({
          resume_date: pauseEndDate
        }).eq('id', orderId);
      }
      
      if (pauseActivityDate) {
         await supabase.from('order_activities').insert({
             order_id: orderId,
             title: 'Дзвінок (Вихід з паузи)',
             activity_type: 'CALL',
             planned_at: new Date(pauseActivityDate).toISOString(),
             comment: pauseActivityComment || ('Причина паузи: ' + pauseReason)
         });
      }

      onStatusChanged?.();
      fetchOrder();
    } catch (err: any) {
      alert('Помилка зміни статусу: ' + err.message);
    }
  };

  const handleAction = async (newStatus: string, reason?: string) => {
    try {
      const { error } = await supabase.rpc('change_order_status', {
        p_order_id: orderId,
        p_new_status: newStatus,
        ...(reason ? { p_reason: reason } : {})
      });
      if (error) throw error;
      onStatusChanged?.();
      fetchOrder();
    } catch (err: any) {
      alert('Помилка зміни статусу: ' + err.message);
    }
  };

  const handleMeasurementFailed = async () => {
    const reason = window.prompt("Вкажіть причину, чому замір не відбувся (Вина клієнта):");
    if (reason === null) return;
    handleAction('MEASUREMENT_FAILED', reason || 'Замір не відбувся (Клієнт)');
  };

  const handleMeasurementCanceled = async () => {
    const reason = window.prompt("Вкажіть причину скасування замірником (Вина компанії):");
    if (reason === null) return;
    handleAction('MEASUREMENT_CANCELED_BY_MEASURER', reason || 'Скасовано замірником');
  };

  const handleInstallationFailed = async () => {
    const reason = window.prompt("Вкажіть причину, чому монтаж не відбувся (Вина клієнта):");
    if (reason === null) return;
    handleAction('INSTALLATION_FAILED', reason || 'Монтаж не відбувся (Клієнт)');
  };

  const handleDelete = async () => {
    try {
      const { error } = await supabase.rpc('hide_order', {
        p_order_id: orderId,
        p_reason: 'Видалено користувачем через UI'
      });
      if (error) throw error;
      onStatusChanged?.(); // Will refresh list and OrderCard should be unmounted by parent due to selectedOrderId vanishing or being invalid
    } catch (err: any) {
      alert('Помилка видалення: ' + err.message);
    }
  };

  const handleFixateMeasurement = async () => {
    const isUnassigned = !order.measurement_tasks?.[0]?.measurer_id;
    
    // We removed window.confirm here and will handle it via state if needed,
    // or just let it pass to demonstrate the fix.
    // For now, let's keep it simple and just do the API call.
    try {
      const { error } = await supabase.rpc('change_order_status', {
        p_order_id: orderId,
        p_new_status: 'MEASUREMENT_SCHEDULED'
      });
      if (error) throw error;
      onStatusChanged?.();
      fetchOrder();
    } catch (err: any) {
      alert('Помилка фіксації заміру: ' + err.message);
    }
  };

  const handleUnlockMeasurement = async () => {
    try {
      const { error } = await supabase.rpc('change_order_status', {
        p_order_id: orderId,
        p_new_status: 'MEASUREMENT_SCHEDULING'
      });
      if (error) throw error;
      onStatusChanged?.();
      fetchOrder();
    } catch (err: any) {
      alert('Помилка розблокування заміру: ' + err.message);
    }
  };

  const handleProcessTaskClose = async (resolution: string) => {
    if (!taskToClose) return;
    try {
      const { error } = await supabase.rpc('complete_activity', {
        p_activity_id: taskToClose.id,
        p_outcome: closeOutcome,
        p_outcome_notes: closeOutcomeNotes,
        p_next_planned_at: (closeOutcome === 'RESCHEDULED' || closeOutcome === 'NO_ANSWER') && newTaskDate ? new Date(newTaskDate).toISOString() : null
      });
      if (error) throw error;
      
      if (resolution === 'RESCHEDULE') {
        setShowCreateTask(true);
      }
      
      setTaskToClose(null);
      fetchOrder();
      onStatusChanged?.();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleCreateTask = async () => {
    try {
      const { error } = await supabase.from('order_activities').insert({
         order_id: orderId,
         title: newTaskTitle || 'Планування заміру',
         activity_type: newTaskType,
         macro_stage: newTaskMacroStage,
         planned_at: newTaskDate ? new Date(newTaskDate).toISOString() : new Date(Date.now() + 86400000).toISOString(),
         comment: newTaskComment || null,
         created_by: profile?.id
      });
      if (error) throw error;
      setShowCreateTask(false);
      setNewTaskTitle('Планування заміру');
      setNewTaskDate('');
      setNewTaskComment('');
      fetchOrder();
      onStatusChanged?.();
    } catch (e: any) {
      alert(e.message);
    }
  };

  if (loading) return <div style={{ padding: 'var(--space-24)', color: 'var(--text-secondary)' }}>Завантаження картки...</div>;
  if (!order) return <div style={{ padding: 'var(--space-24)', color: 'var(--text-secondary)' }}>Замовлення не знайдено</div>;

  const contact = order.order_contacts?.[0] || {};
  const address = order.order_addresses?.[0] || {};
  const spec = order.order_specifications?.[0] || {};
  const activeMeasTask = order.measurement_tasks?.find((t: any) => t.outcome === 'SCHEDULED' || t.outcome === 'IN_PROGRESS');
  const activeDeliveryTask = order.delivery_tasks?.find((t: any) => t.outcome === 'SCHEDULED' || t.outcome === 'IN_PROGRESS');
  
  const pendingTasks = order.order_activities?.filter((t: any) => t.status === 'PENDING') || [];
  const completedTasks = order.order_activities?.filter((t: any) => t.status === 'COMPLETED' || t.status === 'CANCELLED') || [];
  
  const activeTask = order.measurement_tasks?.find((t: any) => t.outcome === 'SCHEDULED' || t.outcome === 'IN_PROGRESS');
  
  const regionId = order.branches?.region_id;
  const regionName = order.branches?.regions?.name || order.branches?.name || 'невідомого регіону';
  
  // Тимчасово дозволяємо ВСІМ користувачам виконувати дії, доки не впровадимо гнучкий модуль налаштування ролей
  const hasActionRight = true;

  return (
    <div style={{ padding: 'var(--space-24)', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', color: 'var(--text-primary)' }}>
            Замовлення {order.external_id || order.order_number || 'Без номера'}
          </h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span className={`badge ${isPaused(order.status) ? 'pause' : 'cold'}`}>
              {STATUS_LABELS[order.status] || order.status}
            </span>
            {order.is_incomplete && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--accent-warning)', padding: '2px 6px', borderRadius: 'var(--radius-sm)', fontSize: '12px', fontWeight: 600 }}>
                <AlertTriangle size={12} /> Неповна
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '12px' }}>

          
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {isPaused(order.status) && (
              <button 
                onClick={() => handleAction('RESUME')}
                style={{ padding: '6px 12px', background: 'var(--success-color)', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', boxShadow: '0 2px 8px rgba(16, 185, 129, 0.2)' }}
              >
                <Play size={14} /> Відновити
              </button>
            )}

            {(order.status === 'MEASUREMENT_SCHEDULING' || order.status === 'MEASUREMENT_PRE_SCHEDULED') && (
              <button 
                onClick={() => setShowFixateConfirm(true)}
                style={{
                  padding: '6px 16px',
                  background: 'var(--accent-color)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
                  transition: 'transform 0.1s, box-shadow 0.1s'
                }}
              >
                Зафіксувати
              </button>
            )}

            {order.status === 'MEASUREMENT_SCHEDULED' && (
              <button 
                onClick={() => setShowUnlockConfirm(true)}
                style={{
                  padding: '6px 12px',
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  fontWeight: 500,
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
              </button>
            )}

            {(order.status === 'MEASUREMENT_SCHEDULED' || order.status === 'MEASUREMENT_IN_PROGRESS') && (
              <>
                <button 
                  onClick={handleMeasurementFailed}
                  style={{ padding: '6px 12px', background: 'var(--bg-input)', color: 'var(--accent-warning)', border: '1px solid var(--accent-warning)', borderRadius: '6px', fontWeight: 500, fontSize: '12px', cursor: 'pointer' }}
                  title="Клієнт не зміг прийняти замірника (Перенесення)"
                >
                  Не відбувся (Клієнт)
                </button>
                <button 
                  onClick={handleMeasurementCanceled}
                  style={{ padding: '6px 12px', background: 'var(--bg-input)', color: 'var(--danger-color)', border: '1px solid var(--danger-color)', borderRadius: '6px', fontWeight: 500, fontSize: '12px', cursor: 'pointer' }}
                  title="Замірник не зміг приїхати (Повторний контакт)"
                >
                  Скасовано (Компанія)
                </button>
              </>
            )}

            {(order.status === 'INSTALLATION_SCHEDULED' || order.status === 'INSTALLATION_IN_PROGRESS') && (
              <>
                <button 
                  onClick={handleInstallationFailed}
                  style={{ padding: '6px 12px', background: 'var(--bg-input)', color: 'var(--accent-warning)', border: '1px solid var(--accent-warning)', borderRadius: '6px', fontWeight: 500, fontSize: '12px', cursor: 'pointer' }}
                  title="Клієнт не зміг прийняти монтажників (Перенесення)"
                >
                  Не відбувся (Клієнт)
                </button>
              </>
            )}

            {!isPaused(order.status) && order.status !== 'CANCELLED' && order.status !== 'COMPLETED' && order.status !== 'CLOSED' && (
              <button 
                onClick={() => setShowPauseConfirm(true)}
                style={{ padding: '6px 12px', background: 'var(--bg-input)', color: 'var(--accent-warning)', border: '1px solid var(--accent-warning)', borderRadius: '6px', fontWeight: 500, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                title="Поставити на паузу"
              >
                Пауза
              </button>
            )}

            {transitions.includes('CANCELLED') && (
              <button 
                onClick={() => setShowCancelConfirm(true)}
                style={{ padding: '6px 12px', background: 'var(--bg-input)', color: 'var(--accent-warning)', border: '1px solid var(--accent-warning)', borderRadius: '6px', fontWeight: 500, fontSize: '12px', cursor: 'pointer' }}
              >
                Скасувати
              </button>
            )}

            <button 
              onClick={() => setShowDeleteConfirm(true)}
              style={{ padding: '6px 12px', background: 'var(--bg-input)', color: 'var(--danger-color)', border: '1px solid var(--danger-color)', borderRadius: '6px', fontWeight: 500, fontSize: '12px', cursor: 'pointer' }}
            >
              Видалити
            </button>
          </div>
          
          {/* Modal confirmation dialogs */}
          {showFixateConfirm && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ padding: '24px', background: 'var(--bg-panel)', border: '1px solid var(--accent-color)', borderRadius: '12px', width: '400px', maxWidth: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'var(--text-primary)' }}>Підтвердження фіксації</h3>
                {(!activeMeasTask || !activeMeasTask.measurer_id) ? 
                  <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: 'var(--danger-color)' }}><strong>Увага! Цей замір не має призначеного замірника. Старшому замірнику буде надіслано сповіщення.</strong></p> :
                  <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: 'var(--text-primary)' }}>Фіксуємо замір у поточному стані?</p>
                }
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowFixateConfirm(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500 }}>Ні</button>
                  <button onClick={() => { setShowFixateConfirm(false); handleFixateMeasurement(); }} style={{ padding: '8px 16px', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>Так, зафіксувати</button>
                </div>
              </div>
            </div>
          )}

          {showUnlockConfirm && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ padding: '24px', background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '12px', width: '400px', maxWidth: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'var(--text-primary)' }}>Розблокування заміру</h3>
                <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Ви дійсно хочете розблокувати замір? (Замірнику буде надіслано сповіщення про зміну плану)</p>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowUnlockConfirm(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500 }}>Скасувати</button>
                  <button onClick={() => { setShowUnlockConfirm(false); handleUnlockMeasurement(); }} style={{ padding: '8px 16px', background: 'var(--text-primary)', color: 'var(--bg-panel)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>Так, розблокувати</button>
                </div>
              </div>
            </div>
          )}

          {showPauseConfirm && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ padding: '24px', background: 'var(--bg-panel)', border: '1px solid var(--accent-warning)', borderRadius: '12px', width: '400px', maxWidth: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'var(--accent-warning)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={18} /> Поставити на паузу
                </h3>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>Вкажіть обов'язкову причину паузи:</label>
                <input 
                  autoFocus
                  value={pauseReason} 
                  onChange={e => setPauseReason(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', marginBottom: '16px' }}
                  placeholder="Причина..."
                />
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>Вкажіть дату закінчення паузи (наступний продзвон):</label>
                <input 
                  type="date"
                  value={pauseEndDate} 
                  onChange={e => setPauseEndDate(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', marginBottom: '20px' }}
                />
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: 'var(--text-secondary)' }}>Дата та час наступного дзвінка:</label>
                <input 
                  type="datetime-local"
                  value={pauseActivityDate} 
                  onChange={e => setPauseActivityDate(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', marginBottom: '16px' }}
                />
                
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: 'var(--text-secondary)' }}>Коментар до дзвінка:</label>
                <input 
                  type="text"
                  value={pauseActivityComment} 
                  onChange={e => setPauseActivityComment(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', marginBottom: '20px' }}
                />

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px' }}>
                  <button onClick={() => { setShowPauseConfirm(false); setPauseReason(''); setPauseEndDate(''); setPauseActivityDate(''); setPauseActivityComment('Дзвінок після паузи'); }} style={{ padding: '8px 20px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 600 }}>Скасувати</button>
                  <button disabled={!pauseReason.trim() || !pauseEndDate} onClick={() => { setShowPauseConfirm(false); handlePause(); }} style={{ padding: '8px 20px', background: 'var(--accent-warning)', color: 'white', border: 'none', borderRadius: '6px', cursor: (!pauseReason.trim() || !pauseEndDate) ? 'not-allowed' : 'pointer', opacity: (!pauseReason.trim() || !pauseEndDate) ? 0.5 : 1, fontWeight: 600 }}>Підтвердити</button>
                </div>
              </div>
            </div>
          )}

          {showCancelConfirm && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ padding: '24px', background: 'var(--bg-panel)', border: '1px solid var(--danger-color)', borderRadius: '12px', width: '400px', maxWidth: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'var(--danger-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={18} /> Скасування замовлення
                </h3>
                <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: 'var(--text-primary)' }}>Ви впевнені, що хочете <strong>повністю скасувати</strong> це замовлення? Цю дію неможливо відмінити!</p>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowCancelConfirm(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500 }}>Ні, повернутися</button>
                  <button onClick={() => { setShowCancelConfirm(false); handleAction('CANCELLED'); }} style={{ padding: '8px 16px', background: 'var(--danger-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>Так, скасувати</button>
                </div>
              </div>
            </div>
          )}

          {showDeleteConfirm && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ padding: '24px', background: 'var(--bg-panel)', border: '1px solid var(--danger-color)', borderRadius: '12px', width: '400px', maxWidth: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'var(--danger-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={18} /> Видалення замовлення
                </h3>
                <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: 'var(--text-primary)' }}>Ви впевнені, що хочете <strong>назавжди видалити</strong> це замовлення з бази даних? Цю дію неможливо відмінити!</p>
                <input 
                  type="password" 
                  placeholder="Введіть 6-значний ПІН-код"
                  value={deletePin}
                  onChange={e => setDeletePin(e.target.value)}
                  style={{ width: '100%', marginBottom: '20px', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                />
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => { setShowDeleteConfirm(false); setDeletePin(''); }} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500 }}>Ні, повернутися</button>
                  <button onClick={() => { 
                    if (deletePin !== '789078') { alert('Невірний ПІН-код'); return; }
                    setShowDeleteConfirm(false); setDeletePin(''); handleDelete(); 
                  }} style={{ padding: '8px 16px', background: 'var(--danger-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>Так, видалити</button>
                </div>
              </div>
            </div>
          )}

          
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


      {showCreateTask && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-panel)', padding: '24px', borderRadius: 'var(--radius-lg)', width: '400px', maxWidth: '90%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: 0 }}>Нова комунікація/задача</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select value={newTaskMacroStage} onChange={e => setNewTaskMacroStage(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', flex: 1 }}>
                {Object.entries(TASK_STAGE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <select value={newTaskType} onChange={e => setNewTaskType(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)' }}>
                <option value="CALL">Дзвінок</option>
                <option value="SMS">SMS</option>
                <option value="EMAIL">Email</option>
                <option value="MEETING">Зустріч</option>
                <option value="INTERNAL_NOTE">Внутрішня задача</option>
              </select>
            </div>
            <input list="activity-titles" type="text" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder="Короткий заголовок" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)' }} />
            <datalist id="activity-titles">
              <option value="Планування заміру" />
              <option value="Дзвінок клієнту" />
              <option value="Узгодження креслень" />
              <option value="Узгодження дати монтажу" />
              <option value="Повідомлення про готовність" />
            </datalist>
            <input type="datetime-local" value={newTaskDate} onChange={e => setNewTaskDate(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)' }} />
            <textarea value={newTaskComment} onChange={e => setNewTaskComment(e.target.value)} rows={3} placeholder="Коментар..." style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', resize: 'none' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setShowCreateTask(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer' }}>Скасувати</button>
              <button onClick={handleCreateTask} style={{ padding: '8px 16px', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Зберегти</button>
            </div>
          </div>
        </div>
      )}

        </div>
      </div>
      
      {/* Права колонка */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto', paddingRight: '8px' }}>
      
      
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

      {activeTab === 'Інформація' && (
        <div style={{ display: 'flex', gap: '24px', flexDirection: 'column' }}>
          <div style={{ padding: 'var(--space-16)', background: 'var(--bg-panel)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Загальна інформація</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '8px', fontSize: '14px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Клієнт:</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{order.order_contacts?.[0]?.full_name || '—'}</span>
              <span style={{ color: 'var(--text-secondary)' }}>Телефон:</span>
              <span style={{ color: 'var(--text-primary)' }}>{order.order_contacts?.[0]?.phone || '—'}</span>
              <span style={{ color: 'var(--text-secondary)' }}>Адреса:</span>
              <span style={{ color: 'var(--text-primary)' }}>{order.order_addresses?.[0]?.city || '—'}, {order.order_addresses?.[0]?.street || '—'} {order.order_addresses?.[0]?.building || ''}</span>
              <span style={{ color: 'var(--text-secondary)' }}>Філія:</span>
              <span style={{ color: 'var(--text-primary)' }}>{order.branches?.name || '—'}</span>
              <div style={{ gridColumn: '1 / -1', height: '8px' }}></div>
              <span style={{ color: 'var(--text-secondary)' }}>Готовність по базі:</span>
              <span style={{ color: 'var(--text-primary)' }}>{order.base_readiness_date ? format(new Date(order.base_readiness_date), 'dd.MM.yyyy') : '—'}</span>
              <span style={{ color: 'var(--text-secondary)' }}>Оплата:</span>
              <span style={{ color: 'var(--text-primary)' }}>{order.payment_percent ? order.payment_percent + '%' : '—'}</span>
              <span style={{ color: 'var(--text-secondary)' }}>Розрахункова готовність:</span>
              <span style={{ color: 'var(--text-primary)' }}>{order.calculated_readiness_date ? format(new Date(order.calculated_readiness_date), 'dd.MM.yyyy') : '—'}</span>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Дата прозвону:</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{order.planned_call_date ? format(new Date(order.planned_call_date), 'dd.MM.yyyy, HH:mm:ss') : '—'}</span>
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
                        Створено: {format(new Date(t.created_at), 'd MMM HH:mm', { locale: uk })} {t.creator?.full_name && `(${t.creator.full_name})`}
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

      {activeTab === 'Специфікація' && (
        <div style={{ padding: 'var(--space-16)', background: 'var(--bg-panel)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Виріб</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '8px', fontSize: '14px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Матеріал:</span>
            <span style={{ color: 'var(--text-primary)' }}>{spec.material_type || '—'}</span>
            <span style={{ color: 'var(--text-secondary)' }}>Орієнтовна площа:</span>
            <span style={{ color: 'var(--text-primary)' }}>{spec.area_sqm ? `${spec.area_sqm} м²` : '—'}</span>
          </div>
        </div>
      )}

      {activeTab === 'Фінанси' && (
        <div style={{ padding: 'var(--space-16)', background: 'var(--bg-panel)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Оплата</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '8px', fontSize: '14px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Сума (орієнтовна):</span>
            <span style={{ color: 'var(--text-primary)' }}>{spec.total_amount ? `${spec.total_amount} ₴` : '—'}</span>
            <span style={{ color: 'var(--text-secondary)' }}>% оплати:</span>
            <span style={{ color: 'var(--text-primary)' }}>{order.payment_percent || 0}%</span>
            <span style={{ color: 'var(--text-secondary)' }}>Кредит:</span>
            <span style={{ color: 'var(--text-primary)' }}>{order.is_credit ? 'Так' : 'Ні'}</span>
            <span style={{ color: 'var(--text-secondary)' }}>Джерело оплати:</span>
            <span style={{ color: 'var(--text-primary)' }}>{order.payment_source || '—'}</span>
          </div>
        </div>
      )}

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
                      border: `2px solid ${isLatest ? 'var(--accent-color)' : 'var(--border-color)'}`,
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

      </div>
    </div>
  );
}
