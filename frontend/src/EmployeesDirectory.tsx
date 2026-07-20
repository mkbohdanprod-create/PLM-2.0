import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { Edit2, Check, X, Shield, MapPin, Map, Palette } from 'lucide-react';

export function EmployeesDirectory() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [editingProfile, setEditingProfile] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);
  
  const [formData, setFormData] = useState({
    role_code: '',
    is_active: false,
    branch_id: '',
    color: '#3b82f6',
    base_lat: '',
    base_lng: '',
    allowed_view_regions: [] as string[],
    allowed_action_regions: [] as string[]
  });

  const fetchData = async () => {
    setLoading(true);
    const [profRes, rolesRes, branchesRes, regionsRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('roles').select('*'),
      supabase.from('branches').select('*'),
      supabase.from('regions').select('*')
    ]);
    
    if (profRes.error) setError(profRes.error.message);
    else setProfiles(profRes.data || []);
    
    if (rolesRes.data) setRoles(rolesRes.data);
    if (branchesRes.data) setBranches(branchesRes.data);
    if (regionsRes.data) setRegions(regionsRes.data);
    
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleEdit = (profile: any) => {
    setEditingProfile(profile);
    setFormData({
      role_code: profile.role_code || '',
      is_active: profile.is_active || false,
      branch_id: profile.branch_id || '',
      region_id: profile.region_id || '',
      color: profile.color || '#3b82f6',
      base_lat: profile.base_lat?.toString() || '',
      base_lng: profile.base_lng?.toString() || '',
      allowed_view_regions: profile.allowed_view_regions || [],
      allowed_action_regions: profile.allowed_action_regions || []
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    try {
      const { error } = await supabase.rpc('update_employee_profile', {
        p_id: editingProfile.id,
        p_role_code: formData.role_code || null,
        p_is_active: formData.is_active,
        p_branch_id: formData.branch_id || null,
        p_region_id: formData.region_id || null,
        p_color: formData.color,
        p_base_lat: formData.base_lat ? parseFloat(formData.base_lat) : null,
        p_base_lng: formData.base_lng ? parseFloat(formData.base_lng) : null,
        p_allowed_view_regions: formData.allowed_view_regions,
        p_allowed_action_regions: formData.allowed_action_regions
      });
        
      if (error) throw error;
      
      setShowForm(false);
      fetchData();
    } catch (err: any) {
      alert('Помилка: ' + err.message);
    }
  };

  const toggleRegion = (regionId: string, type: 'view' | 'action') => {
    setFormData(prev => {
      const key = type === 'view' ? 'allowed_view_regions' : 'allowed_action_regions';
      const arr = prev[key] || [];
      if (arr.includes(regionId)) {
        return { ...prev, [key]: arr.filter(id => id !== regionId) };
      } else {
        return { ...prev, [key]: [...arr, regionId] };
      }
    });
  };

  if (loading) return <div style={{ padding: '24px' }}>Завантаження...</div>;

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2>Співробітники</h2>
      </div>
      
      {error && <div style={{ color: 'var(--danger-color)', marginBottom: '16px' }}>{error}</div>}

      <div style={{ background: 'var(--bg-panel)', borderRadius: '8px', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-main)', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
              <th style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>ПІБ</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>Роль</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>Статус</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>Регіон</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>База (Коорд.)</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>Дії</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map(p => {
              const roleName = roles.find(r => r.code === p.role_code)?.name_ua || 'Не призначено';
              const regionName = regions.find(r => r.id === p.region_id)?.name || 'Не призначено';
              
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: p.color || '#ccc' }} />
                    {p.full_name}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {p.role_code === 'NEW_USER' ? (
                      <span style={{ color: 'var(--danger-color)', fontWeight: 600 }}>Новий користувач</span>
                    ) : (
                      roleName
                    )}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {p.is_active ? (
                      <span style={{ padding: '4px 8px', background: 'var(--success-color)20', color: 'var(--success-color)', borderRadius: '4px', fontSize: '12px' }}>Активний</span>
                    ) : (
                      <span style={{ padding: '4px 8px', background: 'var(--danger-color)20', color: 'var(--danger-color)', borderRadius: '4px', fontSize: '12px' }}>Заблокований</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>{regionName}</td>
                  <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {p.base_lat && p.base_lng ? `${p.base_lat}, ${p.base_lng}` : '-'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <button className="secondary" onClick={() => handleEdit(p)} style={{ padding: '6px', minWidth: 'auto' }}>
                      <Edit2 size={14} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="panel" style={{ width: '100%', maxWidth: '600px', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ margin: 0 }}>Налаштування профілю: {editingProfile?.full_name}</h3>
              <button className="secondary" onClick={() => setShowForm(false)} style={{ padding: '4px', minWidth: 'auto', border: 'none' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}><Shield size={14} style={{display:'inline', verticalAlign:'middle', marginRight:'4px'}}/> Роль</label>
                <select 
                  value={formData.role_code} 
                  onChange={e => setFormData({...formData, role_code: e.target.value})}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                >
                  <option value="">-- Не призначено --</option>
                  {roles.map(r => <option key={r.code} value={r.code}>{r.name_ua} ({r.code})</option>)}
                </select>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '8px', background: formData.is_active ? 'var(--success-color)10' : 'var(--bg-main)', borderRadius: '4px', border: `1px solid ${formData.is_active ? 'var(--success-color)' : 'var(--border-color)'}` }}>
                  <input 
                    type="checkbox" 
                    checked={formData.is_active} 
                    onChange={e => setFormData({...formData, is_active: e.target.checked})} 
                    style={{ margin: 0 }}
                  />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: formData.is_active ? 'var(--success-color)' : 'var(--text-secondary)' }}>
                    {formData.is_active ? 'Акаунт активний' : 'Заблоковано'}
                  </span>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>Регіон</label>
                <select 
                  value={formData.region_id} 
                  onChange={e => setFormData({...formData, region_id: e.target.value})}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                >
                  <option value="">-- Не призначено --</option>
                  {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}><Palette size={14} style={{display:'inline', verticalAlign:'middle', marginRight:'4px'}}/> Колір (для календаря)</label>
                <input 
                  type="color" 
                  value={formData.color} 
                  onChange={e => setFormData({...formData, color: e.target.value})}
                  style={{ width: '100%', height: '36px', padding: '2px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', cursor: 'pointer' }}
                />
              </div>
            </div>

            <h4 style={{ marginBottom: '16px', fontSize: '14px' }}>Регіони (Дозволи)</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              <div>
                <strong style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>Лише перегляд</strong>
                {regions.map(r => (
                  <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '4px' }}>
                    <input type="checkbox" checked={formData.allowed_view_regions.includes(r.id)} onChange={() => toggleRegion(r.id, 'view')} />
                    <span style={{ fontSize: '13px' }}>{r.name}</span>
                  </label>
                ))}
              </div>
              <div>
                <strong style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>Дії та Редагування</strong>
                {regions.map(r => (
                  <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '4px' }}>
                    <input type="checkbox" checked={formData.allowed_action_regions.includes(r.id)} onChange={() => toggleRegion(r.id, 'action')} />
                    <span style={{ fontSize: '13px' }}>{r.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <h4 style={{ marginBottom: '16px', fontSize: '14px' }}><MapPin size={16} style={{display:'inline', verticalAlign:'middle', marginRight:'4px'}}/> Точка виїзду (для маршрутів замірника)</h4>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '32px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>Широта (Lat)</label>
                <input 
                  type="text" 
                  value={formData.base_lat} 
                  onChange={e => setFormData({...formData, base_lat: e.target.value})} 
                  placeholder="50.4500"
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>Довгота (Lng)</label>
                <input 
                  type="text" 
                  value={formData.base_lng} 
                  onChange={e => setFormData({...formData, base_lng: e.target.value})} 
                  placeholder="30.5233"
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="secondary" onClick={() => setShowForm(false)}>Скасувати</button>
              <button className="primary" onClick={handleSave}>Зберегти налаштування</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
