import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { Calendar as CalendarIcon, Save, ChevronLeft, ChevronRight, User } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  WORKING: 'var(--accent-success)',
  DAY_OFF: 'var(--text-secondary)',
  VACATION: 'var(--accent-warning)',
  SICK: 'var(--danger-color)'
};

const STATUS_LABELS: Record<string, string> = {
  WORKING: 'Р',
  DAY_OFF: 'В',
  VACATION: 'Вд',
  SICK: 'Л'
};

export function WorkerSchedulesPanel() {
  const [measurers, setMeasurers] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const d = new Date();
    const day = d.getDay(), diff = d.getDate() - day + (day === 0 ? -6 : 1); 
    return new Date(d.setDate(diff));
  });

  useEffect(() => {
    fetchData();
  }, [currentWeekStart]);

  const fetchData = async () => {
    setLoading(true);
    // Fetch measurers
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('role_code', 'MEASURER')
      .order('full_name');
      
    if (profErr) console.error(profErr);
    setMeasurers(profiles || []);

    // Fetch schedules for the current week
    const endOfWeek = new Date(currentWeekStart);
    endOfWeek.setDate(endOfWeek.getDate() + 6);
    
    const startStr = currentWeekStart.toISOString().split('T')[0];
    const endStr = endOfWeek.toISOString().split('T')[0];

    const { data: schedData, error: schedErr } = await supabase
      .from('worker_schedules')
      .select('*')
      .gte('work_date', startStr)
      .lte('work_date', endStr);
      
    if (schedErr) console.error(schedErr);
    setSchedules(schedData || []);
    setLoading(false);
  };

  const getDaysOfWeek = () => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentWeekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const nextWeek = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + 7);
    setCurrentWeekStart(d);
  };

  const prevWeek = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() - 7);
    setCurrentWeekStart(d);
  };

  const toggleSchedule = async (profileId: string, date: Date, currentStatus: string | null) => {
    const dateStr = date.toISOString().split('T')[0];
    
    // Cycle: null (working implicit) -> DAY_OFF -> VACATION -> SICK -> null (delete)
    let newStatus: string | null = 'DAY_OFF';
    if (currentStatus === 'WORKING' || currentStatus === null) newStatus = 'DAY_OFF';
    else if (currentStatus === 'DAY_OFF') newStatus = 'VACATION';
    else if (currentStatus === 'VACATION') newStatus = 'SICK';
    else if (currentStatus === 'SICK') newStatus = null; // delete or set working
    
    // Optimistic update
    const prevSchedules = [...schedules];
    
    if (newStatus === null) {
       setSchedules(prevSchedules.filter(x => !(x.profile_id === profileId && x.work_date === dateStr)));
       await supabase.rpc('delete_worker_schedule', { p_profile_id: profileId, p_work_date: dateStr });
    } else {
       setSchedules(prev => {
         const exists = prev.find(x => x.profile_id === profileId && x.work_date === dateStr);
         if (exists) {
           return prev.map(x => (x.profile_id === profileId && x.work_date === dateStr) ? { ...x, status: newStatus } : x);
         } else {
           return [...prev, { profile_id: profileId, work_date: dateStr, status: newStatus }];
         }
       });
       
       await supabase.rpc('upsert_worker_schedule', {
         p_profile_id: profileId,
         p_work_date: dateStr,
         p_status: newStatus,
         p_start_time: '09:00',
         p_end_time: '18:00'
       });
    }
  };

  const days = getDaysOfWeek();
  const dayNames = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'НД'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '24px', height: '100%', overflowY: 'auto' }}>
      <div>
        <h2 style={{ fontSize: '24px', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CalendarIcon size={24} color="var(--accent-color)" />
          Графіки роботи замірників
        </h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>
          Клікайте по клітинках, щоб змінити статус: Р (Робочий - за замовчуванням), В (Вихідний), Вд (Відпустка), Л (Лікарняний).
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-panel)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
         <button onClick={prevWeek} style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', padding: '8px', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-primary)' }}>
           <ChevronLeft size={20} />
         </button>
         <div style={{ fontWeight: 600, fontSize: '16px', color: 'var(--text-primary)' }}>
            Тиждень: {days[0].toLocaleDateString('uk-UA')} - {days[6].toLocaleDateString('uk-UA')}
         </div>
         <button onClick={nextWeek} style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', padding: '8px', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-primary)' }}>
           <ChevronRight size={20} />
         </button>
      </div>

      <div style={{ background: 'var(--bg-panel)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: 'var(--bg-input)', borderBottom: '1px solid var(--border-color)' }}>
            <tr>
              <th style={{ padding: '16px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '13px' }}>Працівник</th>
              {days.map((d, i) => (
                <th key={i} style={{ padding: '16px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center', borderLeft: '1px solid var(--border-color)' }}>
                  <div>{dayNames[i]}</div>
                  <div style={{ fontSize: '11px', marginTop: '4px' }}>{d.getDate()}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>Завантаження...</td></tr>
            ) : measurers.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>Замірників не знайдено</td></tr>
            ) : (
              measurers.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '16px', fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: m.color_hex || 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                      <User size={16} />
                    </div>
                    {m.full_name}
                  </td>
                  {days.map((d, i) => {
                    const dateStr = d.toISOString().split('T')[0];
                    const sched = schedules.find(s => s.profile_id === m.id && s.work_date === dateStr);
                    const status = sched?.status || 'WORKING';
                    const color = STATUS_COLORS[status];
                    const label = STATUS_LABELS[status];

                    return (
                      <td 
                        key={i} 
                        onClick={() => toggleSchedule(m.id, d, sched?.status || null)}
                        style={{ 
                          padding: '0', 
                          borderLeft: '1px solid var(--border-color)', 
                          textAlign: 'center',
                          cursor: 'pointer',
                          background: status !== 'WORKING' ? `${color}1A` : 'transparent', // 10% opacity
                          transition: 'background 0.2s'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '64px', color, fontWeight: 700, fontSize: '14px' }}>
                          {label}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
