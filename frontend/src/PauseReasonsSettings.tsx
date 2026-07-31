import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { Plus, Edit2, Trash2, Check, X } from 'lucide-react';

export function PauseReasonsSettings() {
  const [reasons, setReasons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [editingReason, setEditingReason] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    is_hidden: false
  });

  const fetchReasons = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('pause_reasons')
      .select('*')
      .order('is_system', { ascending: false })
      .order('name');
      
    if (error) setError(error.message);
    else setReasons(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchReasons();
  }, []);

  const handleEdit = (reason: any) => {
    setEditingReason(reason);
    setFormData({
      name: reason.name,
      is_hidden: reason.is_hidden
    });
    setShowForm(true);
  };

  const handleCreate = () => {
    setEditingReason(null);
    setFormData({
      name: '',
      is_hidden: false
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.name) {
      alert('Вкажіть назву причини паузи');
      return;
    }

    try {
      if (editingReason) {
        const { error } = await supabase
          .from('pause_reasons')
          .update({
            name: formData.name,
            is_hidden: formData.is_hidden
          })
          .eq('id', editingReason.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('pause_reasons')
          .insert([{
            name: formData.name,
            is_hidden: formData.is_hidden,
            is_system: false
          }]);
        if (error) throw error;
      }
      
      setShowForm(false);
      fetchReasons();
    } catch (err: any) {
      alert('Помилка: ' + err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Видалити цю причину? Вона не буде доступна у випадаючому списку.')) return;
    
    const { error } = await supabase
      .from('pause_reasons')
      .delete()
      .eq('id', id);
      
    if (error) {
      if (error.message.includes('foreign key constraint')) {
        alert('Неможливо видалити причину, оскільки вона вже використовується. Ви можете її приховати.');
      } else {
        alert('Помилка: ' + error.message);
      }
    } else {
      fetchReasons();
    }
  };

  if (loading) return <div style={{ padding: '20px' }}>Завантаження...</div>;
  if (error) return <div style={{ padding: '20px', color: 'var(--danger-color)' }}>{error}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-main)' }}>
      {/* Header */}
      <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-panel)' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--text-primary)', fontWeight: 600 }}>Причини паузи</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
            Налаштування причин для призупинення замовлень.
          </p>
        </div>
        {!showForm && (
          <button 
            onClick={handleCreate}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 500, cursor: 'pointer' }}
          >
            <Plus size={16} /> Додати причину
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
        {showForm ? (
          <div style={{ background: 'var(--bg-panel)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)', maxWidth: '600px' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '16px' }}>
              {editingReason ? 'Редагування причини' : 'Нова причина'}
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Назва причини *</label>
                <input 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                />
              </div>



              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input 
                  type="checkbox" 
                  id="is_hidden"
                  checked={formData.is_hidden}
                  onChange={e => setFormData({...formData, is_hidden: e.target.checked})}
                />
                <label htmlFor="is_hidden" style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Приховати зі списку (Архівувати)</label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button 
                onClick={handleSave}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                <Check size={16} /> {editingReason ? 'Зберегти' : 'Створити'}
              </button>
              <button 
                onClick={() => setShowForm(false)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer' }}
              >
                <X size={16} /> Скасувати
              </button>
            </div>
          </div>
        ) : (
          <div style={{ background: 'var(--bg-panel)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--text-secondary)' }}>Назва</th>
                  <th style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--text-secondary)' }}>Статус</th>
                  <th style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--text-secondary)', width: '100px', textAlign: 'right' }}>Дії</th>
                </tr>
              </thead>
              <tbody>
                {reasons.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: i === reasons.length - 1 ? 'none' : '1px solid var(--border-color)' }}>
                    <td style={{ padding: '12px 16px', color: 'var(--text-primary)' }}>
                      {r.name} {r.is_system && <span style={{ fontSize: '10px', background: 'var(--bg-input)', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px' }}>SYSTEM</span>}
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      {r.is_hidden ? (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Прихована</span>
                      ) : (
                        <span style={{ color: 'var(--accent-color)', fontSize: '12px' }}>Активна</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button onClick={() => handleEdit(r)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} title="Редагувати">
                          <Edit2 size={16} />
                        </button>
                        {!r.is_system && (
                          <button onClick={() => handleDelete(r.id)} style={{ background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer' }} title="Видалити">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {reasons.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>Немає доданих причин</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
