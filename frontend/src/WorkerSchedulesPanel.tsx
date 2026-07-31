import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';
import { ChevronLeft, ChevronRight, Settings, Check, X, Filter, Copy, Download } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  WORKING: '#d1fae5', // light green from prototype
  VACATION: '#fef08a', // yellow
  SICK: '#fecaca',    // red
  DAY_OFF_OWN: '#e5e7eb', // gray
  DAY_OFF: '#f3f4f6' // light gray for planned day off
};

const STATUS_LABELS: Record<string, string> = {
  WORKING: 'Робочий',
  VACATION: 'Відпустка',
  SICK: 'Лікарняний',
  DAY_OFF_OWN: 'За свій рахунок / Прогул',
  DAY_OFF: 'Вихідний'
};

interface Profile {
  id: string;
  full_name: string;
  role_code: string;
  roles?: { name_ua: string };
  regions?: { name: string };
  branches?: { regions?: { name: string } };
}

interface ScheduleRecord {
  id: string;
  profile_id: string;
  work_date: string; // YYYY-MM-DD
  start_time: string | null;
  end_time: string | null;
  status: string;
  comment?: string;
}

export function WorkerSchedulesPanel() {
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [regions, setRegions] = useState<{id: string, name: string}[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  
  // Day Menu State
  const [activeCell, setActiveCell] = useState<{ profileId: string, date: string, x: number, y: number } | null>(null);
  
  // Generator State
  const [generatorProfile, setGeneratorProfile] = useState<Profile | null>(null);

  useEffect(() => {
    fetchData();
  }, [currentMonth]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Regions
      const { data: regionsData } = await supabase.from('regions').select('id, name');
      if (regionsData) setRegions(regionsData);

      // Fetch Profiles & Roles (Only MEASURERS)
      const { data: profData, error: profErr } = await supabase
        .from('profiles')
        .select('id, full_name, role_code, roles(name_ua), regions(name), branches(regions(name))')
        .eq('role_code', 'MEASURER')
        .order('full_name');
        
      if (profErr) throw profErr;
      setProfiles(profData || []);

      // Fetch Schedules for current month
      const startStr = currentMonth.toISOString().split('T')[0];
      const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
      const endStr = new Date(nextMonth.getTime() - 1).toISOString().split('T')[0];

      const { data: schedData, error: schedErr } = await supabase
        .from('worker_schedules')
        .select('*')
        .gte('work_date', startStr)
        .lte('work_date', endStr);

      if (schedErr) throw schedErr;
      setSchedules(schedData || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const formatMonthYear = (date: Date) => {
    const months = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  const getScheduleForCell = (profileId: string, day: number) => {
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return schedules.find(s => s.profile_id === profileId && s.work_date === dateStr);
  };

  const handleCellClick = (e: React.MouseEvent, profileId: string, day: number) => {
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setActiveCell({ profileId, date: dateStr, x: rect.left, y: rect.bottom });
  };

  const closeMenu = () => setActiveCell(null);

  const updateSchedule = async (profileId: string, date: string, status: string, start?: string, end?: string) => {
    const newRecord = {
      profile_id: profileId,
      work_date: date,
      status: status,
      start_time: start || '00:00:00',
      end_time: end || '00:00:00'
    };

    // Optimistic update
    setSchedules(prev => {
      const filtered = prev.filter(s => !(s.profile_id === profileId && s.work_date === date));
      return [...filtered, { ...newRecord, id: 'temp' } as any];
    });

    closeMenu();

    const { error } = await supabase.from('worker_schedules').upsert(newRecord, { onConflict: 'profile_id,work_date' });
    if (error) {
      console.error(error);
      fetchData(); // rollback
    }
  };

  const clearSchedule = async (profileId: string, date: string) => {
    setSchedules(prev => prev.filter(s => !(s.profile_id === profileId && s.work_date === date)));
    closeMenu();
    
    await supabase.from('worker_schedules').delete().match({ profile_id: profileId, work_date: date });
  };

  const updateScheduleRange = async (profileId: string, startDate: string, endDate: string, status: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start > end) return;

    const recordsToUpsert: any[] = [];
    
    let currentDate = new Date(start);
    while (currentDate <= end) {
      recordsToUpsert.push({
        profile_id: profileId,
        work_date: currentDate.toISOString().split('T')[0],
        status: status,
        start_time: '00:00:00',
        end_time: '00:00:00'
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Optimistic update
    setSchedules(prev => {
      const datesToReplace = recordsToUpsert.map(r => r.work_date);
      const filtered = prev.filter(s => !(s.profile_id === profileId && datesToReplace.includes(s.work_date)));
      return [...filtered, ...recordsToUpsert.map(r => ({...r, id: 'temp_'+r.work_date})) as any];
    });

    closeMenu();

    const { error } = await supabase.from('worker_schedules').upsert(recordsToUpsert, { onConflict: 'profile_id,work_date' });
    if (error) {
      console.error(error);
      fetchData(); // rollback
    }
  };

  // Filter profiles by region
  const filteredProfiles = profiles.filter(p => {
    if (selectedRegion === 'all') return true;
    const regionName = p.regions?.name || p.branches?.regions?.name;
    return regionName === selectedRegion;
  });

  return (
    <div style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)', color: 'var(--text-main)', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Header Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-panel)', borderRadius: '8px', border: '1px solid var(--border-color)', padding: '4px' }}>
            <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><ChevronLeft size={20} color="var(--text-secondary)" /></button>
            <span style={{ minWidth: '120px', textAlign: 'center', fontWeight: 500 }}>{formatMonthYear(currentMonth)}</span>
            <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><ChevronRight size={20} color="var(--text-secondary)" /></button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-panel)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <Filter size={16} color="var(--text-secondary)" />
            <select value={selectedRegion} onChange={e => setSelectedRegion(e.target.value)} style={{ background: 'none', border: 'none', color: 'var(--text-main)', outline: 'none' }}>
              <option value="all">Всі відділи</option>
              {regions.map(r => (
                <option key={r.id} value={r.name}>{r.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-main)', cursor: 'pointer' }}>
            <Copy size={16} /> Копіювати з минулого місяця
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'var(--accent-color)', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer' }}>
            <Download size={16} /> Експорт в Excel
          </button>
        </div>
      </div>

      {/* Main Table Container */}
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-panel)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Завантаження графіків...</div>
        ) : (
          <table style={{ width: '100%', minWidth: '1600px', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--bg-panel)', padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', width: '250px' }}>Співробітник</th>
                {daysArray.map(day => {
                  const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  return (
                    <th key={day} style={{ padding: '8px 4px', textAlign: 'center', borderBottom: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', color: isWeekend ? 'var(--accent-warning)' : 'var(--text-secondary)', minWidth: '40px' }}>
                      {day}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filteredProfiles.map(profile => (
                <tr key={profile.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--bg-panel)', padding: '8px 16px', borderRight: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{profile.full_name.split(' ')[0]} {profile.full_name.split(' ')[1] || ''}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{profile.roles?.name_ua || profile.role_code}</div>
                      </div>
                      <button onClick={() => setGeneratorProfile(profile)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}>
                        <Settings size={14} />
                      </button>
                    </div>
                  </td>
                  {daysArray.map(day => {
                    const schedule = getScheduleForCell(profile.id, day);
                    const isWorking = schedule?.status === 'WORKING';
                    
                    let bg = 'transparent';
                    let text = '';
                    
                    if (schedule) {
                      bg = STATUS_COLORS[schedule.status] || 'transparent';
                      if (isWorking) {
                        text = `${schedule.start_time?.substring(0,2) || '08'} - ${schedule.end_time?.substring(0,2) || '17'}`;
                      } else {
                        text = STATUS_LABELS[schedule.status] || schedule.status;
                      }
                    }

                    return (
                      <td 
                        key={day} 
                        onClick={(e) => handleCellClick(e, profile.id, day)}
                        style={{ 
                          borderRight: '1px solid var(--border-color)', 
                          background: bg,
                          cursor: 'pointer',
                          position: 'relative'
                        }}
                      >
                        {text && (
                          <div style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)', margin: '0 auto', padding: '4px 0', fontSize: '11px', fontWeight: 500, color: '#1f2937', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {text}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Popover Menu */}
      {activeCell && (
        <DayMenuPopover 
          activeCell={activeCell} 
          onClose={closeMenu} 
          onUpdate={updateSchedule} 
          onUpdateRange={updateScheduleRange}
          onClear={clearSchedule} 
          currentSchedule={getScheduleForCell(activeCell.profileId, parseInt(activeCell.date.split('-')[2]))}
        />
      )}

      {/* Generator Modal */}
      {generatorProfile && (
        <GeneratorModal 
          profile={generatorProfile} 
          currentMonth={currentMonth}
          onClose={() => setGeneratorProfile(null)} 
          onGenerate={async (records: any[]) => {
            setLoading(true);
            await supabase.from('worker_schedules').upsert(records, { onConflict: 'profile_id,work_date' });
            await fetchData();
            setGeneratorProfile(null);
          }}
        />
      )}
    </div>
  );
}

// Subcomponents

function DayMenuPopover({ activeCell, onClose, onUpdate, onUpdateRange, onClear, currentSchedule }: any) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [customHours, setCustomHours] = useState('08:00 - 17:00');
  
  // Range state
  const [rangeMode, setRangeMode] = useState<string | null>(null);
  const [endDate, setEndDate] = useState(activeCell.date);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Adjust position to stay on screen
  let top = activeCell.y;
  let left = activeCell.x;
  if (top > window.innerHeight - 300) top = activeCell.y - 300; // open upwards if at bottom

  if (rangeMode) {
    return (
      <div ref={menuRef} style={{ position: 'fixed', top, left, zIndex: 100, background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', width: '260px', padding: '12px', color: '#1f2937', fontSize: '13px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}>
          <span style={{ fontWeight: 600 }}>Діапазон: {STATUS_LABELS[rangeMode]}</span>
          <button onClick={() => setRangeMode(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={16} /></button>
        </div>
        
        <div style={{ marginBottom: '8px' }}>
          <span style={{ color: '#6b7280', fontSize: '12px' }}>З: </span>
          <strong>{activeCell.date}</strong>
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', color: '#6b7280', fontSize: '12px', marginBottom: '4px' }}>По (включно):</label>
          <input 
            type="date" 
            value={endDate}
            min={activeCell.date}
            onChange={e => setEndDate(e.target.value)}
            style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px' }}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setRangeMode(null)} style={{ flex: 1, padding: '8px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', color: '#374151' }}>
            Назад
          </button>
          <button onClick={() => onUpdateRange(activeCell.profileId, activeCell.date, endDate, rangeMode)} style={{ flex: 1, padding: '8px', background: '#3b82f6', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#fff', fontWeight: 500 }}>
            Зберегти
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={menuRef} style={{ position: 'fixed', top, left, zIndex: 100, background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', width: '220px', padding: '8px 0', color: '#1f2937', fontSize: '13px' }}>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: '12px' }}>
        Зміна на {activeCell.date}
      </div>
      
      <div style={{ padding: '4px 0' }}>
        {[
          { label: '08:00 - 17:00', type: 'WORKING', start: '08:00', end: '17:00' },
          { label: '08:00 - 20:00', type: 'WORKING', start: '08:00', end: '20:00' },
          { label: '09:00 - 18:00', type: 'WORKING', start: '09:00', end: '18:00' }
        ].map(opt => (
          <div key={opt.label} onClick={() => onUpdate(activeCell.profileId, activeCell.date, opt.type, opt.start, opt.end)} style={{ padding: '8px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }} className="hover-bg-gray">
            {opt.label}
          </div>
        ))}
      </div>
      
      <div style={{ padding: '4px 0', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' }}>
        {[
          { label: 'Відпустка', type: 'VACATION' },
          { label: 'Лікарняний', type: 'SICK' },
          { label: 'За свій рахунок', type: 'DAY_OFF_OWN' },
          { label: 'Вихідний', type: 'DAY_OFF' }
        ].map(opt => (
          <div key={opt.label} onClick={() => setRangeMode(opt.type)} style={{ padding: '8px 16px', cursor: 'pointer' }} className="hover-bg-gray">
            {opt.label}
          </div>
        ))}
      </div>
      
      <div onClick={() => onClear(activeCell.profileId, activeCell.date)} style={{ padding: '8px 16px', cursor: 'pointer', color: '#ef4444' }} className="hover-bg-gray">
        Очистити
      </div>

      <div style={{ padding: '8px 16px', borderTop: '1px solid #e5e7eb' }}>
        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Власні години або коментар:</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <input 
            type="text" 
            value={customHours} 
            onChange={e => setCustomHours(e.target.value)} 
            style={{ width: '100%', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '12px' }}
          />
          <button 
            onClick={() => {
              const [start, end] = customHours.split('-').map(s => s.trim());
              onUpdate(activeCell.profileId, activeCell.date, 'WORKING', start || '08:00', end || '17:00');
            }}
            style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', padding: '0 8px', cursor: 'pointer' }}
          >
            <Check size={14} />
          </button>
        </div>
      </div>
      <style>{`
        .hover-bg-gray:hover { background-color: #f3f4f6; }
      `}</style>
    </div>
  );
}

function GeneratorModal({ profile, currentMonth, onClose, onGenerate }: any) {
  const [pattern, setPattern] = useState('5/2');
  const [hours, setHours] = useState('08:00 - 17:00');
  const [startDateStr, setStartDateStr] = useState(`${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-01`);

  const handleGenerate = () => {
    const [workDays, offDays] = pattern.split('/').map(Number);
    const [startH, endH] = hours.split('-').map(s => s.trim());
    
    const cycleLength = workDays + offDays;
    
    const records = [];
    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    
    // Parse start date to calculate offset
    const cycleStart = new Date(startDateStr);
    
    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
      
      // Days difference from cycle start
      const diffTime = currentDate.getTime() - cycleStart.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays < 0) continue;
      
      const cycleIndex = diffDays % cycleLength;
      
      const isWorkDay = cycleIndex < workDays;
      
      if (isWorkDay) {
        records.push({
          profile_id: profile.id,
          work_date: `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          status: 'WORKING',
          start_time: startH + ':00',
          end_time: endH + ':00'
        });
      } else {
        records.push({
          profile_id: profile.id,
          work_date: `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          status: 'DAY_OFF',
          start_time: '00:00:00',
          end_time: '00:00:00'
        });
      }
    }
    
    onGenerate(records);
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-panel)', padding: '24px', borderRadius: '12px', width: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0 }}>Генератор графіка</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={20} /></button>
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Шаблон розкладу:</label>
          <select value={pattern} onChange={e => setPattern(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '14px' }}>
            <option value="5/2">5/2 (5 робочих, 2 вихідних)</option>
            <option value="2/2">2/2</option>
            <option value="3/3">3/3</option>
            <option value="1/3">1/3 (доба через три)</option>
            <option value="6/1">6/1</option>
          </select>
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Робочі години:</label>
          <input type="text" value={hours} onChange={e => setHours(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '14px' }} />
        </div>
        
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Дата початку (відлік циклу):</label>
          <input type="date" value={startDateStr} onChange={e => setStartDateStr(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '14px' }} />
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-main)', cursor: 'pointer' }}>
            Скасувати
          </button>
          <button onClick={handleGenerate} style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Check size={16} /> Проставити графік
          </button>
        </div>
      </div>
    </div>
  );
}
