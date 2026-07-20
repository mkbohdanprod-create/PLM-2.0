import { useState, useEffect } from 'react';
import { Settings, X, Clock, Layout, Sliders, AlertTriangle, Building, Globe, LayoutTemplate, Plug, MoreHorizontal, ChevronRight, ChevronDown, Users } from 'lucide-react';
import { supabase } from './supabase';

import { GlobalRegionsSettings } from './components/settings/GlobalRegionsSettings';
import { EmployeesDirectory } from './EmployeesDirectory';
import { RolesSettings } from './RolesSettings';

interface SettingsDrawerProps {
  onClose: () => void;
  onSave: (settings: any) => void;
  plannerSettings: any;
}

export function SettingsDrawer({ onClose, onSave, plannerSettings }: SettingsDrawerProps) {
  const [activeCategory, setActiveCategory] = useState('branches');
  
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['global', 'users-group', 'services-group']);
  
  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => 
      prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
    );
  };

  // Зберігаємо старі внутрішні вкладки для 'branches'
  const [branchesTab, setBranchesTab] = useState<'графік' | 'відображення' | 'правила'>('графік');
  
  const [localSettings, setLocalSettings] = useState(plannerSettings);
  const [measurers, setMeasurers] = useState<any[]>([]);

  useEffect(() => {
    const fetchMeasurers = async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, role_code').eq('role_code', 'MEASURER');
      if (data) setMeasurers(data);
    };
    fetchMeasurers();
  }, []);

  const CATEGORIES = [
    { id: 'branches', label: 'Налаштування відділів', icon: Building },
    { id: 'global', label: 'Глобальні налаштування', icon: Globe, isGroup: true, items: [
      { id: 'global-regions', label: 'Регіони' },
      { id: 'global-branches', label: 'Філії' }
    ]},
    { id: 'users-group', label: 'Співробітники та Ролі', icon: Users, isGroup: true, items: [
      { id: 'users-employees', label: 'Співробітники' },
      { id: 'users-roles', label: 'Налаштування ролей' }
    ]},
    { id: 'card', label: 'Налаштування картки', icon: LayoutTemplate },
    { id: 'services-group', label: 'Взаємодія з сервісами', icon: Plug, isGroup: true, items: [
      { id: 'services-mes', label: 'MES' },
      { id: 'services-bom', label: 'BOM' },
      { id: 'services-appsheet', label: 'Appsheet' },
      { id: 'services-production', label: 'Таблиця виробництв' },
      { id: 'services-iwms', label: 'iWms' },
      { id: 'services-1c', label: '1C' },
    ]},
    { id: 'other', label: 'Інше', icon: MoreHorizontal }
  ];

  const renderContent = () => {
    switch (activeCategory) {
      case 'users-employees':
        return <EmployeesDirectory />;
      case 'users-roles':
        return <RolesSettings />;
      case 'global-regions':
        return <GlobalRegionsSettings activeTab="regions" />;
      case 'global-branches':
        return <GlobalRegionsSettings activeTab="branches" />;
      case 'branches':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Внутрішні вкладки для Відділів */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '24px' }}>
              {[
                { id: 'графік', label: 'Графік', icon: Clock },
                { id: 'відображення', label: 'Відображення', icon: Layout },
                { id: 'правила', label: 'Правила', icon: Sliders }
              ].map(tab => {
                const isActive = branchesTab === tab.id;
                return (
                  <button 
                    key={tab.id}
                    onClick={() => setBranchesTab(tab.id as any)}
                    style={{ 
                      padding: '12px 24px', background: 'transparent', border: 'none', 
                      borderBottom: isActive ? '2px solid var(--accent-color)' : '2px solid transparent',
                      color: isActive ? 'var(--accent-color)' : 'var(--text-secondary)',
                      fontWeight: isActive ? 600 : 500,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <tab.icon size={16} />
                    {tab.label}
                  </button>
                )
              })}
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {branchesTab === 'графік' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div style={{ padding: '16px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid var(--accent-warning)', borderRadius: '12px', display: 'flex', gap: '16px' }}>
                    <AlertTriangle size={24} color="var(--accent-warning)" style={{ flexShrink: 0 }} />
                    <div>
                      <h4 style={{ margin: '0 0 8px 0', color: 'var(--accent-warning)', fontSize: '14px' }}>ШІ Аналітика: Ризик колапсу</h4>
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                        Система проаналізувала беклог і відпустки: Наступного тижня очікується на 25% більше нових заявок, при цьому оператор 'Іван' йде у відпустку. 
                        <strong style={{ color: 'var(--accent-warning)' }}> Рекомендовано залучити резервного диспетчера.</strong>
                      </p>
                    </div>
                  </div>

                  <div>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>Налаштування змін операторів (поточний тиждень)</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', color: 'var(--text-primary)' }}>Олексій</h4>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Зміна: 09:00 - 18:00</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Активний</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>KPI: 45 дзвінків / 12 заплановано</div>
                        </div>
                      </div>
                      <div style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', color: 'var(--text-primary)' }}>Петро</h4>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Зміна: 10:00 - 19:00</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-warning)' }}>Лікарняний (з ПТ)</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>KPI: 30 дзвінків / 8 заплановано</div>
                        </div>
                      </div>
                      <div style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', color: 'var(--text-primary)' }}>Іван</h4>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Зміна: Відпустка</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-warning)' }}>Відпустка</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>KPI: 0 / 0</div>
                        </div>
                      </div>
                      <button style={{ padding: '12px', background: 'transparent', border: '1px dashed var(--border-color)', borderRadius: '12px', color: 'var(--text-secondary)', cursor: 'pointer', marginTop: '8px' }}>
                        + Додати відхилення від графіка
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {branchesTab === 'відображення' && (
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center', padding: '40px 0' }}>
                  Налаштування вигляду інтерфейсу будуть додані в наступних оновленнях.
                </div>
              )}
              {branchesTab === 'правила' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '12px' }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', color: 'var(--text-primary)' }}>Формула навантаження</h3>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>Коефіцієнт робочого часу (%)</label>
                        <input 
                          type="number" 
                          min="10" max="100" 
                          value={localSettings.efficiencyCoef} 
                          onChange={e => setLocalSettings({...localSettings, efficiencyCoef: parseInt(e.target.value) || 80})}
                          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-panel)', color: 'var(--text-primary)' }}
                        />
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Враховує обіди та затримки (за замовчуванням 80%)</div>
                      </div>

                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>Час на дорогу за замовчуванням (хв)</label>
                        <input 
                          type="number" 
                          min="0" max="180" 
                          value={localSettings.defaultTravelMins} 
                          onChange={e => setLocalSettings({...localSettings, defaultTravelMins: parseInt(e.target.value) || 20})}
                          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-panel)', color: 'var(--text-primary)' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>Тривалість заміру за замовчуванням (хв)</label>
                        <input 
                          type="number" 
                          min="10" max="240" 
                          value={localSettings.defaultDurationMins} 
                          onChange={e => setLocalSettings({...localSettings, defaultDurationMins: parseInt(e.target.value) || 60})}
                          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-panel)', color: 'var(--text-primary)' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      default:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
            <Settings size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)' }}>Розділ у розробці</h3>
            <p style={{ margin: 0, fontSize: '14px', textAlign: 'center', maxWidth: '300px' }}>
              Налаштування для цього розділу будуть доступні в наступних оновленнях.
            </p>
          </div>
        );
    }
  };

  return (
    <>
      <div 
        onClick={onClose}
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9999 }} 
      />
      <div style={{ 
        position: 'fixed', top: 0, left: 0, bottom: 0, width: '100vw', maxWidth: '100vw',
        background: 'var(--bg-panel)', zIndex: 10000, 
        display: 'flex', flexDirection: 'column', 
        boxShadow: '4px 0 24px rgba(0,0,0,0.15)',
        animation: 'slideIn 0.3s ease-out'
      }}>
        {/* Header */}
        <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div style={{ width: '40px', height: '40px', background: 'var(--accent-color)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
              <Settings size={24} />
            </div>
            <div>
              <h2 style={{ margin: '0 0 4px 0', fontSize: '20px', color: 'var(--text-primary)' }}>Налаштування</h2>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>Конфігурація системи та інтеграції</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <X size={24} />
          </button>
        </div>

        {/* Body (Sidebar + Content) */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          
          {/* Sidebar */}
          <div style={{ width: '260px', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', overflowY: 'auto', background: 'var(--bg-secondary)' }}>
            <div style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {CATEGORIES.map(cat => {
                if (cat.isGroup && cat.items) {
                  const isExpanded = expandedGroups.includes(cat.id);
                  return (
                    <div key={cat.id} style={{ marginBottom: '8px', marginTop: '8px' }}>
                      <div 
                        onClick={() => toggleGroup(cat.id)}
                        style={{ 
                          padding: '10px 12px', 
                          display: 'flex', alignItems: 'center', gap: '12px',
                          color: 'var(--text-secondary)',
                          fontSize: '12px', fontWeight: 600,
                          textTransform: 'uppercase', letterSpacing: '0.5px',
                          cursor: 'pointer', userSelect: 'none'
                        }}
                      >
                        <cat.icon size={16} />
                        <span style={{ flex: 1 }}>{cat.label}</span>
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </div>
                      {isExpanded && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                          {cat.items.map(subItem => {
                            const isActive = activeCategory === subItem.id;
                            return (
                              <button
                                key={subItem.id}
                                onClick={() => setActiveCategory(subItem.id)}
                                style={{
                                  padding: '10px 12px 10px 40px',
                                  background: isActive ? 'var(--accent-color)' : 'transparent',
                                  color: isActive ? 'white' : 'var(--text-primary)',
                                  border: 'none', borderRadius: '6px',
                                  textAlign: 'left', cursor: 'pointer',
                                  fontSize: '14px', fontWeight: isActive ? 600 : 500,
                                  transition: 'all 0.1s'
                                }}
                              >
                                {subItem.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                const isActive = activeCategory === cat.id;
                const Icon = cat.icon as any;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    style={{
                      padding: '10px 12px',
                      background: isActive ? 'var(--accent-color)' : 'transparent',
                      color: isActive ? 'white' : 'var(--text-primary)',
                      border: 'none', borderRadius: '6px',
                      display: 'flex', alignItems: 'center', gap: '12px',
                      cursor: 'pointer', fontSize: '14px', fontWeight: isActive ? 600 : 500,
                      transition: 'all 0.1s'
                    }}
                  >
                    <Icon size={18} />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main Content Area */}
          <div style={{ flex: 1, padding: '24px', overflowY: 'auto', background: 'var(--bg-panel)' }}>
            {renderContent()}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: 'var(--bg-panel)' }}>
          <button 
            onClick={onClose} 
            style={{ padding: '10px 24px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}
          >
            Скасувати
          </button>
          <button 
            onClick={() => onSave(localSettings)} 
            style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: 'var(--accent-color)', color: 'white', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Settings size={16} /> Зберегти
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
