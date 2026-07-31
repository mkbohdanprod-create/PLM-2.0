import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { ChevronLeft, ChevronRight, Phone, MessageCircle, Mail, MapPin, Briefcase, User, Star, Settings, X, Info } from 'lucide-react';

interface MeasurementManagerAnalyticsProps {
  globalRegion: string[];
}

export function MeasurementManagerAnalytics({ globalRegion }: MeasurementManagerAnalyticsProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<'measurers' | 'department'>('measurers');
  const [selectedMeasurerId, setSelectedMeasurerId] = useState<string | null>(null);
  const [measurers, setMeasurers] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // Fake settings state for UI presentation (later will be saved to Supabase 'settings' table)
  const [oeeSettings, setOeeSettings] = useState({
    tBase: 30,
    tPaperwork: 15,
    kArea: 10,
    kElement: 15,
    targetPoints: 100
  });

  useEffect(() => {
    fetchData();
  }, [currentMonth, globalRegion]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Measurers
      const { data: mData } = await supabase
        .from('profiles')
        .select('*, regions(name), branches(regions(name))')
        .eq('role_code', 'MEASURER')
        .order('full_name');

      let filteredMeasurers = mData || [];
      if (!globalRegion.includes('Всі')) {
        filteredMeasurers = filteredMeasurers.filter(m => {
          const rName = m.regions?.name || m.branches?.regions?.name || 'Інше';
          return globalRegion.includes(rName);
        });
      }
      setMeasurers(filteredMeasurers);

      // Month bounds
      const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
      const startStr = firstDay.toISOString().split('T')[0];
      const endStr = lastDay.toISOString().split('T')[0];

      // 2. Fetch Schedules to calculate Norm
      const { data: sData } = await supabase
        .from('worker_schedules')
        .select('*')
        .in('profile_id', filteredMeasurers.map(m => m.id))
        .gte('work_date', startStr)
        .lte('work_date', endStr);
      
      setSchedules(sData || []);

      // 3. Fetch Tasks to calculate Fact
      const { data: tData } = await supabase
        .from('measurement_tasks')
        .select(`
          *,
          orders (
            status, 
            measurement_duration_mins,
            order_specifications ( area_sqm )
          )
        `)
        .in('measurer_id', filteredMeasurers.map(m => m.id))
        .gte('scheduled_date', startStr)
        .lte('scheduled_date', endStr);
        
      setTasks(tData || []);

    } catch (e) {
      console.error('Error fetching analytics:', e);
    } finally {
      setLoading(false);
    }
  };

  const nextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const formatMonth = (date: Date) => {
    const months = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
    return `${months[date.getMonth()]} ${date.getFullYear()} р.`;
  };

  // Metric Calculation helper
  const getMetrics = (measurerId: string) => {
    // 1. Working schedules for Norm
    const mSchedules = schedules.filter(s => s.profile_id === measurerId && s.status === 'WORKING');
    const plannedDays = mSchedules.length;
    const plannedHours = plannedDays * 8; // Assumed 8h workday
    const norm = plannedDays * 4;

    // 2. Tasks
    const mTasks = tasks.filter(t => t.measurer_id === measurerId);
    const completedTasks = mTasks.filter(t => {
      const st = t.orders?.status;
      return st && ['MEASUREMENT_COMPLETED', 'DESIGN_PHASE', 'READY_FOR_PRODUCTION', 'PRODUCTION', 'READY_FOR_INSTALLATION', 'INSTALLATION_SCHEDULING', 'INSTALLATION_PRE_SCHEDULED', 'INSTALLATION', 'COMPLETED'].includes(st);
    });
    
    const fact = mTasks.length;
    const completed = completedTasks.length;

    // Hours calculation
    let totalRoadMins = 0;
    let totalMeasurementMins = 0;
    let totalSqm = 0;

    mTasks.forEach(t => {
      totalRoadMins += t.estimated_travel_time_mins || 0;
      if (t.orders?.measurement_duration_mins) {
        totalMeasurementMins += t.orders.measurement_duration_mins;
      } else {
        totalMeasurementMins += 60; // fallback avg measurement time
      }
      
      const specs = t.orders?.order_specifications || [];
      const specArr = Array.isArray(specs) ? specs : [specs];
      specArr.forEach((sp: any) => {
        if (sp && sp.area_sqm) totalSqm += Number(sp.area_sqm);
      });
    });

    const factWorkedHours = (totalRoadMins + totalMeasurementMins) / 60;
    const avgSqmPerObject = fact > 0 ? (totalSqm / fact).toFixed(1) : '0';

    const efficiency = norm > 0 ? Math.round((fact / norm) * 100) : 0;
    
    // OEE Points logic
    const targetPoints = plannedHours * oeeSettings.targetPoints;
    let earnedPoints = 0;
    mTasks.forEach(t => {
      const road = t.estimated_travel_time_mins || 0;
      let sqm = 0;
      const specs = t.orders?.order_specifications || [];
      const specArr = Array.isArray(specs) ? specs : [specs];
      specArr.forEach((sp: any) => {
        if (sp && sp.area_sqm) sqm += Number(sp.area_sqm);
      });
      // Simplified T_ideal = road + base + areaTime + elementTime (mock 1 element) + paperwork
      const tIdeal = road + oeeSettings.tBase + (sqm * oeeSettings.kArea) + oeeSettings.kElement + oeeSettings.tPaperwork;
      earnedPoints += (tIdeal / 10);
    });

    const oee = targetPoints > 0 ? Math.round((earnedPoints / targetPoints) * 100) : 0;
    
    return { 
      norm, fact, efficiency, completed, 
      plannedHours, factWorkedHours, 
      totalRoadMins, totalMeasurementMins, 
      totalSqm, avgSqmPerObject, oee,
      targetPoints, earnedPoints
    };
  };

  // SVG Donut Chart Component
  const DonutChart = ({ percentage, size = 80, strokeWidth = 8 }: { percentage: number, size?: number, strokeWidth?: number }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (Math.min(percentage, 100) / 100) * circumference;
    
    let color = 'var(--accent-color)';
    if (percentage < 50) color = 'var(--danger-color)';
    else if (percentage < 80) color = '#eab308'; // yellow
    else if (percentage >= 100) color = '#10b981'; // green

    return (
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="var(--bg-tertiary)"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>{percentage}%</span>
        </div>
      </div>
    );
  };

  const getDepartmentMetrics = () => {
    let totalNorm = 0, totalFact = 0, totalCompleted = 0;
    let totalPlannedHours = 0, totalFactWorkedHours = 0;
    let totalRoadMins = 0, totalMeasurementMins = 0;
    let totalSqm = 0;
    let totalTargetPoints = 0, totalEarnedPoints = 0;

    measurers.forEach(m => {
      const metrics = getMetrics(m.id);
      totalNorm += metrics.norm;
      totalFact += metrics.fact;
      totalCompleted += metrics.completed;
      totalPlannedHours += metrics.plannedHours;
      totalFactWorkedHours += metrics.factWorkedHours;
      totalRoadMins += metrics.totalRoadMins;
      totalMeasurementMins += metrics.totalMeasurementMins;
      totalSqm += metrics.totalSqm;
      totalTargetPoints += metrics.targetPoints;
      totalEarnedPoints += metrics.earnedPoints;
    });

    const avgSqmPerObject = totalFact > 0 ? (totalSqm / totalFact).toFixed(1) : '0';
    const efficiency = totalNorm > 0 ? Math.round((totalFact / totalNorm) * 100) : 0;
    const oee = totalTargetPoints > 0 ? Math.round((totalEarnedPoints / totalTargetPoints) * 100) : 0;

    return { 
      norm: totalNorm, fact: totalFact, efficiency, completed: totalCompleted,
      plannedHours: totalPlannedHours, factWorkedHours: totalFactWorkedHours,
      totalRoadMins, totalMeasurementMins, totalSqm, avgSqmPerObject, oee,
      targetPoints: totalTargetPoints, earnedPoints: totalEarnedPoints
    };
  };

  const getDaysInMonth = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const days = [];
    const date = new Date(year, month, 1);
    while (date.getMonth() === month) {
      days.push(new Date(date));
      date.setDate(date.getDate() + 1);
    }
    return days;
  };

  const renderDetailView = () => {
    const measurer = measurers.find(m => m.id === selectedMeasurerId);
    if (!measurer) return null;

    const metrics = getMetrics(measurer.id);
    const mTasks = tasks.filter(t => t.measurer_id === measurer.id);
    const days = getDaysInMonth();
    const rName = measurer.regions?.name || measurer.branches?.regions?.name || 'Не вказано';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Detail Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '24px', background: 'var(--bg-panel)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
          <button 
            onClick={() => setSelectedMeasurerId(null)}
            style={{ padding: '8px 16px', border: '1px solid var(--border-color)', background: 'var(--bg-main)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}
            className="hover-bg"
          >
            <ChevronLeft size={18} /> Назад
          </button>
          
          <div style={{ 
            width: '80px', height: '80px', borderRadius: '50%', background: 'var(--bg-tertiary)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: `3px solid ${measurer.color || 'var(--accent-color)'}`,
            flexShrink: 0
          }}>
            {measurer.avatar_url ? (
              <img src={measurer.avatar_url} alt={measurer.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <User size={40} color="var(--text-secondary)" />
            )}
          </div>
          
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)', fontSize: '24px' }}>{measurer.full_name}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: 'var(--text-secondary)', fontSize: '14px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={16}/> {rName}</span>
              {measurer.phone && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Phone size={16}/> {measurer.phone}</span>}
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
             <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Факт / Норма</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{metrics.fact} / {metrics.norm}</div>
             </div>
             <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Заміряно</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{metrics.totalSqm.toFixed(1)} м²</div>
             </div>
             <DonutChart percentage={metrics.oee} size={70} strokeWidth={6} />
          </div>
        </div>

        {/* Days List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {days.map(day => {
            const dateStr = day.toISOString().split('T')[0];
            const dayTasks = mTasks.filter(t => t.scheduled_date === dateStr);
            const mSchedule = schedules.find(s => s.profile_id === measurer.id && s.work_date === dateStr);
            const isWeekendOrOff = !mSchedule || mSchedule.status !== 'WORKING';
            const isToday = new Date().toISOString().split('T')[0] === dateStr;

            // Day aggregations
            let daySqm = 0;
            let dayMins = 0;
            dayTasks.forEach(t => {
              dayMins += (t.estimated_travel_time_mins || 0) + (t.orders?.measurement_duration_mins || 60);
              const specs = t.orders?.order_specifications || [];
              const specArr = Array.isArray(specs) ? specs : [specs];
              specArr.forEach((sp: any) => {
                if (sp && sp.area_sqm) daySqm += Number(sp.area_sqm);
              });
            });

            return (
              <div key={dateStr} style={{ 
                display: 'flex', gap: '20px', background: 'var(--bg-panel)', padding: '16px', borderRadius: '12px', border: `1px solid ${isToday ? 'var(--accent-color)' : 'var(--border-color)'}`,
                opacity: isWeekendOrOff && dayTasks.length === 0 ? 0.6 : 1
              }}>
                {/* Date Column */}
                <div style={{ width: '120px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: isToday ? 'var(--accent-color)' : 'var(--text-primary)' }}>
                    {day.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' })}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {day.toLocaleDateString('uk-UA', { weekday: 'long' })}
                  </div>
                  {isWeekendOrOff && (
                    <div style={{ fontSize: '11px', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px', width: 'fit-content', marginTop: '4px' }}>
                      Не робочий
                    </div>
                  )}
                </div>

                {/* Content Column */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {dayTasks.length === 0 ? (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '14px', fontStyle: 'italic', padding: '8px 0' }}>
                      Замовлень не було
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {dayTasks.map((t, idx) => {
                        const statusColor = t.orders?.status === 'COMPLETED' || t.orders?.status === 'MEASUREMENT_COMPLETED' ? '#10b981' : 'var(--accent-color)';
                        return (
                          <div key={t.id || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-main)', padding: '12px 16px', borderRadius: '8px', borderLeft: `3px solid ${statusColor}` }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>
                                Замовлення {t.orders?.order_number || t.order_id?.split('-')[0]}
                              </span>
                              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                Час на дорогу: {t.estimated_travel_time_mins || 0} хв | Замір: {t.orders?.measurement_duration_mins || 60} хв
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                              <span style={{ fontSize: '12px', background: 'var(--bg-tertiary)', padding: '4px 8px', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                                {t.orders?.status || 'UNKNOWN'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Summary Column */}
                <div style={{ width: '160px', flexShrink: 0, borderLeft: '1px solid var(--border-color)', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Заміряно:</span>
                    <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{daySqm.toFixed(1)} м²</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Витрачено:</span>
                    <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{(dayMins / 60).toFixed(1)}г</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: '20px', height: '100%', overflowY: 'auto' }}>
      
      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', background: 'var(--bg-panel)', padding: '16px 20px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px', color: 'var(--text-primary)' }}>
            <Star size={20} color="var(--accent-color)" />
            Ефективність
          </h3>
          
          <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '4px' }}>
            <button 
              onClick={() => { setViewMode('measurers'); setSelectedMeasurerId(null); }}
              style={{ padding: '6px 16px', fontSize: '13px', border: 'none', background: viewMode === 'measurers' ? 'var(--bg-panel)' : 'transparent', fontWeight: viewMode === 'measurers' ? 600 : 500, color: viewMode === 'measurers' ? 'var(--text-primary)' : 'var(--text-secondary)', cursor: 'pointer', borderRadius: '6px', transition: 'all 0.2s', boxShadow: viewMode === 'measurers' ? 'var(--shadow-sm)' : 'none' }}
            >
              По замірниках
            </button>
            <button 
              onClick={() => { setViewMode('department'); setSelectedMeasurerId(null); }}
              style={{ padding: '6px 16px', fontSize: '13px', border: 'none', background: viewMode === 'department' ? 'var(--bg-panel)' : 'transparent', fontWeight: viewMode === 'department' ? 600 : 500, color: viewMode === 'department' ? 'var(--text-primary)' : 'var(--text-secondary)', cursor: 'pointer', borderRadius: '6px', transition: 'all 0.2s', boxShadow: viewMode === 'department' ? 'var(--shadow-sm)' : 'none' }}
            >
              По відділу
            </button>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: '8px' }}>
          <button onClick={prevMonth} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '4px', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }} className="hover-bg">
            <ChevronLeft size={20} />
          </button>
          <span style={{ fontWeight: 600, minWidth: '130px', textAlign: 'center', fontSize: '14px', color: 'var(--text-primary)' }}>
            {formatMonth(currentMonth)}
          </span>
          <button onClick={nextMonth} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '4px', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }} className="hover-bg">
            <ChevronRight size={20} />
          </button>
        </div>

        <button 
          onClick={() => setIsSettingsOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'var(--bg-panel)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s', boxShadow: 'var(--shadow-sm)' }}
          className="hover-bg hover-lift"
        >
          <Settings size={18} color="var(--accent-color)" />
          Налаштування OEE
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <div className="spinner" />
        </div>
      ) : measurers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          Немає замірників у вибраному регіоні
        </div>
      ) : selectedMeasurerId ? (
        renderDetailView()
      ) : viewMode === 'department' ? (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ 
            background: 'var(--bg-panel)', 
            borderRadius: '16px', 
            border: '1px solid var(--border-color)', 
            boxShadow: 'var(--shadow-md)',
            padding: '40px',
            maxWidth: '800px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '32px'
          }}>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)', fontSize: '24px' }}>Середнє по відділу</h2>
              <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Регіон: {globalRegion.join(', ')}</p>
            </div>
            
            {(() => {
              const deptMetrics = getDepartmentMetrics();
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '64px', width: '100%', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <DonutChart percentage={deptMetrics.efficiency} size={180} strokeWidth={16} />
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minWidth: '320px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>Планова кількість годин:</span>
                      <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>{deptMetrics.plannedHours}г</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>Ціль OEE (балів):</span>
                      <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>{Math.round(deptMetrics.targetPoints)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-main)', padding: '6px 12px', borderRadius: '8px' }}>
                      <span style={{ fontSize: '15px', color: 'var(--text-secondary)', fontWeight: 600 }}>Зароблено балів:</span>
                      <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-color)' }}>{Math.round(deptMetrics.earnedPoints)}</span>
                    </div>

                    <div style={{ width: '100%', height: '1px', background: 'var(--border-color)' }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>Заміряно кв. м:</span>
                      <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>{deptMetrics.totalSqm.toFixed(1)} м²</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>Виконано об'єктів (факт):</span>
                      <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>{deptMetrics.completed}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>Сер. площа об'єкта:</span>
                      <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>{deptMetrics.avgSqmPerObject} м²</span>
                    </div>
                    
                    <div style={{ width: '100%', height: '1px', background: 'var(--border-color)' }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>ОЕЕ (Загальна ефективність):</span>
                      <span style={{ fontSize: '22px', fontWeight: 700, color: '#10b981' }}>{deptMetrics.oee}%</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '24px' }}>
          {measurers.map(measurer => {
            const metrics = getMetrics(measurer.id);
            const rName = measurer.regions?.name || measurer.branches?.regions?.name || 'Не вказано';
            
            return (
              <div key={measurer.id} style={{ 
                background: 'var(--bg-panel)', 
                borderRadius: '20px', 
                border: '1px solid var(--border-color)', 
                boxShadow: 'var(--shadow-md)',
                overflow: 'hidden',
                transition: 'transform 0.2s, box-shadow 0.2s',
                display: 'flex',
                flexDirection: 'column',
                cursor: 'pointer'
              }}
              className="analytics-card hover-lift"
              onClick={() => setSelectedMeasurerId(measurer.id)}
              >
                {/* Header Profile Info */}
                <div style={{ display: 'flex', gap: '24px', padding: '24px', borderBottom: '1px solid var(--border-color)', background: 'linear-gradient(to right, var(--bg-panel), var(--bg-main))' }}>
                  <div style={{ 
                    width: '100px', height: '100px', borderRadius: '50%', background: 'var(--bg-tertiary)', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: `3px solid ${measurer.color || 'var(--accent-color)'}`,
                    flexShrink: 0
                  }}>
                    {measurer.avatar_url ? (
                      <img src={measurer.avatar_url} alt={measurer.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <User size={48} color="var(--text-secondary)" />
                    )}
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: '20px', color: 'var(--text-primary)', marginBottom: '8px' }}>
                      {measurer.full_name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                      <MapPin size={14} /> {rName}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      {measurer.phone && (
                         <a href={`tel:${measurer.phone}`} style={{ color: 'var(--text-secondary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }} title="Зателефонувати">
                           <Phone size={16} className="hover-color-accent" />
                         </a>
                      )}
                      {measurer.telegram_id && (
                         <a href={`https://t.me/${measurer.telegram_id.replace('@', '')}`} target="_blank" rel="noreferrer" style={{ color: 'var(--text-secondary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }} title="Telegram">
                           <MessageCircle size={16} className="hover-color-accent" />
                         </a>
                      )}
                      {measurer.email && (
                         <a href={`mailto:${measurer.email}`} style={{ color: 'var(--text-secondary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }} title="Написати">
                           <Mail size={16} className="hover-color-accent" />
                         </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Metrics */}
                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  
                  {/* Top Stats: Chart & Main numbers */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <DonutChart percentage={metrics.oee} size={110} strokeWidth={10} />
                      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>ОЕЕ</span>
                    </div>
                    
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Планові години</span>
                        <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{metrics.plannedHours}г</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Ціль OEE (балів)</span>
                        <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{Math.round(metrics.targetPoints)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-main)', padding: '4px 8px', borderRadius: '6px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>Зароблено балів</span>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-color)' }}>{Math.round(metrics.earnedPoints)}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ width: '100%', height: '1px', background: 'var(--border-color)' }} />
                  
                  {/* Detailed KPIs */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div style={{ background: 'var(--bg-main)', padding: '16px', borderRadius: '12px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Заміряно (кв. м)</div>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{metrics.totalSqm.toFixed(1)} <span style={{fontSize:'12px', fontWeight:500}}>м²</span></div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Еталон: ~{metrics.plannedHours * 2} м²</div>
                    </div>
                    
                    <div style={{ background: 'var(--bg-main)', padding: '16px', borderRadius: '12px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Виконано об'єктів</div>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: '#10b981' }}>{metrics.completed} <span style={{fontSize:'12px', fontWeight:500}}>шт</span></div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>План: {metrics.norm} шт</div>
                    </div>
                    
                    <div style={{ background: 'var(--bg-main)', padding: '16px', borderRadius: '12px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Сер. площа об'єкта</div>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{metrics.avgSqmPerObject} <span style={{fontSize:'12px', fontWeight:500}}>м²</span></div>
                    </div>
                    
                    <div style={{ background: 'var(--bg-main)', padding: '16px', borderRadius: '12px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Конверсія (успіх)</div>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {metrics.fact > 0 ? Math.round((metrics.completed / metrics.fact) * 100) : 0}%
                      </div>
                    </div>
                  </div>

                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* OEE Settings Modal */}
      {isSettingsOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: 'var(--bg-panel)', width: '100%', maxWidth: '600px',
            borderRadius: '16px', border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column',
            maxHeight: '90vh'
          }}>
            <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '20px', color: 'var(--text-primary)' }}>
                <Settings size={24} color="var(--accent-color)" />
                Налаштування розрахунку OEE
              </h2>
              <button onClick={() => setIsSettingsOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }} className="hover-color-accent">
                <X size={24} />
              </button>
            </div>
            
            <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Formula explanation */}
              <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--accent-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-color)', fontWeight: 600 }}>
                  <Info size={18} /> Формула Ідеального Часу (T_ideal) та Балів
                </div>
                <div style={{ fontFamily: 'monospace', background: 'var(--bg-main)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                  T_ideal = T_дорога + T_замір + T_оформлення
                </div>
                <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-secondary)', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li><b>T_дорога:</b> Розраховується системою автоматично для кожного маршруту</li>
                  <li><b>T_замір:</b> [Базовий час] + (кв.м × [Час на 1 кв.м]) + (шт × [Час на 1 елемент]) + C (складність з JSON)</li>
                  <li><b>T_оформлення:</b> [Час оформлення] (робота в AppSheet, фото, документи)</li>
                </ul>
                <div style={{ fontSize: '14px', color: 'var(--text-primary)', marginTop: '4px', background: 'rgba(255,165,0,0.1)', padding: '8px', borderRadius: '4px', borderLeft: '4px solid orange' }}>
                  <b>1 бал = 10 хвилин</b> T_ideal. Вартість замовлення в балах = T_ideal / 10.
                </div>
              </div>

              {/* Settings Form */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>Планові коефіцієнти (хвилини)</h4>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Базовий час на розпаковку (T_base)</label>
                    <input type="number" value={oeeSettings.tBase} onChange={e => setOeeSettings({...oeeSettings, tBase: Number(e.target.value)})} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-primary)', outline: 'none' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Час оформлення (робота в додатку)</label>
                    <input type="number" value={oeeSettings.tPaperwork} onChange={e => setOeeSettings({...oeeSettings, tPaperwork: Number(e.target.value)})} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-primary)', outline: 'none' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Час на площу (хв за 1 кв.м)</label>
                    <input type="number" value={oeeSettings.kArea} onChange={e => setOeeSettings({...oeeSettings, kArea: Number(e.target.value)})} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-primary)', outline: 'none' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Час на деталь (хв за 1 шт)</label>
                    <input type="number" value={oeeSettings.kElement} onChange={e => setOeeSettings({...oeeSettings, kElement: Number(e.target.value)})} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-primary)', outline: 'none' }} />
                  </div>
                </div>

                <h4 style={{ margin: '8px 0 0 0', color: 'var(--text-primary)' }}>Цільові показники</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Норматив OEE балів за 1 робочу годину (макс 6 балів = 60 хв)</label>
                  <input type="number" value={oeeSettings.targetPoints} onChange={e => setOeeSettings({...oeeSettings, targetPoints: Number(e.target.value)})} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-primary)', outline: 'none' }} />
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Місячний план балів обчислюється автоматично: <b>Норматив × Кількість робочих годин</b> замірника.</span>
                </div>

              </div>
            </div>

            <div style={{ padding: '24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: 'var(--bg-tertiary)', borderRadius: '0 0 16px 16px' }}>
              <button onClick={() => setIsSettingsOpen(false)} style={{ padding: '10px 20px', border: '1px solid var(--border-color)', background: 'var(--bg-main)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 600 }}>
                Скасувати
              </button>
              <button 
                onClick={() => {
                  console.log('Saved OEE settings:', oeeSettings);
                  setIsSettingsOpen(false);
                }} 
                style={{ padding: '10px 20px', border: 'none', background: 'var(--accent-color)', color: 'white', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, boxShadow: 'var(--shadow-sm)' }}
                className="hover-lift"
              >
                Зберегти налаштування
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .hover-bg:hover { background: var(--bg-panel) !important; }
        .hover-color-accent:hover { color: var(--accent-color) !important; }
        .analytics-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg) !important; }
        .spinner { border: 3px solid rgba(0,0,0,0.1); width: 36px; height: 36px; border-radius: 50%; border-left-color: var(--accent-color); animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
