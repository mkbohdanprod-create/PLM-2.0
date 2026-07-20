import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { OrderCard } from './OrderCard';
import { CalendarPanel } from './CalendarPanel';
import { MapPanel } from './MapPanel';
import { PopoutWindow } from './PopoutWindow';
import { Filter, ExternalLink } from 'lucide-react';

interface LogisticsDesktopProps {
  selectedOrderId: string | null;
  profile: any;
  onRefresh: () => void;
  onSelectOrder: (id: string) => void;
  refreshTrigger: number;
  activeModule: string;
  plannerSettings?: any;
  globalRegion?: string[];
  globalStatus?: string;
  globalType?: string;
}

export function LogisticsDesktop({ onSelectOrder, refreshTrigger, profile, activeModule, selectedOrderId, onRefresh, plannerSettings, globalRegion = ['Всі'], globalStatus = 'Актуальні', globalType = 'Всі' }: LogisticsDesktopProps) {
  const [selectedMapDate, setSelectedMapDate] = useState<Date>(new Date());
  
  const [measurers, setMeasurers] = useState<any[]>([]);
  const [isCalendarPoppedOut, setIsCalendarPoppedOut] = useState(false);
  const [isMapPoppedOut, setIsMapPoppedOut] = useState(false);

  useEffect(() => {
    const fetchMeasurers = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*, regions(name), branches ( regions ( name ) )')
        .eq('role_code', 'MEASURER');
        
      if (data) {
        let filteredMeasurers = data;
        if (!globalRegion.includes('Всі')) {
          filteredMeasurers = filteredMeasurers.filter(m => {
            const rName = m.regions?.name || m.branches?.regions?.name;
            return rName && globalRegion.includes(rName);
          });
        }
        setMeasurers(filteredMeasurers);
      }
    };
    fetchMeasurers();
  }, [globalRegion]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
      {/* Top Half: Calendar */}
      {!isCalendarPoppedOut && (
        <div style={{ flex: '0 0 320px', background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-16)', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-md)', position: 'relative' }}>
          
          <button 
            onClick={() => setIsCalendarPoppedOut(true)}
            style={{ position: 'absolute', top: 12, right: 12, padding: '6px', background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Відкрити календар в окремому вікні"
          >
            <ExternalLink size={16} />
          </button>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <CalendarPanel 
                refreshTrigger={refreshTrigger} 
                onSelectOrder={onSelectOrder} 
                selectedMapDate={selectedMapDate}
                onSelectMapDate={setSelectedMapDate}
                selectedOrderId={selectedOrderId}
                measurers={measurers}
                plannerSettings={plannerSettings}
                globalRegion={globalRegion}
                globalStatus={globalStatus}
                globalType={globalType}
              />
          </div>
        </div>
      )}

      {isCalendarPoppedOut && (
        <PopoutWindow title="Календар Планування" onClose={() => setIsCalendarPoppedOut(false)}>
          <div style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CalendarPanel 
              refreshTrigger={refreshTrigger} 
              onSelectOrder={onSelectOrder} 
              selectedMapDate={selectedMapDate}
              onSelectMapDate={setSelectedMapDate}
              selectedOrderId={selectedOrderId}
              measurers={measurers}
              plannerSettings={plannerSettings}
              globalRegion={globalRegion}
              globalStatus={globalStatus}
              globalType={globalType}
            />
          </div>
        </PopoutWindow>
      )}

      {/* Bottom Half: Split Order Details and Map */}
      <div style={{ flex: '1', display: 'flex', gap: '16px', minHeight: '300px' }}>
        {/* Bottom Left: Order Details */}
        <div style={{ flex: isMapPoppedOut ? '1' : '1 1 50%', background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-16)', overflowY: 'auto', boxShadow: 'var(--shadow-md)' }}>
          {selectedOrderId ? (
            <OrderCard 
              orderId={selectedOrderId} 
              onStatusChanged={onRefresh} 
              profile={profile}
            />
          ) : (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
              Виберіть замовлення зі списку зліва
            </div>
          )}
        </div>

        {/* Bottom Right: Map */}
        {!isMapPoppedOut && (
          <div style={{ flex: '1 1 50%', background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-16)', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-md)', position: 'relative' }}>
            <button 
              onClick={() => setIsMapPoppedOut(true)}
              style={{ position: 'absolute', top: 12, right: 12, padding: '6px', background: 'var(--bg-panel)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-sm)' }}
              title="Відкрити карту в окремому вікні"
            >
              <ExternalLink size={16} />
            </button>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <MapPanel 
                selectedOrderId={selectedOrderId} 
                onSelectOrder={onSelectOrder}
                refreshTrigger={refreshTrigger}
                selectedMapDate={selectedMapDate}
                measurers={measurers}
                globalRegion={globalRegion}
                globalStatus={globalStatus}
                globalType={globalType}
              />
            </div>
          </div>
        )}

        {isMapPoppedOut && (
          <PopoutWindow title="Карта Замірів" onClose={() => setIsMapPoppedOut(false)}>
            <div style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <MapPanel 
                selectedOrderId={selectedOrderId} 
                onSelectOrder={onSelectOrder}
                refreshTrigger={refreshTrigger}
                selectedMapDate={selectedMapDate}
                measurers={measurers}
                globalRegion={globalRegion}
                globalStatus={globalStatus}
                globalType={globalType}
              />
            </div>
          </PopoutWindow>
        )}
      </div>
    </div>
  );
}
