import React, { useState, useEffect, useRef, Fragment } from 'react';
import { supabase } from './supabase';
import { ChevronLeft, ChevronRight, Car, Lock, Filter } from 'lucide-react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { isPaused } from './utils/orderStages';

// Helper for generating dates
const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const formatDate = (date: Date) => {
  return date.toISOString().split('T')[0];
};

const formatDayName = (date: Date) => {
  const days = ['НД', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
  return days[date.getDay()];
};

interface DeliveryDashboardProps {
  refreshTrigger: number;
  onSelectOrder?: (id: string) => void;
  selectedMapDate?: Date;
  onSelectMapDate?: (date: Date) => void;
  selectedOrderId?: string | null;
  drivers?: any[];
  filterMeasurerId?: string;
  filterStatus?: string;
  setFilterMeasurerId?: (id: string) => void;
  setFilterStatus?: (status: string) => void;
  plannerSettings?: any;
  activeModule?: string;
  globalRegion?: string[];
  globalStatus?: string;
  globalType?: string;
}

export function DeliveryDashboard({ activeModule, refreshTrigger, onSelectOrder, selectedMapDate = new Date(), onSelectMapDate, selectedOrderId, drivers = [], filterMeasurerId = 'ALL', filterStatus = 'ALL', setFilterMeasurerId, setFilterStatus, plannerSettings = {}, globalRegion = ['Всі'], globalStatus = 'Актуальні', globalType = 'Всі' }: DeliveryDashboardProps) {
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('week');
  const [schedules, setSchedules] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [startDate, setStartDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date());

  const HOURS = Array.from({ length: 13 }, (_, i) => {
    const h = i + 8;
    return `${h < 10 ? '0' + h : h}:00`;
  });

  // Week days array
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(startDate, i));
  
  // Month days array
  const firstDayOfMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const daysInMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate();
  const monthDays = Array.from({ length: daysInMonth }).map((_, i) => new Date(startDate.getFullYear(), startDate.getMonth(), i + 1));
  
  const monthName = startDate.toLocaleDateString('uk-UA', { month: 'long' });
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    
    const handleWheel = (e: WheelEvent) => {
      // If holding shift, the browser already scrolls horizontally
      if (e.deltaY !== 0 && !e.shiftKey) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  useEffect(() => {
    const handleJumpDate = (e: any) => {
      const dateStr = e.detail?.date;
      console.log('RECEIVED JUMP EVENT:', dateStr, 'current selectedDay:', selectedDay);
      if (dateStr) {
        const date = new Date(dateStr);
        console.log('formatDate(date) =', formatDate(date), 'formatDate(selectedDay) =', formatDate(selectedDay));
        if (formatDate(date) === formatDate(selectedDay)) {
          console.log('SAME DAY! switching to DAY view');
          setViewMode('day');
        } else {
          console.log('DIFFERENT DAY! switching to WEEK view and selecting day');
          // Calculate Monday of that week to align week view
          const diff = date.getDay() === 0 ? 6 : date.getDay() - 1;
          const monday = new Date(date);
          monday.setDate(date.getDate() - diff);
          setStartDate(monday);
          setSelectedDay(date);
          if (viewMode === 'month') setViewMode('week');
        }
      }
    };
    window.addEventListener('jump_to_calendar_date', handleJumpDate);
    return () => window.removeEventListener('jump_to_calendar_date', handleJumpDate);
  }, [selectedDay, viewMode]);

  useEffect(() => {
    fetchData();
  }, [refreshTrigger, startDate, viewMode, globalRegion, globalStatus, globalType]);

  const fetchData = async () => {
    const sDate = viewMode === 'month' ? formatDate(monthDays[0]) : formatDate(weekDays[0]);
    const eDate = viewMode === 'month' ? formatDate(monthDays[monthDays.length - 1]) : formatDate(weekDays[6]);

    // 2. Fetch schedules for the week
    if (drivers && drivers.length > 0) {
      const { data: scheds } = await supabase
        .from('worker_schedules')
        .select('*')
        .in('profile_id', drivers.map(p => p.id))
        .gte('work_date', sDate)
        .lte('work_date', eDate);
      setSchedules(scheds || []);
    }

    // 3. Fetch measurement tasks with order details
    const { data: measurementTasks } = await supabase
      .from('delivery_tasks')
      .select(`
        *,
        orders ( status, order_type, order_number, external_id, order_addresses ( city, street, building ), order_specifications ( area_sqm ), branches ( regions (name) ) )
      `)
      .gte('scheduled_date', sDate)
      .lte('scheduled_date', eDate)
      .in('outcome', ['SCHEDULED', 'IN_PROGRESS']);
      
    // 4. Fetch paused orders that have a resume_date in this range
    const { data: pausedOrders } = await supabase
      .from('orders')
      .select('id, status, order_type, order_number, external_id, resume_date, order_addresses(city, street, building), branches(regions(name))')
      .eq('status', 'PAUSED')
      .gte('resume_date', sDate)
      .lte('resume_date', eDate);
      
    const activeOrderIdsInView = new Set(measurementTasks?.map(t => t.order_id) || []);
      
    let fakePausedTasks = (pausedOrders || []).filter(o => !activeOrderIdsInView.has(o.id)).map(o => ({
      id: `paused_${o.id}`,
      order_id: o.id,
      driver_id: null,
      scheduled_date: o.resume_date,
      start_time: '10:00:00',
      end_time: '12:00:00',
      estimated_duration_mins: plannerSettings?.defaultDurationMins || 60,
      outcome: o.status,
      orders: {
        ...o,
        order_specifications: { area_sqm: 0 }
      }
    }));

    let allTasks = [...(measurementTasks || []), ...fakePausedTasks];

    // Apply global filters

    if (!globalRegion.includes('Всі')) {
      allTasks = allTasks.filter(t => {
        const rName = t.orders?.branches?.regions?.name;
        return rName && globalRegion.includes(rName);
      });
    }
    
    if (globalStatus !== 'Всі' && globalStatus !== 'Актуальні') {
      if (globalStatus === 'На паузі') {
        allTasks = allTasks.filter(t => isPaused(t.orders?.status));
      }
    }
    
    if (globalType !== 'Всі') {
      if (globalType === 'По кресленню') {
        allTasks = allTasks.filter(t => t.orders?.order_type === 'BY_DRAWING');
      } else if (globalType === 'Повний цикл') {
        allTasks = allTasks.filter(t => t.orders?.order_type === 'FULL_CYCLE');
      } else if (globalType === 'Без монтажу') {
        allTasks = allTasks.filter(t => t.orders?.order_type === 'NO_INSTALLATION');
      }
    }

    setTasks(allTasks);
  };

  const getDaySchedule = (measurerId: string, dateStr: string) => {
    return schedules.find(s => s.profile_id === measurerId && s.work_date === dateStr);
  };

  const getDayWorkload = (dateStr: string) => {
    const allTasksForDay = tasks.filter(t => t.scheduled_date === dateStr);
    
    // Sum area
    const totalArea = allTasksForDay.reduce((sum, task) => {
      const specs = task.orders?.order_specifications;
      const area = Array.isArray(specs) ? (specs[0]?.area_sqm || 0) : (specs?.area_sqm || 0);
      return sum + Number(area);
    }, 0);

    // Calculate capacity
    let totalCapacityMins = 0;
    drivers.forEach(m => {
      const sched = getDaySchedule(m.id, dateStr);
      const isOff = sched && (sched.status === 'DAY_OFF' || sched.status === 'SICK' || sched.status === 'VACATION');
      if (!isOff) {
        let startMins = 9 * 60; // default 09:00
        let endMins = 18 * 60; // default 18:00
        if (sched?.start_time) {
           const [h, min] = sched.start_time.split(':').map(Number);
           startMins = h * 60 + min;
        }
        if (sched?.end_time) {
           const [h, min] = sched.end_time.split(':').map(Number);
           endMins = h * 60 + min;
        }
        const hoursWorking = Math.max(0, endMins - startMins);
        
        // Use efficiency coefficient from settings (default 0.8)
        const efficiency = (plannerSettings.efficiencyCoef || 80) / 100;
        totalCapacityMins += hoursWorking * efficiency;
      }
    });

    // Sum planned time for all tasks on this day (duration + travel_time)
    const defaultDuration = plannerSettings.defaultDurationMins || 60;
    const defaultTravel = plannerSettings.defaultTravelMins || 20;
    
    const totalPlannedMins = allTasksForDay.reduce((sum, task) => {
      return sum + (task.estimated_duration_mins || defaultDuration) + (task.estimated_travel_time_mins || defaultTravel);
    }, 0);

    const workloadPercent = totalCapacityMins > 0 ? Math.round((totalPlannedMins / totalCapacityMins) * 100) : 0;
    
    return { totalArea, workloadPercent };
  };

  const getRegionDayWorkload = (regionName: string, dateStr: string) => {
    const regionTasks = tasks.filter(t => t.scheduled_date === dateStr && (t.orders?.branches?.regions?.name || 'Інше') === regionName);
    
    const totalArea = regionTasks.reduce((sum, task) => {
      const specs = task.orders?.order_specifications;
      const area = Array.isArray(specs) ? (specs[0]?.area_sqm || 0) : (specs?.area_sqm || 0);
      return sum + Number(area);
    }, 0);

    let totalCapacityMins = 0;
    const regionMeasurers = drivers.filter(m => (m.branches?.regions?.name || 'Інше') === regionName);
    regionMeasurers.forEach(m => {
      const sched = getDaySchedule(m.id, dateStr);
      const isOff = sched && (sched.status === 'DAY_OFF' || sched.status === 'SICK' || sched.status === 'VACATION');
      if (!isOff) {
        let startMins = 9 * 60;
        let endMins = 18 * 60;
        if (sched?.start_time) {
           const [h, min] = sched.start_time.split(':').map(Number);
           startMins = h * 60 + min;
        }
        if (sched?.end_time) {
           const [h, min] = sched.end_time.split(':').map(Number);
           endMins = h * 60 + min;
        }
        const hoursWorking = Math.max(0, endMins - startMins);
        const efficiency = (plannerSettings.efficiencyCoef || 80) / 100;
        totalCapacityMins += hoursWorking * efficiency;
      }
    });

    const defaultDuration = plannerSettings.defaultDurationMins || 60;
    const defaultTravel = plannerSettings.defaultTravelMins || 20;
    
    const totalPlannedMins = regionTasks.reduce((sum, task) => {
      return sum + (task.estimated_duration_mins || defaultDuration) + (task.estimated_travel_time_mins || defaultTravel);
    }, 0);

    const workloadPercent = totalCapacityMins > 0 ? Math.round((totalPlannedMins / totalCapacityMins) * 100) : 0;
    
    return { totalArea, workloadPercent };
  };

  const getWorkloadColor = (percent: number, isSelected: boolean = false) => {
    // If selected, we might want it to stay white or accent, but battery looks cool anyway.
    // We will return a transparent color so it overlays well.
    const alpha = isSelected ? '0.4' : '0.2';
    if (percent === 0) return 'transparent';
    if (percent <= 60) return `rgba(34, 197, 94, ${alpha})`;
    if (percent <= 80) return `rgba(234, 179, 8, ${alpha})`;
    if (percent <= 90) return `rgba(249, 115, 22, ${alpha})`;
    return `rgba(156, 163, 175, ${alpha})`;
  };

  const getBatteryBackground = (percent: number, isSelected: boolean) => {
    const baseBg = isSelected ? 'var(--accent-color)' : 'var(--bg-panel)';
    if (percent === 0) return baseBg;
    const color = getWorkloadColor(percent, isSelected);
    const p = Math.min(percent, 100);
    // Combine base background with the battery gradient on top
    return `linear-gradient(to top, ${color} ${p}%, transparent ${p}%), ${baseBg}`;
  };

  // Helper to filter tasks by status
  const filterTaskByStatus = (t: any) => {
    if (filterStatus === 'ALL') return true;
    return t.orders?.status === filterStatus;
  };

  const getDayTasks = (measurerId: string | null, dateStr: string, regionName?: string) => {
    return tasks.filter(t => {
      const matchMeasurer = t.driver_id === measurerId;
      const matchDate = t.scheduled_date === dateStr;
      const matchStatus = filterTaskByStatus(t);
      const matchRegion = (measurerId !== null) || !regionName || (t.orders?.branches?.regions?.name || 'Інше') === regionName;
      return matchMeasurer && matchDate && matchStatus && matchRegion;
    }).sort((a, b) => a.start_time.localeCompare(b.start_time));
  };

  const filteredMeasurers = drivers.filter(m => filterMeasurerId === 'ALL' || m.id === filterMeasurerId);
  const groupedMeasurers = Array.from(new Set(filteredMeasurers.map(m => m.branches?.regions?.name || 'Інше')))
    .map(regionName => ({
      regionName,
      drivers: filteredMeasurers.filter(m => (m.branches?.regions?.name || 'Інше') === regionName)
    })).sort((a, b) => a.regionName.localeCompare(b.regionName));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          
          <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '4px' }}>
            <button 
              onClick={() => setViewMode('day')}
              style={{ padding: '6px 16px', fontSize: '13px', border: 'none', background: viewMode === 'day' ? 'var(--bg-panel)' : 'transparent', fontWeight: viewMode === 'day' ? 600 : 500, color: viewMode === 'day' ? 'var(--text-primary)' : 'var(--text-secondary)', cursor: 'pointer', borderRadius: '6px', transition: 'all 0.2s', boxShadow: viewMode === 'day' ? 'var(--shadow-sm)' : 'none' }}
            >
              День
            </button>
            <button 
              onClick={() => setViewMode('week')}
              style={{ padding: '6px 16px', fontSize: '13px', border: 'none', background: viewMode === 'week' ? 'var(--bg-panel)' : 'transparent', fontWeight: viewMode === 'week' ? 600 : 500, color: viewMode === 'week' ? 'var(--text-primary)' : 'var(--text-secondary)', cursor: 'pointer', borderRadius: '6px', transition: 'all 0.2s', boxShadow: viewMode === 'week' ? 'var(--shadow-sm)' : 'none' }}
            >
              Тиждень
            </button>
            <button 
              onClick={() => setViewMode('month')}
              style={{ padding: '6px 16px', fontSize: '13px', border: 'none', background: viewMode === 'month' ? 'var(--bg-panel)' : 'transparent', fontWeight: viewMode === 'month' ? 600 : 500, color: viewMode === 'month' ? 'var(--text-primary)' : 'var(--text-secondary)', cursor: 'pointer', borderRadius: '6px', transition: 'all 0.2s', boxShadow: viewMode === 'month' ? 'var(--shadow-sm)' : 'none' }}
            >
              Місяць
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={() => setStartDate(viewMode === 'month' ? new Date(startDate.getFullYear(), startDate.getMonth() - 1, 1) : addDays(startDate, -7))} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0 12px', height: '34px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-panel)'}>&lt;</button>
            <button onClick={() => setStartDate(viewMode === 'month' ? new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1) : addDays(startDate, 7))} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0 12px', height: '34px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-panel)'}>&gt;</button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)', minWidth: '130px' }}>
              {monthName} {startDate.getFullYear()} р.
            </div>
            <input 
              type="date"
              title="Швидкий вибір дати"
              value={formatDate(startDate)}
              onChange={(e) => {
                if (e.target.value) {
                  const d = new Date(e.target.value);
                  setStartDate(d);
                  setSelectedDay(d);
                  if (onSelectMapDate) onSelectMapDate(d);
                }
              }}
              style={{ 
                height: '34px',
                padding: '0 12px', 
                borderRadius: '8px', 
                border: '1px solid var(--border-color)', 
                background: 'var(--bg-panel)', 
                color: 'var(--text-secondary)', 
                fontSize: '13px', 
                cursor: 'pointer',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--accent-color)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
            />
          </div>
        </div>
      </div>
      
      {viewMode === 'day' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto' }}>
          {weekDays.map(date => {
            const isSelected = date.toDateString() === selectedDay.toDateString();
            const workload = getDayWorkload(formatDate(date));
            return (
              <div 
                key={date.toISOString()} 
                onClick={() => {
                  setSelectedDay(date);
                  onSelectMapDate?.(date);
                }}
                style={{ 
                  flex: 1, padding: '8px', textAlign: 'center', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  background: getBatteryBackground(workload.workloadPercent, isSelected),
                  color: isSelected ? 'white' : 'var(--text-primary)',
                  border: isSelected ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <div style={{ fontSize: '11px', opacity: 0.8 }}>{formatDayName(date)}</div>
                <div style={{ fontSize: '16px', fontWeight: 600, margin: '2px 0' }}>{date.getDate()}</div>
                <div style={{ fontSize: '10px', opacity: 0.9, marginTop: '2px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <span title="Запланована квадратура">{workload.totalArea.toFixed(1)} м²</span>
                  <span>•</span>
                  <span title="Завантаження" style={{ color: workload.workloadPercent > 90 ? (isSelected ? '#ffcdd2' : 'var(--danger-color)') : 'inherit' }}>
                    {workload.workloadPercent}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Grid container */}
      <div 
        ref={scrollRef}
        style={{ flex: 1, overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--bg-panel)' }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
          <thead>
            <tr>
              <th style={{ width: '120px', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', padding: '12px', background: 'var(--bg-main)' }}>
                Водій
              </th>
              {viewMode === 'month' ? monthDays.map(date => {
                const isSelectedMap = date.toDateString() === selectedMapDate.toDateString();
                const isToday = date.toDateString() === new Date().toDateString();
                const workload = getDayWorkload(formatDate(date));
                const bgColor = workload.workloadPercent > 0 ? getWorkloadColor(workload.workloadPercent, isSelectedMap) : (isSelectedMap ? 'rgba(59, 130, 246, 0.05)' : 'var(--bg-main)');
                
                return (
                  <th key={date.toISOString()} onClick={() => { setSelectedDay(date); onSelectMapDate?.(date); setStartDate(date); }} style={{ borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', padding: '8px 4px', background: bgColor, minWidth: '40px', cursor: 'pointer', transition: 'background 0.2s' }}>
                    <div style={{ fontSize: '10px', color: isSelectedMap ? 'var(--accent-color)' : 'var(--text-secondary)' }}>{formatDayName(date)}</div>
                    <div style={{ 
                      fontSize: '12px', 
                      fontWeight: 700, 
                      color: isToday ? 'white' : 'var(--text-primary)',
                      background: isToday ? 'var(--accent-color)' : 'transparent',
                      width: '20px',
                      height: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '50%',
                      margin: '2px auto 0'
                    }}>
                      {date.getDate()}
                    </div>
                  </th>
                );
              }) : viewMode === 'week' ? weekDays.map(date => {
                const isSelectedMap = date.toDateString() === selectedMapDate.toDateString();
                const isToday = date.toDateString() === new Date().toDateString();
                const workload = getDayWorkload(formatDate(date));
                return (
                  <th key={date.toISOString()} onClick={() => onSelectMapDate?.(date)} style={{ borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', padding: '12px', background: getBatteryBackground(workload.workloadPercent, isSelectedMap), minWidth: '200px', cursor: 'pointer', transition: 'background 0.2s', position: 'relative' }}>
                    <div style={{ fontSize: '11px', color: isSelectedMap ? 'white' : 'var(--text-secondary)' }}>{formatDayName(date)}</div>
                    <div style={{ 
                      fontSize: '16px', 
                      fontWeight: 700, 
                      color: isToday ? 'white' : (isSelectedMap ? 'white' : 'var(--text-primary)'),
                      background: isToday ? 'var(--accent-color)' : 'transparent',
                      width: '28px',
                      height: '28px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '50%',
                      margin: '4px auto 0'
                    }}>
                      {date.getDate()}
                    </div>
                    <div style={{ fontSize: '10px', opacity: 0.9, marginTop: '6px', display: 'flex', justifyContent: 'center', gap: '4px', alignItems: 'center', color: isSelectedMap ? 'white' : 'inherit' }}>
                      <span title="Запланована квадратура">{workload.totalArea.toFixed(1)} м²</span>
                      <span>•</span>
                      <span title="Завантаження">
                        {workload.workloadPercent}%
                      </span>
                    </div>
                  </th>
                );
              }) : HOURS.map(slot => (
                <th key={slot} style={{ borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', padding: '12px', background: 'var(--bg-main)', minWidth: '120px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{slot}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupedMeasurers.map(group => (
              <Fragment key={group.regionName}>
                {/* Region Separator Row (Only show if multiple regions) */}
                {groupedMeasurers.length > 1 && (
                  <tr style={{ background: 'var(--bg-main)' }}>
                    <td style={{ borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', padding: '8px 12px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', fontSize: '13px', background: 'var(--bg-panel)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '4px', height: '16px', backgroundColor: 'var(--accent-color)', borderRadius: '2px' }} />
                        {group.regionName}
                      </div>
                    </td>
                    {viewMode === 'month' ? monthDays.map(date => {
                      const dateStr = formatDate(date);
                      const workload = getRegionDayWorkload(group.regionName, dateStr);
                      return (
                        <td key={dateStr} style={{ borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', padding: '6px', textAlign: 'center', background: getBatteryBackground(workload.workloadPercent, false), color: 'var(--text-primary)', fontSize: '11px', fontWeight: 600 }}>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', alignItems: 'center', opacity: 0.9 }}>
                            <span title="Запланована квадратура">{workload.totalArea.toFixed(1)} м²</span>
                            <span style={{ opacity: 0.5 }}>•</span>
                            <span title="Завантаження">{workload.workloadPercent}%</span>
                          </div>
                        </td>
                      );
                    }) : viewMode === 'week' ? weekDays.map(date => {
                      const dateStr = formatDate(date);
                      const workload = getRegionDayWorkload(group.regionName, dateStr);
                      return (
                        <td key={dateStr} style={{ borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', padding: '6px', textAlign: 'center', background: getBatteryBackground(workload.workloadPercent, false), color: 'var(--text-primary)', fontSize: '11px', fontWeight: 600 }}>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', alignItems: 'center', opacity: 0.9 }}>
                            <span title="Запланована квадратура">{workload.totalArea.toFixed(1)} м²</span>
                            <span style={{ opacity: 0.5 }}>•</span>
                            <span title="Завантаження">{workload.workloadPercent}%</span>
                          </div>
                        </td>
                      );
                    }) : HOURS.map(slot => (
                      <td key={slot} style={{ borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', padding: '4px', background: 'var(--bg-panel)' }}></td>
                    ))}
                  </tr>
                )}

                {/* Measurers in this region */}
                {group.drivers.map(measurer => (
                  <tr key={measurer.id}>
                    <td style={{ borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', padding: '12px', fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: measurer.color || 'var(--accent-color)' }} />
                        {measurer.full_name.split(' ')[0]}
                      </div>
                    </td>
                    
                    {viewMode === 'month' ? monthDays.map(date => {
                      const dateStr = formatDate(date);
                      const sched = getDaySchedule(measurer.id, dateStr);
                      const dayTasks = getDayTasks(measurer.id, dateStr, group.regionName);
                      const isOff = sched && (sched.status === 'DAY_OFF' || sched.status === 'SICK' || sched.status === 'VACATION');

                      return (
                        <DroppableCell key={dateStr} id={`${measurer.id}_${dateStr}`} isOff={!!isOff} status={sched?.status} onSelectOrder={onSelectOrder}>
                          <div onClick={() => { setSelectedDay(date); onSelectMapDate?.(date); setStartDate(date); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', minHeight: '40px', cursor: 'pointer' }}>
                            {dayTasks.length > 0 && (
                              <div style={{ fontSize: '14px', fontWeight: 700, color: measurer.color || 'var(--accent-color)' }}>
                                {dayTasks.length}
                              </div>
                            )}
                          </div>
                        </DroppableCell>
                      );
                    }) : viewMode === 'week' ? weekDays.map(date => {
                      const dateStr = formatDate(date);
                      const sched = getDaySchedule(measurer.id, dateStr);
                      const dayTasks = getDayTasks(measurer.id, dateStr, group.regionName);
                      const isOff = sched && (sched.status === 'DAY_OFF' || sched.status === 'SICK' || sched.status === 'VACATION');

                      return (
                        <DroppableCell key={dateStr} id={`${measurer.id}_${dateStr}`} isOff={!!isOff} status={sched?.status} onSelectOrder={onSelectOrder}>
                          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                            {dayTasks.map((task, i) => (
                              <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                {i > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--text-secondary)' }}>
                                      <Car size={14} />
                                      <span style={{ fontSize: '10px', marginTop: '2px' }}>
                                        ~{task.estimated_travel_time_mins || 20} хв
                                      </span>
                                    </div>
                                )}
                                <DraggableCalendarTask task={task} color={measurer.color} isSelected={task.order_id === selectedOrderId} onSelectOrder={onSelectOrder} />
                              </div>
                            ))}
                          </div>
                        </DroppableCell>
                      );
                    }) : HOURS.map(slot => {
                      const dateStr = formatDate(selectedDay);
                      const sched = getDaySchedule(measurer.id, dateStr);
                      const isOff = sched && (sched.status === 'DAY_OFF' || sched.status === 'SICK' || sched.status === 'VACATION');
                      
                      const slotHour = parseInt(slot.split(':')[0]);
                      const slotTasks = getDayTasks(measurer.id, dateStr, group.regionName).filter(t => parseInt(t.start_time.split(':')[0]) === slotHour);

                      return (
                        <DroppableCell key={`${dateStr}_${slot}`} id={`${measurer.id}_${dateStr}_${slot}`} isOff={isOff} status={sched?.status} isDayView={true} onSelectOrder={onSelectOrder}>
                          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                            {slotTasks.map((task) => (
                              <DraggableCalendarTaskDayView key={task.id} task={task} onSelectOrder={onSelectOrder} color={measurer.color} isSelected={task.order_id === selectedOrderId} />
                            ))}
                          </div>
                        </DroppableCell>
                      );
                    })}
                  </tr>
                ))}

                {/* Unassigned row for this region */}
                {(filterMeasurerId === 'ALL' || filterMeasurerId === 'unassigned') && (
                  <tr>
                  <td style={{ borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', padding: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Без доставкуника
                  </td>
                  {viewMode === 'month' ? monthDays.map(date => {
                    const dateStr = formatDate(date);
                    const unassignedTasks = getDayTasks(null, dateStr, group.regionName);
                    return (
                      <DroppableCell key={`unassigned_${group.regionName}_${dateStr}`} id={`unassigned_${dateStr}`} isOff={false} onSelectOrder={onSelectOrder}>
                        <div onClick={() => { setSelectedDay(date); onSelectMapDate?.(date); setStartDate(date); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', minHeight: '40px', cursor: 'pointer' }}>
                          {unassignedTasks.length > 0 && (
                            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                              {unassignedTasks.length}
                            </div>
                          )}
                        </div>
                      </DroppableCell>
                    );
                  }) : viewMode === 'week' 
                    ? weekDays.map(date => {
                        const dateStr = formatDate(date);
                        const unassignedTasks = getDayTasks(null, dateStr, group.regionName);
                        return (
                          <DroppableCell key={`unassigned_${group.regionName}_${dateStr}`} id={`unassigned_${dateStr}`} isOff={false} onSelectOrder={onSelectOrder}>
                            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                              {unassignedTasks.map((task) => (
                                <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                  <DraggableCalendarTask task={task} isSelected={task.order_id === selectedOrderId} onSelectOrder={onSelectOrder} />
                                </div>
                              ))}
                            </div>
                          </DroppableCell>
                        );
                      })
                    : HOURS.map(slot => {
                        const dateStr = formatDate(selectedDay);
                        const slotHour = parseInt(slot.split(':')[0]);
                        const unassignedTasks = getDayTasks(null, dateStr, group.regionName).filter(t => parseInt(t.start_time.split(':')[0]) === slotHour);
                        return (
                          <DroppableCell key={`unassigned_${group.regionName}_${dateStr}_${slot}`} id={`unassigned_${dateStr}_${slot}`} isOff={false} isDayView={true} onSelectOrder={onSelectOrder}>
                            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                              {unassignedTasks.map((task) => (
                                <DraggableCalendarTaskDayView key={task.id} task={task} isSelected={task.order_id === selectedOrderId} onSelectOrder={onSelectOrder} />
                              ))}
                            </div>
                          </DroppableCell>
                        );
                      })
                  }
                </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Droppable Cell component for dnd-kit
function DroppableCell({ id, isOff, status, isDayView, children, onSelectOrder }: { id: string, isOff: boolean, status?: string, isDayView?: boolean, children?: React.ReactNode, onSelectOrder?: (id: string) => void }) {
  const { isOver, setNodeRef } = useDroppable({
    id: id,
    disabled: isOff
  });

  let bg = 'var(--bg-surface)';
  if (isOff) bg = 'var(--bg-main)'; // Grey out off days
  if (isOver) bg = 'var(--accent-hover)'; // Highlight on drag hover

  return (
    <td 
      ref={setNodeRef} 
      onClick={() => onSelectOrder?.('')}
      style={{ 
        borderBottom: '1px solid var(--border-color)', 
        borderRight: '1px solid var(--border-color)', 
        padding: isDayView ? '0' : '8px', 
        background: bg,
        verticalAlign: 'top',
        opacity: isOff ? 0.7 : 1,
        transition: 'background 0.2s',
        position: 'relative',
        height: isDayView ? '60px' : 'auto'
      }}
    >
      {isOff ? (
        <div style={{ fontSize: '11px', color: 'var(--danger-color)', textAlign: 'center', marginTop: '8px' }}>
          {status === 'DAY_OFF' ? 'Вихідний' : status === 'SICK' ? 'Лікарняний' : 'Відпустка'}
        </div>
      ) : (
        children
      )}
    </td>
  );
}

// Draggable Task component
function DraggableCalendarTask({ task, color = 'var(--accent-color)', isSelected, onSelectOrder }: { task: any, color?: string, isSelected?: boolean, onSelectOrder?: (id: string) => void }) {
  const isLocked = task.orders?.status !== 'DELIVERY_SCHEDULING' && !isPaused(task.orders?.status);
  const isCurrentlyPaused = isPaused(task.orders?.status);
  const actualColor = isCurrentlyPaused ? 'var(--danger-color)' : color;
  
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `task_${task.id}`,
    data: { ...task, type: 'calendar_task' },
    disabled: isLocked
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: 100,
    opacity: 0.8
  } : undefined;

  return (
    <div 
      ref={setNodeRef} 
      className={isSelected ? 'selected-pulse' : ''}
      onClick={(e) => { e.stopPropagation(); onSelectOrder?.(task.order_id); }}
      style={{ 
        ...style,
        background: isCurrentlyPaused ? '#fef2f2' : (isLocked ? `color-mix(in srgb, ${actualColor} 12%, var(--bg-panel))` : 'var(--bg-panel)'), 
        border: `1px solid ${actualColor}`, 
        borderLeft: `4px solid ${actualColor}`,
        borderRadius: '4px',
        padding: '8px',
        minWidth: '120px',
        boxShadow: transform ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
        cursor: isLocked ? 'pointer' : 'grab',
        opacity: isLocked ? 0.9 : 1
      }}
      {...listeners}
      {...attributes}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: isCurrentlyPaused ? 'var(--danger-color)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          {isCurrentlyPaused ? <span style={{fontSize:'10px'}}>⏸️</span> : (isLocked && <Lock size={10} color="var(--text-secondary)" />)}
          {task.start_time.slice(0,5)} - {task.end_time.slice(0,5)}
        </div>
      </div>
      <div style={{ fontSize: '12px', color: actualColor, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {task.orders?.order_number || task.orders?.external_id || 'Без номера'}
      </div>
      <div style={{ fontSize: '10px', color: isCurrentlyPaused ? 'var(--danger-color)' : 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px' }}>
        {task.orders?.order_addresses?.[0] ? `${task.orders.order_addresses[0].street}, ${task.orders.order_addresses[0].building}` : 'Адреса не вказана'}
      </div>
    </div>
  );
}

// Draggable Task component for Day View (Absolute positioned)
function DraggableCalendarTaskDayView({ task, onSelectOrder, color = 'var(--accent-color)', isSelected }: { task: any, onSelectOrder?: (id: string) => void, color?: string, isSelected?: boolean }) {
  const isLocked = task.orders?.status !== 'DELIVERY_SCHEDULING' && !isPaused(task.orders?.status);
  const isCurrentlyPaused = isPaused(task.orders?.status);
  const actualColor = isCurrentlyPaused ? 'var(--danger-color)' : color;

  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `day_task_${task.id}`,
    data: { ...task, type: 'calendar_task' },
    disabled: isLocked
  });

  const parseTime = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };
  const startMins = parseTime(task.start_time);
  const endMins = parseTime(task.end_time);
  const slotStartMins = Math.floor(startMins / 60) * 60;
  
  const offsetMins = startMins - slotStartMins;
  let durationMins = endMins - startMins;
  if (durationMins < 45) durationMins = 45; // min width for visibility

  const travelMins = task.estimated_travel_time_mins || 20;
  const containerOffsetMins = offsetMins - travelMins;
  const containerDurationMins = travelMins + durationMins;

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: 100,
    opacity: 0.8
  } : undefined;

  return (
    <div 
      ref={setNodeRef}
      className={isSelected ? 'selected-pulse' : ''}
      onClick={(e) => { e.stopPropagation(); onSelectOrder?.(task.order_id); }}
      style={{ 
        ...style,
        position: 'absolute',
        top: '4px',
        left: `${(containerOffsetMins / 60) * 100}%`,
        width: `calc(${(containerDurationMins / 60) * 100}% - 4px)`,
        height: 'calc(100% - 8px)',
        cursor: 'grab',
        zIndex: 10,
        display: 'flex'
      }}
      {...listeners}
      {...attributes}
    >
      {/* Travel Block */}
      <div style={{
        width: `${(travelMins / containerDurationMins) * 100}%`,
        background: `${actualColor}15`,
        border: `1px dashed ${actualColor}`,
        borderRight: 'none',
        borderRadius: '4px 0 0 4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        color: actualColor,
        overflow: 'hidden'
      }}>
        <Car size={14} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: '10px', fontWeight: 600, whiteSpace: 'nowrap' }}>{travelMins} хв</span>
      </div>

      {/* Measurement Block */}
      <div 
        onClick={(e) => { e.stopPropagation(); onSelectOrder?.(task.order_id); }}
        style={{
          width: `${(durationMins / containerDurationMins) * 100}%`,
          background: isPaused ? '#fef2f2' : (isLocked ? `color-mix(in srgb, ${actualColor} 12%, var(--bg-panel))` : 'var(--bg-panel)'), 
          border: `1px solid ${actualColor}`, 
          borderLeft: `4px solid ${actualColor}`,
          borderRadius: '0 4px 4px 0',
          padding: '4px 8px',
          boxShadow: transform ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: isPaused ? 'var(--danger-color)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {isPaused ? <span style={{fontSize:'10px'}}>⏸️</span> : (isLocked && <Lock size={10} color="var(--text-secondary)" />)}
            {task.start_time.slice(0,5)} - {task.end_time.slice(0,5)}
          </div>
        </div>
        <div style={{ fontSize: '12px', color: actualColor, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {task.orders?.order_number || task.orders?.external_id || 'Без номера'}
        </div>
      </div>
    </div>
  );
}

