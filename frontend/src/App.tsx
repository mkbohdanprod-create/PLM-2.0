import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import type { Session } from '@supabase/supabase-js';
import { Layers, UserCircle, Settings, Moon, Sun, Menu, ChevronDown, Check, Save, Download, Search } from 'lucide-react';

import { Login } from './Login';
import { OrdersList } from './OrdersList';
import { OrderCard } from './OrderCard';
import { CreateOrderForm } from './CreateOrderForm';
import { LogisticsDesktop } from './LogisticsDesktop';
import { GanttChartPrototype } from './GanttChartPrototype';
import { RolesSettings } from './RolesSettings';
import { EmployeesDirectory } from './EmployeesDirectory';

import { SettingsDrawer } from './SettingsDrawer';
import { WorkerSchedulesPanel } from './WorkerSchedulesPanel';
import { MeasurementManagerDesktop } from './components/measurer/MeasurementManagerDesktop';
import { EngineeringBoard } from './components/engineering/EngineeringBoard';
import { ProductionBoard } from './components/production/ProductionBoard';
import { OrderMonitoringBoard } from './components/monitoring/OrderMonitoringBoard';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { StoneRadio } from './components/StoneRadio';
import { STATUS_LABELS } from './utils/orderStages';

const MODULES = [
  'Планування замірів',
  'Пауза (Відкладені)',
  'Заміри (AppSheet)',
  'Конструктив',
  'Виробництво (MES)',
  'Доставка та Монтажі',
  'Моніторинг замовлень',
  'Діаграма Ганта',
  'Графіки роботи',
  'ШІ Аналітика'
];

