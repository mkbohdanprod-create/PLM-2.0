import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { Plus, Edit2, Trash2, Check, X } from 'lucide-react';

const PERMISSIONS_LIST = [
  { id: 'view_orders', label: 'Перегляд замовлень' },
  { id: 'edit_orders', label: 'Редагування замовлень' },
  { id: 'schedule_measurements', label: 'Планування замірів (Календар)' },
  { id: 'view_logistics', label: 'Перегляд логістики (Карта)' },
  { id: 'edit_logistics', label: 'Управління логістикою' },
  { id: 'manage_users', label: 'Управління співробітниками' },
  { id: 'manage_roles', label: 'Налаштування ролей' }
];

export function RolesSettings() {
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [editingRole, setEditingRole] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);
  
  const [formData, setFormData] = useState({
    code: '',
    name_ua: '',
    permissions: [] as string[]
  });

  const fetchRoles = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('roles').select('*').order('is_system', { ascending: false }).order('name_ua');
    if (error) setError(error.message);
    else setRoles(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const handleEdit = (role: any) => {
    setEditingRole(role);
    setFormData({
      code: role.code,
      name_ua: role.name_ua,
      permissions: role.permissions || []
    });
    setShowForm(true);
  };

  const handleCreate = () => {
    setEditingRole(null);
    setFormData({
      code: '',
      name_ua: '',
      permissions: []
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.code || !formData.name_ua) {
      alert('Заповніть код та назву ролі');
      return;
    }

    try {
      if (editingRole) {
        const { error } = await supabase.rpc('update_role_permissions', {
          p_code: editingRole.code,
          p_name_ua: formData.name_ua,
          p_permissions: formData.permissions
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('roles')
          .insert([{
            code: formData.code.toUpperCase(),
            name_ua: formData.name_ua,
            is_system: false,
            permissions: formData.permissions
          }]);
        if (error) throw error;
      }
      
      setShowForm(false);
      fetchRoles();
    } catch (err: any) {
      alert('Помилка: ' + err.message);
    }
  };

  const togglePermission = (permId: string) => {
    setFormData(prev => {
      const perms = prev.permissions || [];
      if (perms.includes(permId)) {
        return { ...prev, permissions: perms.filter(p => p !== permId) };
      } else {
        return { ...prev, permissions: [...perms, permId] };
      }
    });
  };

  if (loading) return <div style={{ padding: '24px' }}>Завантаження...</div>;

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2>Налаштування ролей</h2>
        <button className="primary" onClick={handleCreate} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={16} /> Створити роль
        </button>
      </div>
      
      {error && <div style={{ color: 'var(--danger-color)', marginBottom: '16px' }}>{error}</div>}

      <div style={{ background: 'var(--bg-panel)', borderRadius: '8px', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-main)', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
              <th style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>Код</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>Назва</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>Тип</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>Права</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>Дії</th>
            </tr>
          </thead>
          <tbody>
            {roles.map(role => (
              <tr key={role.code} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>{role.code}</td>
                <td style={{ padding: '12px 16px' }}>{role.name_ua}</td>
                <td style={{ padding: '12px 16px' }}>
                  {role.is_system ? (
                    <span style={{ padding: '4px 8px', background: 'var(--bg-main)', borderRadius: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>Системна</span>
                  ) : (
                    <span style={{ padding: '4px 8px', background: 'var(--accent-color)20', borderRadius: '4px', fontSize: '12px', color: 'var(--accent-color)' }}>Користувацька</span>
                  )}
                </td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {(role.permissions || []).length} дозволів
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <button className="secondary" onClick={() => handleEdit(role)} style={{ padding: '6px', minWidth: 'auto' }}>
                    <Edit2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="panel" style={{ width: '100%', maxWidth: '600px', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ margin: 0 }}>{editingRole ? 'Редагувати роль' : 'Нова роль'}</h3>
              <button className="secondary" onClick={() => setShowForm(false)} style={{ padding: '4px', minWidth: 'auto', border: 'none' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>Код ролі (англійською, без пробілів)</label>
                <input 
                  type="text" 
                  value={formData.code} 
                  onChange={e => setFormData({...formData, code: e.target.value.replace(/\s+/g, '_')})} 
                  disabled={!!editingRole}
                  placeholder="Напр. MANAGER"
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: editingRole ? 'var(--bg-main)' : 'var(--bg-input)', color: 'var(--text-primary)' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>Назва (для відображення)</label>
                <input 
                  type="text" 
                  value={formData.name_ua} 
                  onChange={e => setFormData({...formData, name_ua: e.target.value})} 
                  placeholder="Менеджер"
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>

            <h4 style={{ marginBottom: '16px', marginTop: '24px' }}>Права доступу (Permissions)</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '32px' }}>
              {PERMISSIONS_LIST.map(p => {
                const isChecked = formData.permissions.includes(p.id);
                return (
                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '8px', background: isChecked ? 'var(--accent-color)10' : 'var(--bg-main)', borderRadius: '4px', border: `1px solid ${isChecked ? 'var(--accent-color)' : 'var(--border-color)'}` }}>
                    <input 
                      type="checkbox" 
                      checked={isChecked} 
                      onChange={() => togglePermission(p.id)} 
                      style={{ margin: 0 }}
                    />
                    <span style={{ fontSize: '14px' }}>{p.label}</span>
                  </label>
                )
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="secondary" onClick={() => setShowForm(false)}>Скасувати</button>
              <button className="primary" onClick={handleSave}>Зберегти роль</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
