import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { MapPin, Clock, CheckCircle, Activity, Box, Settings, Play } from 'lucide-react';
import { generateMesDataForOrder } from './mesMockData';
import type { ProductionMockData, ProductionStage } from './mesMockData';

interface ProductionBoardProps {
  profile: any;
  globalRegion: string[];
  globalSearchQuery: string;
}

export function ProductionBoard({ profile, globalRegion, globalSearchQuery }: ProductionBoardProps) {
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [mesData, setMesData] = useState<ProductionMockData | null>(null);

  useEffect(() => {
    fetchOrders();
  }, [globalRegion, globalSearchQuery]);

  const fetchOrders = async () => {
    let query = supabase
      .from('orders')
      .select('*, order_addresses(city, street, building), order_contacts(full_name)')
      .in('status', ['PRODUCTION_QUEUE', 'IN_PRODUCTION']);

    // Implement simple global search filtering on client side or DB side.
    const { data } = await query;
    let filtered = data || [];
    
    if (globalSearchQuery) {
        const q = globalSearchQuery.toLowerCase();
        filtered = filtered.filter(o => 
           o.order_number?.toLowerCase().includes(q) || 
           o.external_id?.toLowerCase().includes(q) ||
           o.order_contacts?.[0]?.full_name?.toLowerCase().includes(q)
        );
    }
    
    setOrders(filtered);
    if (!selectedOrder && filtered.length > 0) {
        handleSelectOrder(filtered[0]);
    }
  };

  const handleSelectOrder = (order: any) => {
      setSelectedOrder(order);
      setMesData(generateMesDataForOrder(order.id));
  };

  const formatTime = (mins: number) => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      if (h > 0) return `${h} год ${m} хв`;
      return `${m} хв`;
  };

  return (
    <div className="main-layout" style={{ background: 'var(--bg-main)', display: 'flex', flex: 1, height: '100%' }}>
      
      {/* Sidebar: List of Orders */}
      <div className="panel sidebar" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Виробництво</h3>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Замовлення в роботі (MES)</span>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {orders.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '20px', fontSize: '13px' }}>Немає замовлень на виробництві</div>
          ) : (
            orders.map(o => (
              <div 
                key={o.id}
                onClick={() => handleSelectOrder(o)}
                style={{
                  background: selectedOrder?.id === o.id ? 'var(--bg-secondary)' : 'var(--bg-surface)',
                  border: `1px solid ${selectedOrder?.id === o.id ? 'var(--accent-color)' : 'var(--border-color)'}`,
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '12px',
                  cursor: 'pointer',
                  borderLeft: selectedOrder?.id === o.id ? '4px solid var(--accent-color)' : (o.status === 'IN_PRODUCTION' ? '4px solid #f59e0b' : '4px solid var(--border-color)'),
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {o.order_number || o.external_id || 'Без номера'}
                  </span>
                  <span style={{ fontSize: '11px', color: o.status === 'IN_PRODUCTION' ? '#f59e0b' : 'var(--text-secondary)', fontWeight: 600 }}>
                    {o.status === 'IN_PRODUCTION' ? 'Пиляється' : 'В черзі'}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  {o.order_contacts?.[0]?.full_name || 'Без імені'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Area: Detailed MES Mockup */}
      <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selectedOrder && mesData ? (
          <>
            {/* Header Area */}
            <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <div>
                 <h2 style={{ margin: '0 0 8px 0', fontSize: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Box size={24} color="var(--accent-color)" />
                    {selectedOrder.order_number || selectedOrder.external_id || 'Без номера'}
                 </h2>
                 <div style={{ display: 'flex', gap: '16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                       <MapPin size={14} />
                       {selectedOrder.order_addresses?.[0] ? `${selectedOrder.order_addresses[0].city}, ${selectedOrder.order_addresses[0].street}` : 'Адреса не вказана'}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                       <Activity size={14} color={mesData.totalProgress === 100 ? '#10b981' : '#f59e0b'} />
                       {mesData.totalProgress === 100 ? 'Виготовлено' : 'В процесі'}
                    </span>
                 </div>
               </div>

               <div style={{ textAlign: 'right' }}>
                 <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Залишилось часу</div>
                 <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                    <Clock size={20} color="var(--accent-color)" />
                    {formatTime(mesData.totalTimeRemainingMinutes)}
                 </div>
               </div>
            </div>

            {/* Content Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: 'var(--bg-main)' }}>
               
               {/* Big Progress Bar */}
               <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                     <span style={{ fontSize: '14px', fontWeight: 600 }}>Загальний прогрес виробництва</span>
                     <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-color)' }}>{mesData.totalProgress}%</span>
                  </div>
                  <div style={{ height: '12px', background: 'var(--bg-secondary)', borderRadius: '6px', overflow: 'hidden' }}>
                     <div style={{ 
                        height: '100%', 
                        width: `${mesData.totalProgress}%`, 
                        background: 'linear-gradient(90deg, var(--accent-color), #34d399)',
                        transition: 'width 1s ease-in-out'
                     }} />
                  </div>
               </div>

               {/* Stages Grid */}
               <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>Технологічний маршрут</h3>
               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                  {mesData.stages.map((stage: ProductionStage, index: number) => {
                     const isCompleted = stage.status === 'COMPLETED';
                     const isActive = stage.status === 'IN_PROGRESS';
                     
                     return (
                        <div 
                           key={stage.id}
                           style={{
                              background: 'var(--bg-surface)',
                              border: `1px solid ${isActive ? 'var(--accent-color)' : 'var(--border-color)'}`,
                              borderRadius: '12px',
                              padding: '16px',
                              position: 'relative',
                              overflow: 'hidden',
                              boxShadow: isActive ? '0 0 0 2px rgba(59, 130, 246, 0.2)' : 'none',
                              opacity: stage.status === 'PENDING' ? 0.6 : 1
                           }}
                        >
                           {/* Step number badge */}
                           <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '60px', fontWeight: 800, color: 'var(--text-secondary)', opacity: 0.1, lineHeight: 1 }}>
                             {index + 1}
                           </div>

                           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                 {isCompleted ? <CheckCircle size={20} color="#10b981" /> : isActive ? <Settings size={20} color="var(--accent-color)" className="spin-animation" /> : <Play size={20} color="var(--text-secondary)" />}
                                 <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>{stage.name}</h4>
                              </div>
                              <span style={{ 
                                 fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px',
                                 background: isCompleted ? 'rgba(16, 185, 129, 0.1)' : isActive ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-secondary)',
                                 color: isCompleted ? '#10b981' : isActive ? 'var(--accent-color)' : 'var(--text-secondary)'
                              }}>
                                 {isCompleted ? 'Виконано' : isActive ? 'В роботі' : 'Очікує'}
                              </span>
                           </div>

                           {/* Stage Progress */}
                           <div style={{ height: '6px', background: 'var(--bg-secondary)', borderRadius: '3px', overflow: 'hidden', marginBottom: '12px' }}>
                              <div style={{ height: '100%', width: `${stage.progress}%`, background: isCompleted ? '#10b981' : 'var(--accent-color)' }} />
                           </div>

                           <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
                              <span>Витрачено: {formatTime(stage.timeElapsedMinutes)}</span>
                              <span>Залишилось: {formatTime(stage.timeRemainingMinutes)}</span>
                           </div>
                        </div>
                     );
                  })}
               </div>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
            Оберіть замовлення зліва для перегляду статусу виробництва
          </div>
        )}
      </div>

      <style>{`
        .spin-animation {
          animation: spin 3s linear infinite;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
