import React, { useState, useEffect } from 'react';
import { MeasurementManagerCalendar } from './MeasurementManagerCalendar';
import { MeasurementManagerAnalytics } from './MeasurementManagerAnalytics';
import { WorkerSchedulesPanel } from '../../WorkerSchedulesPanel';
import { Layers } from 'lucide-react';
import { supabase } from '../../supabase';

interface MeasurementManagerDesktopProps {
  globalRegion: string[];
}

export const MeasurementManagerDesktop: React.FC<MeasurementManagerDesktopProps> = ({ globalRegion }) => {
  const [activeTab, setActiveTab] = useState('Календар');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [measurers, setMeasurers] = useState<any[]>([]);

  useEffect(() => {
    fetchMeasurers();
  }, [refreshTrigger]);

  const fetchMeasurers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, regions(name), branches ( regions ( name ) )')
        .eq('role_code', 'MEASURER')
        .order('full_name');
        
      if (!error && data) {
        setMeasurers(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
      
      {/* Header / Stats Section placeholder */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-panel)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
        <div>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={24} color="var(--accent-color)" />
            Робочий стіл керівника замірників
          </h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            Регіон: <strong>{globalRegion.join(', ')}</strong>
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-main)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          {['Календар', 'Аналітика', 'Графік', 'Appsheet'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === tab ? 'var(--accent-color)' : 'transparent',
                color: activeTab === tab ? '#fff' : 'var(--text-secondary)',
                fontWeight: activeTab === tab ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                fontSize: '14px'
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, minHeight: '600px', display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg-panel)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        {activeTab === 'Календар' ? (
          <MeasurementManagerCalendar 
            refreshTrigger={refreshTrigger}
            globalRegion={globalRegion}
            measurers={measurers}
          />
        ) : activeTab === 'Аналітика' ? (
          <MeasurementManagerAnalytics globalRegion={globalRegion} />
        ) : activeTab === 'Графік' ? (
          <WorkerSchedulesPanel />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', flexDirection: 'column', gap: '16px' }}>
            <Layers size={48} opacity={0.5} />
            <p style={{ fontSize: '16px' }}>Модуль "{activeTab}" знаходиться в розробці</p>
          </div>
        )}
      </div>

    </div>
  );
};
