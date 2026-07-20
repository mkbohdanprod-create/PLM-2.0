import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../supabase';
import { Search, MapPin, User, Calendar, Clock, CheckCircle, Package, Truck, AlertTriangle, Settings, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { generateMesDataForOrder } from '../production/mesMockData'; // Reuse MES mock data

// Full FSM Path order
const FSM_STAGES = [
  { id: 'NEW', label: 'Створено', icon: <Package size={18} /> },
  { id: 'MEASUREMENT_SCHEDULING', label: 'Очікує заміру', icon: <Calendar size={18} /> },
  { id: 'MEASUREMENT_SCHEDULED', label: 'Замір призначено', icon: <Calendar size={18} /> },
  { id: 'MEASUREMENT_COMPLETED', label: 'Замір виконано', icon: <CheckCircle size={18} /> },
  { id: 'ENGINEERING_DESIGN', label: 'Очікує конструктиву', icon: <User size={18} /> },
  { id: 'IN_CONSTRUCT', label: 'В конструктиві', icon: <Settings size={18} /> },
  { id: 'ENGINEERING_NESTING', label: 'Розкрій/Технолог', icon: <User size={18} /> },
  { id: 'CLIENT_APPROVAL', label: 'Погодження з клієнтом', icon: <CheckCircle size={18} /> },
  { id: 'PRODUCTION_QUEUE', label: 'Черга виробництва', icon: <Clock size={18} /> },
  { id: 'IN_PRODUCTION', label: 'У виробництві', icon: <Settings size={18} /> },
  { id: 'PRODUCTION_COMPLETED', label: 'Виготовлено', icon: <Package size={18} /> },
  { id: 'INSTALLATION_SCHEDULING', label: 'Очікує монтажу', icon: <Calendar size={18} /> },
  { id: 'INSTALLATION_SCHEDULED', label: 'Монтаж призначено', icon: <Truck size={18} /> },
  { id: 'COMPLETED', label: 'Завершено', icon: <CheckCircle size={18} /> }
];

const getStageIndex = (status: string) => {
   return FSM_STAGES.findIndex(s => s.id === status);
};

const SettingsIcon = (props: any) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>;

const STAGES_WITH_ICONS = FSM_STAGES.map(s => {
    if (s.id === 'IN_CONSTRUCT' || s.id === 'IN_PRODUCTION') return { ...s, icon: <SettingsIcon size={18} /> };
    return s;
});

// Stepper component for reuse
const HorizontalStepper = ({ order, measurer, engineeringTasks, style }: any) => {
   const [hoveredStage, setHoveredStage] = useState<string | null>(null);
   const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });

   const handleMouseEnter = (e: any, stageId: string) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltipPos({
         top: rect.top - 16,
         left: rect.left + rect.width / 2
      });
      setHoveredStage(stageId);
   };

   return (
      <div className="custom-scrollbar" style={{ padding: '32px 32px 32px 32px', overflowX: 'auto', position: 'relative', width: '100%', ...style }}>
         
         <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', minWidth: 'min-content' }}>
            <div style={{ position: 'absolute', top: '24px', left: '60px', right: '60px', height: '4px', background: 'var(--border-color)', zIndex: 0, borderRadius: '2px' }}></div>
            <div style={{ position: 'absolute', top: '24px', left: '60px', width: `${Math.max(0, (getStageIndex(order.status) / (STAGES_WITH_ICONS.length - 1)) * 100)}%`, height: '4px', background: 'var(--accent-color)', zIndex: 0, borderRadius: '2px', transition: 'width 0.5s ease-out' }}></div>

            {STAGES_WITH_ICONS.map((stage, index) => {
               const currentStageIndex = getStageIndex(order.status);
               const isCompleted = index < currentStageIndex;
               const isCurrent = index === currentStageIndex;
               const isFuture = index > currentStageIndex;
               const isHovered = hoveredStage === stage.id;
               
               if (order.status !== 'CANCELLED' && stage.id === 'CANCELLED') return null;

               let nodeSize = isCurrent ? 64 : 48;
               let nodeColor = isCompleted ? '#10b981' : isCurrent ? '#ffffff' : 'var(--text-secondary)';
               let bgColor = isCompleted ? '#10b981' : isCurrent ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'var(--bg-panel)';
               let borderColor = isCompleted ? '#10b981' : isCurrent ? 'transparent' : 'var(--border-color)';
               let glow = isCurrent ? '0 0 24px rgba(59, 130, 246, 0.6)' : isHovered ? '0 0 12px rgba(0,0,0,0.1)' : 'none';

               let stageData = null;
               if (stage.id === 'MEASUREMENT_SCHEDULED' || stage.id === 'MEASUREMENT_SCHEDULING') {
                   stageData = measurer ? measurer.full_name : null;
               } else if (stage.id.startsWith('ENGINEERING_') || stage.id === 'IN_CONSTRUCT') {
                   const activeTask = engineeringTasks?.find((t: any) => t.status !== 'CANCELLED');
                   stageData = activeTask ? (activeTask.profiles?.full_name || 'Призначено') : null;
               } else if (stage.id === 'IN_PRODUCTION' && isCurrent) {
                   const mes = generateMesDataForOrder(order.id);
                   stageData = `${mes.totalProgress}%, ${mes.currentStageName}`;
               }

               return (
                  <div 
                     key={stage.id} 
                     onMouseEnter={(e) => handleMouseEnter(e, stage.id)}
                     onMouseLeave={() => setHoveredStage(null)}
                     style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '140px', position: 'relative', zIndex: isHovered || isCurrent ? 10 : 1, opacity: isFuture ? 0.6 : 1, flexShrink: 0, cursor: 'pointer' }}
                  >
                     {/* Tooltip via Portal */}
                     {isHovered && createPortal(
                        <div style={{ position: 'fixed', top: tooltipPos.top, left: tooltipPos.left, transform: 'translate(-50%, -100%)', background: 'var(--header-bg)', color: 'white', padding: '12px 16px', borderRadius: '8px', fontSize: '13px', width: 'max-content', minWidth: '160px', maxWidth: '240px', textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 99999, pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                           <div style={{ fontWeight: 700, color: 'var(--accent-light)', fontSize: '14px' }}>{stage.label}</div>
                           {isCompleted && <div style={{ color: '#10b981', fontSize: '11px', fontWeight: 600 }}>✓ Етап пройдено</div>}
                           {isCurrent && <div style={{ color: '#60a5fa', fontSize: '11px', fontWeight: 600 }}>⚡ Поточний етап</div>}
                           {isFuture && <div style={{ color: '#9ca3af', fontSize: '11px' }}>⏳ Очікує виконання</div>}
                           
                           {stageData && (
                              <div style={{ marginTop: '4px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '12px', color: '#e5e7eb' }}>
                                 {stageData}
                              </div>
                           )}
                           
                           {/* Arrow down */}
                           <div style={{ position: 'absolute', bottom: '-4px', left: '50%', transform: 'translateX(-50%) rotate(45deg)', width: '8px', height: '8px', background: 'var(--header-bg)' }}></div>
                        </div>,
                        document.body
                     )}

                     <div style={{ height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                        <div style={{ width: `${nodeSize}px`, height: `${nodeSize}px`, borderRadius: '50%', background: bgColor, border: isCurrent ? 'none' : `2px solid ${borderColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: nodeColor, flexShrink: 0, boxShadow: glow, transform: isHovered ? 'scale(1.15)' : 'scale(1)', transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
                           {isCompleted ? <CheckCircle size={24} /> : stage.icon}
                        </div>
                     </div>
                     <div style={{ textAlign: 'center', padding: '0 8px' }}>
                        <div style={{ fontSize: '13px', fontWeight: isCurrent ? 700 : 600, color: isCurrent || isHovered ? 'var(--accent-color)' : 'var(--text-primary)', lineHeight: '1.2', marginBottom: stageData ? '6px' : '0', transition: 'color 0.2s' }}>
                           {stage.label}
                        </div>
                        {stageData && (
                           <div style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: '12px', display: 'inline-block', lineHeight: '1.4' }}>
                              {stageData}
                           </div>
                        )}
                     </div>
                  </div>
               );
            })}
         </div>
      </div>
   );
};


interface OrderMonitoringBoardProps {
  globalRegion: string[];
  globalSearchQuery?: string;
}

export function OrderMonitoringBoard({ globalRegion, globalSearchQuery }: OrderMonitoringBoardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  
  // State for expanded card
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [engineeringTasks, setEngineeringTasks] = useState<any[]>([]);
  const [measurer, setMeasurer] = useState<any>(null);

  const executeSearch = async (queryToSearch: string) => {
    if (!queryToSearch.trim() || queryToSearch.length < 2) {
      setSearchResults([]);
      setExpandedOrderId(null);
      return;
    }

    setIsSearching(true);
    setExpandedOrderId(null); // Close any expanded cards on new search
    
    const q = `%${queryToSearch}%`;
    const { data } = await supabase
      .from('orders')
      .select('*, order_addresses(city, street, building), order_contacts(full_name, phone)')
      .or(`order_number.ilike.${q},external_id.ilike.${q}`)
      .limit(20);

    setSearchResults(data || []);
    setIsSearching(false);
  };

  const handleSearch = () => executeSearch(searchQuery);

  useEffect(() => {
     if (globalSearchQuery && globalSearchQuery.trim().length >= 2) {
        setSearchQuery(globalSearchQuery);
        executeSearch(globalSearchQuery);
     }
  }, [globalSearchQuery]);

  const toggleOrderDetails = async (order: any) => {
    if (expandedOrderId === order.id) {
        // Collapse
        setExpandedOrderId(null);
        return;
    }
    
    // Expand
    setExpandedOrderId(order.id);
    
    // Fetch who measured it (from planned_calls)
    const { data: calls } = await supabase
      .from('planned_calls')
      .select('assigned_user_id, profiles(full_name)')
      .eq('order_id', order.id)
      .eq('call_type', 'MEASUREMENT')
      .limit(1);
    
    if (calls && calls.length > 0) {
        setMeasurer(calls[0].profiles);
    } else {
        setMeasurer(null);
    }

    // Fetch engineering tasks
    const { data: engTasks } = await supabase
      .from('engineering_tasks')
      .select('*, profiles(full_name)')
      .eq('order_id', order.id);
    
    setEngineeringTasks(engTasks || []);
  };

  return (
    <div className="main-layout" style={{ background: 'var(--bg-main)', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      
      {/* Top Search Bar */}
      <div style={{ padding: '24px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 10, flexShrink: 0 }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '24px', fontWeight: 700 }}>Моніторинг замовлень (Глобальний пошук)</h2>
        <div style={{ position: 'relative', width: '100%', maxWidth: '800px' }}>
          <input
            type="text"
            placeholder="Введіть номер замовлення (напр. ORD-123)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            style={{ width: '100%', padding: '16px 24px 16px 48px', fontSize: '16px', borderRadius: '30px', border: '2px solid var(--accent-color)', background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none' }}
          />
          <Search size={20} color="var(--accent-color)" style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)' }} />
          <button 
             onClick={handleSearch}
             style={{ position: 'absolute', right: '8px', top: '8px', bottom: '8px', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '24px', padding: '0 24px', cursor: 'pointer', fontWeight: 600 }}
          >
             Знайти
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '32px', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)' }}>
        
        {/* Full-width Search Results List */}
        {searchResults.length > 0 && (
           <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <h3 style={{ fontSize: '16px', color: 'var(--text-secondary)', margin: 0, paddingLeft: '8px' }}>Знайдено результатів: {searchResults.length}</h3>
              {searchResults.map(o => {
                 const isExpanded = expandedOrderId === o.id;
                 
                 return (
                 <div key={o.id} style={{ background: 'var(--bg-panel)', border: isExpanded ? '2px solid var(--accent-color)' : '1px solid var(--border-color)', borderRadius: '16px', overflow: 'hidden', boxShadow: isExpanded ? '0 8px 24px rgba(0,0,0,0.1)' : '0 4px 12px rgba(0,0,0,0.05)', transition: 'all 0.3s ease' }}>
                    {/* Header of the card */}
                    <div style={{ padding: '24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none' }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--accent-color)' }}>{o.order_number || o.external_id || 'Без номера'}</h2>
                          <div style={{ display: 'flex', gap: '16px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                             <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><User size={16} /> {o.order_contacts?.[0]?.full_name || 'Клієнт не вказано'}</span>
                             <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><MapPin size={16} /> {o.order_addresses?.[0]?.city || 'Місто не вказано'}</span>
                          </div>
                       </div>
                       <button 
                          onClick={() => toggleOrderDetails(o)}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: isExpanded ? 'var(--accent-color)' : 'var(--accent-light)', color: isExpanded ? 'white' : 'var(--accent-color)', border: 'none', borderRadius: '8px', padding: '10px 20px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                       >
                          {isExpanded ? (
                              <><ChevronUp size={16} /> Згорнути</>
                          ) : (
                              <><ChevronDown size={16} /> Деталі / Паспорт</>
                          )}
                       </button>
                    </div>

                    {/* Expandable Details Section */}
                    {isExpanded && (
                       <div style={{ background: 'var(--bg-tertiary)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '24px', padding: '24px 32px', borderBottom: '1px solid var(--border-color)' }}>
                          <div>
                             <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}><Activity size={14} /> Поточний статус</div>
                             <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--accent-color)' }}>{STAGES_WITH_ICONS.find(s => s.id === o.status)?.label || o.status}</div>
                          </div>
                          <div>
                             <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}><User size={14} /> Контакти</div>
                             <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{o.order_contacts?.[0]?.full_name || 'Не вказано'}</div>
                             <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{o.order_contacts?.[0]?.phone || 'Телефон не вказано'}</div>
                          </div>
                          <div>
                             <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}><MapPin size={14} /> Адреса</div>
                             <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {o.order_addresses?.[0] ? `${o.order_addresses[0].city}, ${o.order_addresses[0].street}, ${o.order_addresses[0].building || ''}` : 'Не вказано'}
                             </div>
                          </div>
                          <div>
                             <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}><Clock size={14} /> Дедлайн</div>
                             {o.target_date ? (
                                <div style={{ fontSize: '15px', fontWeight: 600, color: new Date(o.target_date) < new Date() ? 'var(--danger-color)' : 'var(--text-primary)' }}>
                                   {new Date(o.target_date).toLocaleDateString()}
                                   {new Date(o.target_date) < new Date() && <AlertTriangle size={14} style={{ marginLeft: '8px', verticalAlign: 'middle' }} />}
                                </div>
                             ) : (
                                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)' }}>Не встановлено</div>
                             )}
                          </div>
                       </div>
                    )}

                    {/* Horizontal Stepper */}
                    <HorizontalStepper 
                        order={o} 
                        measurer={isExpanded ? measurer : null} 
                        engineeringTasks={isExpanded ? engineeringTasks : null} 
                        style={{ padding: '24px 32px' }} 
                    />
                 </div>
                 );
              })}
           </div>
        )}
        
        {/* Loading / Empty State */}
        {isSearching && searchResults.length === 0 && (
            <div style={{ marginTop: '24px', color: 'var(--text-secondary)' }}>Завантаження або нічого не знайдено...</div>
        )}

      </div>
    </div>
  );
}
