import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { Plus, Trash2, Edit2, Check, X, AlertTriangle } from 'lucide-react';

export interface DurationRule {
  id: string;
  min_sqm: number;
  max_sqm: number;
  duration_mins: number;
  is_custom?: boolean;
}

export function MeasurementDurationSettings() {
  const [rules, setRules] = useState<DurationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [showForm, setShowForm] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<DurationRule>({
    id: '',
    min_sqm: 0,
    max_sqm: 10,
    duration_mins: 120,
    is_custom: false
  });

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'measurement_duration_rules')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data && data.value) {
        setRules(JSON.parse(data.value));
      } else {
        const defaultRules: DurationRule[] = [
          { id: 'r1', min_sqm: 0, max_sqm: 6, duration_mins: 90 },
          { id: 'r2', min_sqm: 6.01, max_sqm: 10, duration_mins: 120 },
          { id: 'r3', min_sqm: 10.01, max_sqm: 15, duration_mins: 240 },
          { id: 'r4', min_sqm: 15.01, max_sqm: 9999, duration_mins: 0, is_custom: true }
        ];
        setRules(defaultRules);
        await saveRulesToDB(defaultRules);
      }
    } catch (err: any) {
      console.error('Error fetching measurement rules:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveRulesToDB = async (newRules: DurationRule[]) => {
    try {
      const sorted = [...newRules].sort((a, b) => a.min_sqm - b.min_sqm);
      const { error } = await supabase
        .from('settings')
        .upsert({ key: 'measurement_duration_rules', value: JSON.stringify(sorted) }, { onConflict: 'key' });
      
      if (error) throw error;
      setRules(sorted);
      return true;
    } catch (err: any) {
      alert('Помилка збереження: ' + err.message);
      return false;
    }
  };

  const handleCreate = () => {
    setFormData({
      id: Math.random().toString(36).substring(7),
      min_sqm: rules.length > 0 ? Math.max(...rules.map(r => r.max_sqm)) + 0.01 : 0,
      max_sqm: 100,
      duration_mins: 120,
      is_custom: false
    });
    setEditingRuleId(null);
    setShowForm(true);
  };

  const handleEdit = (rule: DurationRule) => {
    setFormData({ ...rule });
    setEditingRuleId(rule.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Видалити це правило?')) return;
    const newRules = rules.filter(r => r.id !== id);
    await saveRulesToDB(newRules);
  };

  const handleSave = async () => {
    let newRules = [...rules];
    if (editingRuleId) {
      newRules = newRules.map(r => r.id === editingRuleId ? formData : r);
    } else {
      newRules.push(formData);
    }
    
    if (await saveRulesToDB(newRules)) {
      setShowForm(false);
    }
  };

  if (loading) return <div style={{ padding: '20px' }}>Завантаження...</div>;
  if (error) return <div style={{ padding: '20px', color: 'var(--danger-color)' }}>{error}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-main)' }}>
      <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-panel)' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--text-primary)', fontWeight: 600 }}>Трудозатрати замір</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
            Налаштування тривалості заміру в залежності від площі замовлення (м²).
          </p>
        </div>
        {!showForm && (
          <button 
            onClick={handleCreate}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 500, cursor: 'pointer' }}
          >
            <Plus size={16} /> Додати правило
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
        {showForm ? (
          <div style={{ background: 'var(--bg-panel)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)', maxWidth: '600px' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '16px' }}>
              {editingRuleId ? 'Редагування правила' : 'Нове правило'}
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Від (м²) *</label>
                <input 
                  type="number"
                  step="0.01"
                  value={formData.min_sqm}
                  onChange={e => setFormData({...formData, min_sqm: parseFloat(e.target.value) || 0})}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>До (м²) *</label>
                <input 
                  type="number"
                  step="0.01"
                  value={formData.max_sqm}
                  onChange={e => setFormData({...formData, max_sqm: parseFloat(e.target.value) || 0})}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                />
              </div>
              
              <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                <input 
                  type="checkbox" 
                  id="is_custom"
                  checked={formData.is_custom}
                  onChange={e => setFormData({...formData, is_custom: e.target.checked})}
                />
                <label htmlFor="is_custom" style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Індивідуальний час (встановлюється вручну)</label>
              </div>

              {!formData.is_custom && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Тривалість (хвилин) *</label>
                  <input 
                    type="number"
                    value={formData.duration_mins}
                    onChange={e => setFormData({...formData, duration_mins: parseInt(e.target.value) || 0})}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                  />
                  <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Наприклад: 90 хв (1.5 год), 120 хв (2 год)
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button 
                onClick={handleSave}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                <Check size={16} /> {editingRuleId ? 'Зберегти' : 'Створити'}
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
                  <th style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--text-secondary)' }}>Площа (м²)</th>
                  <th style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--text-secondary)' }}>Тривалість</th>
                  <th style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--text-secondary)', width: '100px', textAlign: 'right' }}>Дії</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: i === rules.length - 1 ? 'none' : '1px solid var(--border-color)' }}>
                    <td style={{ padding: '12px 16px', color: 'var(--text-primary)' }}>
                      Від {r.min_sqm} до {r.max_sqm > 9000 ? '∞' : r.max_sqm} м²
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {r.is_custom ? (
                        <span style={{ color: 'var(--warning-color)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <AlertTriangle size={14} /> Індивідуально
                        </span>
                      ) : (
                        <span>
                          {r.duration_mins} хв ({Math.floor(r.duration_mins / 60)} год {r.duration_mins % 60 > 0 ? `${r.duration_mins % 60} хв` : ''})
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button onClick={() => handleEdit(r)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} title="Редагувати">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDelete(r.id)} style={{ background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer' }} title="Видалити">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rules.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>Немає доданих правил</td>
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