function App() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string[]>(() => {
    try { const s = sessionStorage.getItem('app_statusFilter'); if (s) return JSON.parse(s); } catch(e){}
    return ['DEFAULT'];
  });
  const [sortMode, setSortMode] = useState<string>(() => sessionStorage.getItem('app_sortMode') || 'planned_call');
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [headerSearch, setHeaderSearch] = useState('');
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [subStatusFilter, setSubStatusFilter] = useState<string[]>(['ALL']);
  const [isSubStatusDropdownOpen, setIsSubStatusDropdownOpen] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [regions, setRegions] = useState<any[]>([]);
  
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [activeModule, setActiveModule] = useState<string>(() => sessionStorage.getItem('app_activeModule') || 'Планування замірів');
  const [activeDragOrder, setActiveDragOrder] = useState<any>(null);
  const [pendingDrop, setPendingDrop] = useState<{orderId: string, actualMeasurerId: string | null, dateStr: string, defaultTime?: string} | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [plannerSettings, setPlannerSettings] = useState(() => {
    const saved = localStorage.getItem('plannerSettings');
    return saved ? JSON.parse(saved) : { efficiencyCoef: 80, defaultTravelMins: 20, defaultDurationMins: 60 };
  });

  const [globalRegion, setGlobalRegion] = useState<string[]>(() => {
    try { const r = sessionStorage.getItem('app_globalRegion'); if (r) return JSON.parse(r); } catch(e){}
    return ['Всі'];
  });
  const [isRegionDropdownOpen, setIsRegionDropdownOpen] = useState(false);
  const [globalStatus, setGlobalStatus] = useState<string>(() => sessionStorage.getItem('app_globalStatus') || 'Актуальні');
  const [globalType, setGlobalType] = useState<string>(() => sessionStorage.getItem('app_globalType') || 'Всі');

  useEffect(() => {
    sessionStorage.setItem('app_statusFilter', JSON.stringify(statusFilter));
  }, [statusFilter]);

  useEffect(() => {
    sessionStorage.setItem('app_globalRegion', JSON.stringify(globalRegion));
  }, [globalRegion]);

  useEffect(() => {
    sessionStorage.setItem('app_sortMode', sortMode);
  }, [sortMode]);

  useEffect(() => {
    sessionStorage.setItem('app_activeModule', activeModule);
  }, [activeModule]);

  useEffect(() => {
    sessionStorage.setItem('app_globalStatus', globalStatus);
    sessionStorage.setItem('app_globalType', globalType);
  }, [globalStatus, globalType]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session);
        fetchProfile(session?.user?.id);
        setIsInitializing(false);
      } else {
        // Auto-login as superadmin if no session exists
        supabase.auth.signInWithPassword({
          email: 'admin@test.com',
          password: 'password123'
        }).then(({ data, error }) => {
          if (error) console.error('Auto-login failed:', error);
          if (data.session) {
            setSession(data.session);
            fetchProfile(data.session.user.id);
          }
          setIsInitializing(false);
        });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      fetchProfile(session?.user?.id);
      setSelectedOrderId(null);
      setShowCreateForm(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const fetchRegions = async () => {
      try {
        const { data } = await supabase.from('regions').select('name').order('name');
        if (data) setRegions(data);
      } catch (e) {
        console.error(e);
      }
    };
    if (session) {
      fetchRegions();
    }
  }, [session]);



  useEffect(() => {
    // Real-time subscriptions
    const channel = supabase.channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        (_payload) => {
          handleRefresh();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'measurement_tasks',
        },
        (_payload) => {
          handleRefresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchProfile = async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    setProfile(data);
  };

  if (isInitializing) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-main)' }}>
        <div style={{ fontSize: '18px', color: 'var(--text-primary)' }}>Виконується автоматичний вхід...</div>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  if (profile && (!profile.is_active || profile.role_code === 'NEW_USER')) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>
        <div className="panel" style={{ padding: '32px', textAlign: 'center', maxWidth: '400px', width: '100%' }}>
          <h2 style={{ marginBottom: '16px', color: 'var(--text-primary)' }}>Очікування підтвердження</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.5' }}>
            Ваш акаунт ({profile.full_name}) успішно створено, але він ще не активований. 
            Будь ласка, зачекайте, поки керівник призначить вам роль та надасть доступ.
          </p>
          <button className="secondary" onClick={() => supabase.auth.signOut()}>Вийти</button>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };



  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const saveDefaultFilters = async () => {
    if (!profile) return;
    const filters = {
      globalRegion,
      globalStatus,
      globalType
    };
    try {
      const { error } = await supabase.rpc('update_default_filters', { p_id: profile.id, p_filters: filters });
      if (error) throw error;
      alert('Поточні фільтри збережено як стандартні!');
      fetchProfile(session?.user.id);
    } catch (err: any) {
      alert('Помилка збереження фільтрів: ' + err.message);
    }
  };

  const loadDefaultFilters = () => {
    if (profile?.default_filters) {
      const f = profile.default_filters;
      if (f.globalRegion) setGlobalRegion(f.globalRegion);
      if (f.globalStatus) setGlobalStatus(f.globalStatus);
      if (f.globalType) setGlobalType(f.globalType);
    } else {
      alert('У вас немає збережених стандартних фільтрів. Налаштуйте їх та натисніть "Зберегти".');
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    if (active.data.current) {
      setActiveDragOrder(active.data.current);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const dragData = activeDragOrder;
    setActiveDragOrder(null);
    const { active, over } = event;
    if (!over) return;
    
    // Get orderId from data depending on drag source type
    let orderId = active.id as string; // fallback
    
    // Try to get from activeDragOrder first (reliable across unmounts), then active.data
    const data = dragData || active.data.current;
    
    if (data?.type === 'calendar_task') {
      orderId = data.order_id;
    } else if (data?.type === 'order_list_item') {
      orderId = data.id;
    }
    
    const dropId = over.id as string;
    
    if (dropId === 'orders_list') {
      const { error } = await supabase.rpc('unassign_measurement', { p_order_id: orderId });
      if (!error) handleRefresh();
      else alert('Помилка при скасуванні: ' + error.message);
      return;
    }

    const parts = dropId.split('_');
    const measurerId = parts[0];
    const dateStr = parts[1];
    const timeSlot = parts.length > 2 ? parts[2] : null;

    let actualMeasurerId: string | null = measurerId;
    if (measurerId === 'unassigned') {
      actualMeasurerId = null;
    }

    if (dateStr) {
      let dynamicDurationMins = plannerSettings?.defaultDurationMins || 120;
      let isCustomTime = false;
      try {
        const [{ data: specData }, { data: rulesData }, { data: orderData }] = await Promise.all([
          supabase.from('order_specifications').select('area_sqm').eq('order_id', orderId).maybeSingle(),
          supabase.from('settings').select('value').eq('key', 'measurement_duration_rules').maybeSingle(),
          supabase.from('orders').select('measurement_duration_mins').eq('id', orderId).maybeSingle()
        ]);
        
        if (orderData?.measurement_duration_mins) {
          dynamicDurationMins = orderData.measurement_duration_mins;
        } else if (rulesData?.value) {
          const rules = JSON.parse(rulesData.value);
          const area = specData?.area_sqm || 0;
          const matchedRule = rules.find((r: any) => area >= r.min_sqm && area <= r.max_sqm);
          if (matchedRule) {
            dynamicDurationMins = matchedRule.duration_mins;
            isCustomTime = matchedRule.is_custom || false;
            if (isCustomTime || dynamicDurationMins <= 0) dynamicDurationMins = plannerSettings?.defaultDurationMins || 120; 
          }
        }
      } catch (e) {
        console.error('Error fetching duration rules:', e);
      }

      if (timeSlot) {
        let p_start = '10:00:00';
        let p_end = '12:00:00';
        try {
          const tParts = timeSlot.split('-');
          if (tParts.length === 2) {
            p_start = tParts[0].trim() + (tParts[0].trim().length === 5 ? ':00' : '');
            p_end = tParts[1].trim() + (tParts[1].trim().length === 5 ? ':00' : '');
          } else if (timeSlot.includes(':')) {
            p_start = timeSlot + ':00';
            const [h, m] = timeSlot.split(':').map(Number);
            const totalMins = h * 60 + (m || 0) + dynamicDurationMins;
            const eh = Math.floor(totalMins / 60);
            const em = totalMins % 60;
            p_end = `${eh.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')}:00`;
          }
        } catch (e) {}
        await processAssignment(orderId, actualMeasurerId, dateStr, p_start, p_end);
      } else {
        // Compute default string for modal
        let p_start = '10:00';
        const totalMins = 10 * 60 + dynamicDurationMins;
        const eh = Math.floor(totalMins / 60);
        const em = totalMins % 60;
        let p_end = `${eh.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')}`;
        
        setPendingDrop({ orderId, actualMeasurerId, dateStr, defaultTime: `${p_start}-${p_end}` });
      }
    }
  };

  const recalculateDayTravelForMeasurer = async (measurerId: string, dateStr: string) => {
    try {
      const { data: dayTasks } = await supabase
        .from('measurement_tasks')
        .select('id, start_time, estimated_travel_time_mins, orders!inner(id, is_hidden, order_addresses(lat, lng), branches(regions(name)))')
        .eq('measurer_id', measurerId)
        .eq('scheduled_date', dateStr)
        .in('outcome', ['SCHEDULED', 'IN_PROGRESS'])
        .eq('orders.is_hidden', false)
        .order('start_time', { ascending: true });

      if (!dayTasks || dayTasks.length === 0) return;

      let prevCoords: any = null;
      let regionName = dayTasks[0].orders?.branches?.regions?.name;
      
      const REGION_BASES: Record<string, {lat: number, lng: number}> = {
        'Київ': { lat: 50.4501, lng: 30.5234 },
        'Центр': { lat: 50.4501, lng: 30.5234 },
        'Захід': { lat: 49.8397, lng: 24.0297 },
        'Варшава': { lat: 52.2297, lng: 21.0122 },
        'Південь': { lat: 46.4825, lng: 30.7233 }
      };

      for (const task of dayTasks) {
        const destCoords = task.orders?.order_addresses?.[0];
        if (!destCoords || !destCoords.lat || !destCoords.lng) {
          prevCoords = destCoords;
          continue;
        }

        let originLat = 50.4501;
        let originLng = 30.5234;

        if (prevCoords && prevCoords.lat && prevCoords.lng) {
          originLat = parseFloat(prevCoords.lat);
          originLng = parseFloat(prevCoords.lng);
        } else {
          regionName = task.orders?.branches?.regions?.name || regionName;
          if (regionName && REGION_BASES[regionName]) {
            originLat = REGION_BASES[regionName].lat;
            originLng = REGION_BASES[regionName].lng;
          }
        }

        const coordsStr = `${originLng},${originLat};${destCoords.lng},${destCoords.lat}`;
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=false`);
        const json = await res.json();
        
        if (json.routes && json.routes.length > 0) {
          const newTravelMins = Math.round(json.routes[0].duration / 60);
          if (newTravelMins !== task.estimated_travel_time_mins) {
            await supabase
              .from('measurement_tasks')
              .update({ estimated_travel_time_mins: newTravelMins })
              .eq('id', task.id);
          }
        }

        prevCoords = destCoords;
      }
    } catch (err) {
      console.error('Failed to recalculate day travel:', err);
    }
  };

  const processAssignment = async (orderId: string, actualMeasurerId: string | null, dateStr: string, p_start: string, p_end: string) => {
    let oldMeasurerId: string | null = null;
    let oldDateStr: string | null = null;
    
    try {
      const { data: oldTaskData } = await supabase
        .from('measurement_tasks')
        .select('measurer_id, scheduled_date')
        .eq('order_id', orderId)
        .maybeSingle();
        
      if (oldTaskData) {
        oldMeasurerId = oldTaskData.measurer_id;
        oldDateStr = oldTaskData.scheduled_date;
      }
    } catch(e) {}

    let estimated_travel_time_mins = 20; // fallback
    
    try {
      const { data: orderData } = await supabase
        .from('orders')
        .select('order_addresses(lat, lng), branches(regions(name))')
        .eq('id', orderId)
        .maybeSingle();

      const destCoords = orderData?.order_addresses?.[0];

      if (destCoords && destCoords.lat && destCoords.lng) {
        let prevCoords = null;

        if (actualMeasurerId) {
          const { data: prevTasks } = await supabase
            .from('measurement_tasks')
            .select('orders!inner(is_hidden, order_addresses(lat, lng))')
            .eq('measurer_id', actualMeasurerId)
            .eq('scheduled_date', dateStr)
            .lt('start_time', p_start)
            .in('outcome', ['SCHEDULED', 'IN_PROGRESS'])
            .eq('orders.is_hidden', false)
            .order('start_time', { ascending: false })
            .limit(1);

          if (prevTasks && prevTasks.length > 0) {
            prevCoords = prevTasks[0].orders?.order_addresses?.[0];
          }
        }

        let originLat = 50.4501; // DEFAULT_CENTER Kyiv (Base)
        let originLng = 30.5234;

        if (prevCoords && prevCoords.lat && prevCoords.lng) {
          originLat = parseFloat(prevCoords.lat);
          originLng = parseFloat(prevCoords.lng);
        } else {
          // If first order, use regional base
          const regionName = orderData?.branches?.regions?.name;
          const REGION_BASES: Record<string, {lat: number, lng: number}> = {
            'Київ': { lat: 50.4501, lng: 30.5234 },
            'Центр': { lat: 50.4501, lng: 30.5234 },
            'Захід': { lat: 49.8397, lng: 24.0297 },
            'Варшава': { lat: 52.2297, lng: 21.0122 },
            'Південь': { lat: 46.4825, lng: 30.7233 }
          };
          if (regionName && REGION_BASES[regionName]) {
            originLat = REGION_BASES[regionName].lat;
            originLng = REGION_BASES[regionName].lng;
          }
        }

        const coordsStr = `${originLng},${originLat};${destCoords.lng},${destCoords.lat}`;
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=false`);
        const json = await res.json();
        if (json.routes && json.routes.length > 0) {
          estimated_travel_time_mins = Math.round(json.routes[0].duration / 60);
        }
      }
    } catch (err) {
      console.error('Failed to calculate travel time:', err);
    }

    // Optimistic or real RPC call
    const { error } = await supabase.rpc('assign_measurement', {
      p_order_id: orderId,
      p_measurer_id: actualMeasurerId,
      p_date: dateStr,
      p_start_time: p_start, 
      p_end_time: p_end,
      p_estimated_travel_time: estimated_travel_time_mins
    });
    if (!error) {
      handleRefresh();

      const promises = [];
      if (oldMeasurerId && oldMeasurerId !== 'unassigned' && oldDateStr) {
        promises.push(recalculateDayTravelForMeasurer(oldMeasurerId, oldDateStr));
      }
      if (actualMeasurerId && actualMeasurerId !== 'unassigned') {
        promises.push(recalculateDayTravelForMeasurer(actualMeasurerId, dateStr));
      }
      if (promises.length > 0) {
        Promise.all(promises).then(() => handleRefresh());
      }
    } else {
      alert('Помилка при призначенні: ' + error.message);
    }
  };

  return (
    <div className="dashboard-layout">
      {/* Navigation Drawer Overlay */}
      {isNavOpen && (
        <div 
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9998 }}
          onClick={() => setIsNavOpen(false)}
        ></div>
      )}

      {/* Navigation Drawer */}
      <div style={{
        position: 'fixed', top: 0, left: isNavOpen ? 0 : '-300px', bottom: 0, width: '280px',
        background: 'var(--bg-panel)', boxShadow: '4px 0 15px rgba(0,0,0,0.1)', zIndex: 9999,
        transition: 'left 0.3s ease', display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Layers size={24} color="var(--accent-color)" />
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Модулі системи</h2>
        </div>
        <div style={{ flex: 1, padding: '16px 0', overflowY: 'auto' }}>
          {MODULES.map(mod => {
            let badge = null;
            if (mod === 'Планування замірів') {
              badge = { text: 'Бета версія', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' };
            } else if (mod === 'Пауза (Відкладені)' || mod === 'Заміри (AppSheet)' || mod === 'Діаграма Ганта' || mod === 'Графіки роботи') {
              badge = { text: 'В розробці', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' };
            }

            const isImplemented = mod === 'Планування замірів';

            return (
              <div 
                key={mod}
                onClick={() => { 
                  setActiveModule(mod); setIsNavOpen(false); 
                }}
                style={{
                  padding: '12px 24px',
                  cursor: 'pointer',
                  background: activeModule === mod ? 'var(--bg-secondary)' : 'transparent',
                  borderLeft: `4px solid ${activeModule === mod ? 'var(--accent-color)' : 'transparent'}`,
                  color: activeModule === mod ? 'var(--accent-color)' : 'var(--text-primary)',
                  fontWeight: activeModule === mod ? 600 : 500,
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <span>{mod}</span>
                {badge && (
                  <span style={{
                    fontSize: '10px',
                    padding: '3px 8px',
                    borderRadius: '12px',
                    backgroundColor: badge.bg,
                    color: badge.color,
                    fontWeight: 600,
                    whiteSpace: 'nowrap'
                  }}>
                    {badge.text}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <header className="app-header">
        <div 
          className="app-brand" 
          onClick={() => setIsNavOpen(true)}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)' }}>
             <Menu size={20} color="white" />
          </div>
          <div className="brand-icon">
            <Layers size={18} color="white" />
          </div>
          PLM Dispatcher <span style={{ opacity: 0.7, fontSize: '14px', marginLeft: '8px', fontWeight: 400 }}>| {activeModule}</span>
        </div>
        <div style={{ flex: 1, paddingLeft: '32px' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
            <input 
              type="text" 
              placeholder="Швидкий пошук замовлення..."
              value={headerSearch}
              onChange={e => setHeaderSearch(e.target.value)}
              onKeyDown={e => {
                  if (e.key === 'Enter' && headerSearch.trim().length >= 2) {
                      setGlobalSearchQuery(headerSearch);
                      setActiveModule('Моніторинг замовлень');
                      setHeaderSearch('');
                  }
              }}
              style={{ width: '100%', padding: '6px 12px 6px 32px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.2)', color: 'white', fontSize: '13px', outline: 'none' }}
            />
            <Search size={14} color="rgba(255,255,255,0.6)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Global Filters */}
          {(activeModule === 'Планування замірів' || activeModule === 'Заміри (AppSheet)') && (
            <div style={{ display: 'flex', gap: '12px', marginRight: '16px', borderRight: '1px solid rgba(255,255,255,0.2)', paddingRight: '20px' }}>
              <div style={{ position: 'relative' }}>
                <div 
                  onClick={() => setIsRegionDropdownOpen(!isRegionDropdownOpen)}
                  style={{ 
                    background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', 
                    borderRadius: '4px', padding: '4px 12px', fontSize: '13px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: '130px'
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {globalRegion.includes('Всі') ? 'Регіон: Всі' : globalRegion.join(', ')}
                  </span>
                  <span style={{ marginLeft: '8px', fontSize: '10px' }}>▼</span>
                </div>
                
                {isRegionDropdownOpen && (
                  <div style={{ position: 'absolute', top: '100%', right: '0', background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '8px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '150px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {[{id: 'all', name: 'Всі'}, ...regions].map(r => (
                      <label key={r.id || r.name} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: 'var(--text-primary)' }}>
                        <input 
                          type="checkbox" 
                          checked={r.name === 'Всі' ? globalRegion.includes('Всі') : (globalRegion.includes(r.name) && !globalRegion.includes('Всі'))} 
                          onChange={(e) => {
                            if (r.name === 'Всі') {
                              setGlobalRegion(['Всі']);
                              return;
                            }
                            let next = globalRegion.filter(x => x !== 'Всі');
                            if (e.target.checked) {
                              if (!next.includes(r.name)) next.push(r.name);
                            } else {
                              next = next.filter(x => x !== r.name);
                            }
                            if (next.length === 0) next = ['Всі'];
                            setGlobalRegion(Array.from(new Set(next)));
                          }}
                          style={{ marginRight: '12px', width: '16px', height: '16px' }}
                        />
                        <span style={{ fontSize: '13px' }}>{r.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          {(activeModule === 'Планування замірів' || activeModule === 'Заміри (AppSheet)') && (
            <>
              <select 
                value={globalStatus} 
                onChange={e => setGlobalStatus(e.target.value)}
                style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '4px 8px', fontSize: '13px', marginRight: '8px' }}
              >
                <option value="Актуальні" style={{color: 'black'}}>Актуальні</option>
                <option value="На паузі" style={{color: 'black'}}>На паузі</option>
              </select>
              <select 
                value={globalType} 
                onChange={e => setGlobalType(e.target.value)}
                style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '4px 8px', fontSize: '13px' }}
              >
                <option value="Всі" style={{color: 'black'}}>Тип: Всі</option>
                <option value="По кресленню" style={{color: 'black'}}>По кресленню</option>
              </select>
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '16px', background: 'var(--bg-panel)', padding: '4px 12px', borderRadius: '20px', border: '1px solid var(--border-color)', marginLeft: '16px' }}>
            <UserCircle size={16} style={{ color: 'var(--accent-color)' }} />
            <span style={{ fontSize: '13px', fontWeight: 600 }}>{session.user.email}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '10px' }}>{profile?.role_code || 'GUEST'}</span>
          </div>
          <button  
            onClick={toggleTheme} 
            style={{ background: 'transparent', border: 'none', color: 'var(--header-text)', padding: '4px', cursor: 'pointer' }}
          >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            style={{ background: 'transparent', border: 'none', color: 'var(--header-text)', padding: '4px', cursor: 'pointer' }}
          >
            <Settings size={20} />
          </button>
          <button 
            onClick={handleLogout}
            style={{ background: 'transparent', border: 'none', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--danger-color)' }}>Вийти</span>
          </button>
        </div>
      </header>

      {activeModule === 'Конструктив' ? (
        <EngineeringBoard profile={profile} globalRegion={globalRegion} globalSearchQuery={globalSearchQuery} />
      ) : activeModule === 'Виробництво (MES)' ? (
        <ProductionBoard profile={profile} globalRegion={globalRegion} globalSearchQuery={globalSearchQuery} />
      ) : activeModule === 'Моніторинг замовлень' ? (
        <OrderMonitoringBoard globalRegion={globalRegion} globalSearchQuery={globalSearchQuery} />
      ) : (
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="main-layout">
        <div className="panel sidebar">
          <div style={{ padding: '12px 16px 0 16px', position: 'relative' }}>
            <div 
              onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {statusFilter.includes('DEFAULT') ? 'За замовчуванням' : statusFilter.includes('ALL') ? 'Абсолютно всі етапи' : statusFilter.map(s => { const labels: any = {'MEASUREMENT_SCHEDULING': 'Планування Замірів', 'MEASUREMENT': 'Замір', 'ENGINEERING': 'Конструктив', 'MANUFACTURING': 'Виробництво', 'DELIVERY_SCHEDULING': 'Планування Доставок', 'INSTALLATION_SCHEDULING': 'Планування Монтажів', 'DELIVERY': 'Доставка', 'INSTALLATION': 'Монтаж', 'PAUSED': 'Пауза', 'CANCELLED': 'Скасовано'}; return labels[s] || s; }).join(', ')}
              </span>
              <ChevronDown size={14} style={{ flexShrink: 0, marginLeft: '8px' }} />
            </div>
            
            {isStatusDropdownOpen && (
              <div style={{ position: 'absolute', top: '100%', left: '16px', right: '16px', marginTop: '4px', background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: '250px', overflowY: 'auto', padding: '8px 0' }}>
                                {[
                  { id: 'DEFAULT', label: 'За замовчуванням (для модуля)' },
                  { id: 'ALL', label: 'Абсолютно всі етапи' },
                  { id: 'MEASUREMENT_SCHEDULING', label: 'Планування Замірів' },
                  { id: 'MEASUREMENT', label: 'Замір' },
                  { id: 'ENGINEERING', label: 'Конструктив' },
                  { id: 'MANUFACTURING', label: 'Виробництво' },
                  { id: 'DELIVERY_SCHEDULING', label: 'Планування Доставок' },
                  { id: 'INSTALLATION_SCHEDULING', label: 'Планування Монтажів' },
                  { id: 'DELIVERY', label: 'Доставка' },
                  { id: 'INSTALLATION', label: 'Монтаж' },
                  { id: 'PAUSED', label: 'Пауза' },
                  { id: 'CANCELLED', label: 'Скасовано' }
                ].map(opt => {
                  const isChecked = statusFilter.includes(opt.id);
                  return (
                    <div 
                      key={opt.id}
                      onClick={() => {
                        if (opt.id === 'DEFAULT') {
                          setStatusFilter(['DEFAULT']);
                        } else if (opt.id === 'ALL') {
                          setStatusFilter(['ALL']);
                        } else {
                          let next = statusFilter.filter(s => s !== 'DEFAULT' && s !== 'ALL');
                          if (next.includes(opt.id)) next = next.filter(s => s !== opt.id);
                          else next.push(opt.id);
                          if (next.length === 0) next = ['DEFAULT'];
                          setStatusFilter(next);
                        }
                      }}
                      style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)', background: isChecked ? 'rgba(59, 130, 246, 0.05)' : 'transparent' }}
                    >
                      <div style={{ width: '16px', height: '16px', border: `1px solid ${isChecked ? 'var(--accent-color)' : 'var(--border-color)'}`, borderRadius: '4px', background: isChecked ? 'var(--accent-color)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isChecked && <Check size={12} color="white" />}
                      </div>
                      {opt.label}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sub-status Dropdown */}
          <div style={{ padding: '8px 16px 0 16px', position: 'relative' }}>
            <div 
              onClick={() => setIsSubStatusDropdownOpen(!isSubStatusDropdownOpen)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {subStatusFilter.includes('ALL') ? 'Всі підстатуси' : subStatusFilter.map(s => STATUS_LABELS[s] || s).join(', ')}
              </span>
              <ChevronDown size={14} style={{ flexShrink: 0, marginLeft: '8px' }} />
            </div>
            
            {isSubStatusDropdownOpen && (
              <div style={{ position: 'absolute', top: '100%', left: '16px', right: '16px', marginTop: '4px', background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: '250px', overflowY: 'auto', padding: '8px 0' }}>
                <div 
                  onClick={() => setSubStatusFilter(['ALL'])}
                  style={{ padding: '8px 16px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: subStatusFilter.includes('ALL') ? 'var(--bg-hover)' : 'transparent', color: subStatusFilter.includes('ALL') ? 'var(--accent)' : 'var(--text-primary)' }}
                >
                  Всі підстатуси
                  {subStatusFilter.includes('ALL') && <Check size={14} />}
                </div>
                {Object.entries(STATUS_LABELS).map(([key, label]) => {
                  const isChecked = subStatusFilter.includes(key);
                  return (
                    <div 
                      key={key}
                      onClick={() => {
                        let next = subStatusFilter.filter(s => s !== 'ALL');
                        if (next.includes(key)) next = next.filter(s => s !== key);
                        else next.push(key);
                        if (next.length === 0) next = ['ALL'];
                        setSubStatusFilter(next);
                      }}
                      style={{ padding: '8px 16px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: isChecked ? 'var(--bg-hover)' : 'transparent', color: isChecked ? 'var(--accent)' : 'var(--text-primary)' }}
                    >
                      {label}
                      {isChecked && <Check size={14} />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ padding: '12px 16px' }}>
            <select 
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer', marginBottom: '8px' }}
            >
              <option value="newest">Спочатку нові (за датою створення)</option>
              <option value="oldest">Спочатку старі (за датою створення)</option>
              <option value="status">За статусом</option>
              <option value="planned_call">За датою продзвону (найближчі)</option>
            </select>
            <input 
              type="text" 
              placeholder="Пошук замовлення..." 
              value={globalSearchQuery}
              onChange={(e) => setGlobalSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} 
            />
          </div>
          <div style={{ padding: '0 16px 12px' }}>
            <button 
              className="primary-action"
              onClick={() => setShowCreateForm(true)}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', fontWeight: 600 }}
            >
              + Створити замовлення
            </button>
          </div>
          <OrdersList 
            refreshTrigger={refreshTrigger} 
            onSelectOrder={id => { setSelectedOrderId(id); setShowCreateForm(false); }} 
            activeModule={activeModule}
            profile={profile}
            selectedOrderId={selectedOrderId}
            statusFilter={statusFilter}
            subStatusFilter={subStatusFilter}
            sortMode={sortMode}
            globalRegion={globalRegion}
            globalStatus={globalStatus}
            globalType={globalType}
            globalSearchQuery={globalSearchQuery}
          />
        </div>

        <div className="panel" style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
          {showCreateForm ? (
            <CreateOrderForm 
              onSuccess={() => { setShowCreateForm(false); handleRefresh(); }} 
              onCancel={() => setShowCreateForm(false)} 
            />
          ) : activeModule === 'Діаграма Ганта' ? (
            <GanttChartPrototype />
          ) : activeModule === 'Графіки роботи' ? (
            <WorkerSchedulesPanel />
          ) : activeModule === 'Планування замірів' || activeModule === 'Пауза (Відкладені)' ? (
            <LogisticsDesktop 
              selectedOrderId={selectedOrderId} 
              profile={profile}
              onRefresh={handleRefresh}
              onSelectOrder={id => { setSelectedOrderId(id); setShowCreateForm(false); }}
              refreshTrigger={refreshTrigger}
              plannerSettings={plannerSettings}
              globalRegion={globalRegion}
              globalStatus={globalStatus}
              globalType={globalType}
              activeModule={activeModule}
            />
          ) : activeModule === 'Заміри (AppSheet)' ? (
            <MeasurementManagerDesktop globalRegion={globalRegion} />
          ) : selectedOrderId ? (
            <OrderCard 
              key={selectedOrderId} 
              orderId={selectedOrderId} 
              onStatusChanged={handleRefresh} 
              profile={profile}
            />
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '50px' }}>
              Виберіть замовлення зі списку зліва
            </div>
          )}
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
            cursor: 'grabbing',
            pointerEvents: 'none'
          }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              {activeDragOrder.order_number || activeDragOrder.orders?.external_id || 'Без номера'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginBottom: '4px' }}>
              Клієнт
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              {activeDragOrder.addressStr || (activeDragOrder.orders?.order_addresses?.[0] ? `${activeDragOrder.orders.order_addresses[0].street}, ${activeDragOrder.orders.order_addresses[0].building}` : 'Адреса не вказана')}
            </div>
          </div>
        ) : null}
      </DragOverlay>
      </DndContext>
      )}

      {/* Modal for setting time on drag and drop to week view */}
      {pendingDrop && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          background: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: 'var(--bg-panel)', padding: '24px', borderRadius: '8px', 
            boxShadow: 'var(--shadow-lg)', width: '300px'
          }}>
            <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Вкажіть час</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Дата: {pendingDrop.dateStr}</p>
            <input 
              id="pending-time-input"
              type="text" 
              defaultValue={pendingDrop.defaultTime || "10:00-12:00"}
              style={{
                width: '100%', padding: '8px', border: '1px solid var(--border-color)', 
                borderRadius: '4px', background: 'var(--bg-input)', color: 'var(--text-primary)', 
                marginTop: '12px', marginBottom: '20px'
              }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button 
                className="secondary-action" 
                onClick={() => setPendingDrop(null)}
                style={{ padding: '8px 16px', borderRadius: '4px', fontWeight: 600 }}
              >
                Скасувати
              </button>
              <button 
                className="primary-action" 
                onClick={() => {
                  const val = (document.getElementById('pending-time-input') as HTMLInputElement).value;
                  let p_start = '10:00:00';
                  let p_end = '12:00:00';
                  try {
                    const tParts = val.split('-');
                    if (tParts.length === 2) {
                      p_start = tParts[0].trim() + (tParts[0].trim().length === 5 ? ':00' : '');
                      p_end = tParts[1].trim() + (tParts[1].trim().length === 5 ? ':00' : '');
                    }
                  } catch (e) {}
                  setPendingDrop(null);
                  processAssignment(pendingDrop.orderId, pendingDrop.actualMeasurerId, pendingDrop.dateStr, p_start, p_end);
                }}
                style={{ padding: '8px 16px', borderRadius: '4px', fontWeight: 600 }}
              >
                Зберегти
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <SettingsDrawer 
          onClose={() => setShowSettings(false)}
          onSave={(settings) => {
            setPlannerSettings(settings);
            localStorage.setItem('plannerSettings', JSON.stringify(settings));
            setShowSettings(false);
            handleRefresh();
          }}
          plannerSettings={plannerSettings}
        />
      )}
      
      <StoneRadio />
    </div>
  );
}

export default App;
