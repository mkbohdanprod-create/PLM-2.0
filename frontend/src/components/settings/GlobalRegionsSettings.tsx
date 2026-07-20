import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { Plus, Edit2, Trash2, MapPin, Globe, Building } from 'lucide-react';

export function GlobalRegionsSettings({ activeTab }: { activeTab: 'regions' | 'branches' }) {
  const [regions, setRegions] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Forms state
  const [editingRegion, setEditingRegion] = useState<{ id: string, name: string } | null>(null);
  const [editingBranch, setEditingBranch] = useState<{ id: string, name: string, region_id: string } | null>(null);
  
  const [isAddingRegion, setIsAddingRegion] = useState(false);
  const [newRegionName, setNewRegionName] = useState('');

  const [isAddingBranch, setIsAddingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchRegionId, setNewBranchRegionId] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [regRes, braRes] = await Promise.all([
      supabase.from('regions').select('*').order('name'),
      supabase.from('branches').select('*').order('name')
    ]);
    if (regRes.data) setRegions(regRes.data);
    if (braRes.data) setBranches(braRes.data);
    setLoading(false);
  };

  const handleSaveRegion = async () => {
    if (editingRegion) {
      if (!editingRegion.name.trim()) return;
      await supabase.rpc('update_region', { p_id: editingRegion.id, p_name: editingRegion.name });
      setEditingRegion(null);
    } else if (isAddingRegion) {
      if (!newRegionName.trim()) return;
      await supabase.rpc('create_region', { p_name: newRegionName });
      setIsAddingRegion(false);
      setNewRegionName('');
    }
    fetchData();
  };

  const handleDeleteRegion = async (id: string) => {
    if (branches.some(b => b.region_id === id)) {
      alert('Неможливо видалити регіон, доки в ньому є філії!');
      return;
    }
    if (confirm('Ви впевнені, що хочете видалити цей регіон?')) {
      await supabase.rpc('hide_region', { p_id: id });
      fetchData();
    }
  };

  const handleSaveBranch = async () => {
    if (editingBranch) {
      if (!editingBranch.name.trim()) return;
      await supabase.rpc('update_branch', { p_id: editingBranch.id, p_name: editingBranch.name, p_region_id: editingBranch.region_id || null });
      setEditingBranch(null);
    } else if (isAddingBranch) {
      if (!newBranchName.trim()) return;
      await supabase.rpc('create_branch', { p_name: newBranchName, p_region_id: newBranchRegionId || null });
      setIsAddingBranch(false);
      setNewBranchName('');
      setNewBranchRegionId('');
    }
    fetchData();
  };

  const handleDeleteBranch = async (id: string) => {
    if (confirm('Ви впевнені, що хочете видалити цю філію? (Переконайтесь, що до неї не прив\'язані замовлення або працівники)')) {
      const { error } = await supabase.rpc('hide_branch', { p_id: id });
      if (error) {
        alert('Помилка видалення: Можливо до філії прив\'язані замовлення або працівники.');
      } else {
        fetchData();
      }
    }
  };

  if (loading) return <div style={{ padding: '20px', color: 'var(--text-secondary)' }}>Завантаження...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeTab === 'regions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setIsAddingRegion(true); setNewRegionName(''); }}
                style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'var(--accent-color)', color: 'white', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Plus size={16} /> Додати регіон
              </button>
            </div>

            {isAddingRegion && (
              <div style={{ padding: '16px', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', gap: '12px' }}>
                <input
                  autoFocus
                  value={newRegionName}
                  onChange={e => setNewRegionName(e.target.value)}
                  placeholder="Назва нового регіону"
                  style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-panel)', color: 'var(--text-primary)' }}
                />
                <button onClick={handleSaveRegion} style={{ padding: '8px 16px', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Зберегти</button>
                <button onClick={() => setIsAddingRegion(false)} style={{ padding: '8px 16px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer' }}>Скасувати</button>
              </div>
            )}

            {regions.map(region => {
              const regionBranches = branches.filter(b => b.region_id === region.id);
              const isEditingThisRegion = editingRegion?.id === region.id;
              
              return (
                <div key={region.id} style={{ border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', background: 'var(--bg-secondary)', borderBottom: regionBranches.length > 0 ? '1px solid var(--border-color)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {isEditingThisRegion ? (
                      <div style={{ display: 'flex', gap: '8px', flex: 1, marginRight: '16px' }}>
                        <input
                          autoFocus
                          value={editingRegion.name}
                          onChange={e => setEditingRegion({ ...editingRegion, name: e.target.value })}
                          style={{ flex: 1, padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-panel)', color: 'var(--text-primary)' }}
                        />
                        <button onClick={handleSaveRegion} style={{ padding: '6px 12px', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Зберегти</button>
                        <button onClick={() => setEditingRegion(null)} style={{ padding: '6px 12px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}>Скасувати</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>{region.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-input)', padding: '2px 8px', borderRadius: '12px' }}>
                          {regionBranches.length} філій
                        </div>
                      </div>
                    )}

                    {!isEditingThisRegion && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => setEditingRegion({ id: region.id, name: region.name })} style={{ padding: '6px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDeleteRegion(region.id)} style={{ padding: '6px', background: 'transparent', border: 'none', color: 'var(--danger-color)', cursor: 'pointer' }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                  {regionBranches.length > 0 && (
                    <div style={{ padding: '12px 16px', background: 'var(--bg-panel)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {regionBranches.map(branch => (
                        <div key={branch.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '14px', padding: '6px 0' }}>
                          <MapPin size={14} />
                          <span>{branch.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'branches' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setIsAddingBranch(true); setNewBranchName(''); setNewBranchRegionId(''); }}
                style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'var(--accent-color)', color: 'white', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Plus size={16} /> Додати філію
              </button>
            </div>

            {isAddingBranch && (
              <div style={{ padding: '16px', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', gap: '12px', alignItems: 'center' }}>
                <MapPin size={18} style={{ color: 'var(--text-secondary)' }} />
                <input
                  autoFocus
                  value={newBranchName}
                  onChange={e => setNewBranchName(e.target.value)}
                  placeholder="Назва нової філії"
                  style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-panel)', color: 'var(--text-primary)' }}
                />
                <select
                  value={newBranchRegionId}
                  onChange={e => setNewBranchRegionId(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-panel)', color: 'var(--text-primary)' }}
                >
                  <option value="">-- Без регіону --</option>
                  {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <button onClick={handleSaveBranch} style={{ padding: '8px 16px', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Зберегти</button>
                <button onClick={() => setIsAddingBranch(false)} style={{ padding: '8px 16px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer' }}>Скасувати</button>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {branches.map(branch => {
                const isEditingThisBranch = editingBranch?.id === branch.id;
                const parentRegion = regions.find(r => r.id === branch.region_id);
                
                if (isEditingThisBranch) {
                  return (
                    <div key={branch.id} style={{ padding: '12px', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--accent-color)', display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <MapPin size={16} style={{ color: 'var(--text-secondary)' }} />
                      <input
                        autoFocus
                        value={editingBranch.name}
                        onChange={e => setEditingBranch({ ...editingBranch, name: e.target.value })}
                        style={{ flex: 1, padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-panel)', color: 'var(--text-primary)' }}
                      />
                      <select
                        value={editingBranch.region_id || ''}
                        onChange={e => setEditingBranch({ ...editingBranch, region_id: e.target.value })}
                        style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-panel)', color: 'var(--text-primary)' }}
                      >
                        <option value="">-- Без регіону --</option>
                        {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      <button onClick={handleSaveBranch} style={{ padding: '6px 12px', background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Зберегти</button>
                      <button onClick={() => setEditingBranch(null)} style={{ padding: '6px 12px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}>Скасувати</button>
                    </div>
                  );
                }

                return (
                  <div key={branch.id} style={{ padding: '12px 16px', background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-primary)' }}>
                      <MapPin size={16} style={{ color: 'var(--accent-color)' }} />
                      <span style={{ fontWeight: 500 }}>{branch.name}</span>
                      {parentRegion ? (
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: '12px' }}>
                          Регіон: {parentRegion.name}
                        </span>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--danger-color)', background: 'rgba(239, 68, 68, 0.1)', padding: '2px 8px', borderRadius: '12px' }}>
                          Без регіону
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => setEditingBranch({ id: branch.id, name: branch.name, region_id: branch.region_id })} style={{ padding: '6px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDeleteBranch(branch.id)} style={{ padding: '6px', background: 'transparent', border: 'none', color: 'var(--danger-color)', cursor: 'pointer', opacity: 0.7 }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
