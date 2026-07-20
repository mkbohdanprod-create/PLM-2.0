import React, { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { Plus, X, Search as SearchIcon, MapPin, Save, Check } from 'lucide-react';
import Map, { Marker, NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

interface CreateOrderFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  profile?: any;
}

export function CreateOrderForm({ onSuccess, onCancel }: CreateOrderFormProps) {
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Form State
  const [branchId, setBranchId] = useState('');
  const [orderType, setOrderType] = useState('FULL_CYCLE');
  const [deliveryMethod, setDeliveryMethod] = useState('DELIVERY');
  const [externalId, setExternalId] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [street, setStreet] = useState('');
  const [building, setBuilding] = useState('');
  const [material, setMaterial] = useState('');
  const [area, setArea] = useState('');
  
  const [lat, setLat] = useState<number | null>(50.4501);
  const [lng, setLng] = useState<number | null>(30.5234);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [documentDate, setDocumentDate] = useState('');
  const [baseReadinessDate, setBaseReadinessDate] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [calcReadinessDate, setCalcReadinessDate] = useState('');

  useEffect(() => {
    fetchBranches();
  }, []);

  const fetchBranches = async () => {
    const { data } = await supabase.from('branches').select('id, name');
    if (data) {
      setBranches(data);
      if (data.length > 0) setBranchId(data[0].id);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchId) {
      setError('Виберіть філію');
      return;
    }
    
    setLoading(true);
    setError('');

    const { data, error: rpcError } = await supabase.rpc('create_order', {
      p_external_id: externalId,
      p_branch_id: branchId,
      p_order_type: orderType,
      p_full_name: fullName,
      p_phone: phone,
      p_city: city,
      p_street: street || null,
      p_building: building || null,
      p_material: material || null,
      p_area: area ? parseFloat(area) : null,
      p_lat: lat,
      p_lng: lng,
      p_force: false,
      p_document_date: documentDate || null,
      p_base_readiness_date: baseReadinessDate || null,
      p_payment_date: paymentDate || null,
      p_calc_readiness_date: calcReadinessDate || null,
      p_delivery_method: deliveryMethod
    });

    if (rpcError) {
      if (rpcError.message === 'DUPLICATES_FOUND') {
         setError('Увага: знайдено схожі замовлення! Підтвердіть створення.');
         // TODO: add "force create" flow for duplicates
      } else {
         setError(rpcError.message);
      }
      setLoading(false);
      return;
    }

    onSuccess();
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=ua&accept-language=uk&addressdetails=1`);
      const data = await res.json();
      setSearchResults(data);
    } catch (err) {
      console.error(err);
    }
    setIsSearching(false);
  };

  const handleSelectLocation = (loc: any) => {
    setLat(parseFloat(loc.lat));
    setLng(parseFloat(loc.lon));
    
    if (loc.address) {
      const parsedCity = loc.address.city || loc.address.town || loc.address.village || loc.address.state;
      const parsedStreet = loc.address.road || loc.address.pedestrian || loc.address.suburb;
      const parsedBuilding = loc.address.house_number;
      
      if (parsedCity) setCity(parsedCity);
      if (parsedStreet) setStreet(parsedStreet);
      if (parsedBuilding) setBuilding(parsedBuilding);
    } else {
      const parts = loc.display_name.split(',').map((p: string) => p.trim());
      if (parts.length > 0 && !city) setCity(parts[0]);
    }
    setSearchQuery(loc.display_name);
    setSearchResults([]);
  };

  return (
    <div style={{
      margin: '0 auto',
      background: 'var(--bg-panel)', width: '100%', maxWidth: '900px',
      borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      border: '1px solid var(--border-color)'
    }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: 'var(--text-primary)' }}>
          <Plus size={20} style={{ color: 'var(--accent-color)' }} />
          Нове замовлення
        </h2>
        <button onClick={onCancel} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', color: 'var(--text-secondary)' }}><X size={20} /></button>
      </div>

      <div style={{ display: 'flex', flex: 1 }}>
        {/* Form Side */}
        <form onSubmit={handleSubmit} style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', borderRight: '1px solid var(--border-color)' }}>
          {error && (
            <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger-color)', borderRadius: '6px', fontSize: '14px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Пошук адреси об'єкта (Етап 3)</label>
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0 12px' }}>
                  <SearchIcon size={16} style={{ color: 'var(--text-secondary)' }} />
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
                    placeholder="Введіть адресу та натисніть Enter..." 
                    style={{ padding: '8px 12px', border: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: '14px', width: '100%', outline: 'none' }} 
                  />
                  <button type="button" onClick={handleSearch} disabled={isSearching} style={{ background: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}>
                    {isSearching ? '...' : 'Пошук'}
                  </button>
                </div>
                {searchResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '6px', marginTop: '4px', zIndex: 10, maxHeight: '200px', overflowY: 'auto', boxShadow: 'var(--shadow-md)' }}>
                    {searchResults.map((res: any, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => handleSelectLocation(res)}
                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid var(--border-color)' }}
                        className="table-row-hover"
                      >
                        {res.display_name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Номер з 1С (external_id)</label>
              <input type="text" value={externalId} onChange={e => setExternalId(e.target.value)} required placeholder="Вставте номер" style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '14px' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Клієнт (ПІБ або Назва)</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} required placeholder="Іванов І.І." style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '14px' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Телефон</label>
              <input type="text" value={phone} onChange={e => setPhone(e.target.value)} required placeholder="+380..." style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '14px' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Філія</label>
              <select value={branchId} onChange={e => setBranchId(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '14px' }}>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Тип замовлення</label>
              <select value={orderType} onChange={e => setOrderType(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '14px' }}>
                <option value="FULL_CYCLE">Повний цикл</option>
                <option value="BY_DRAWING">По кресленню</option>
                <option value="NO_INSTALLATION">Без монтажу</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Логістика</label>
              <select value={deliveryMethod} onChange={e => setDeliveryMethod(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '14px' }}>
                <option value="DELIVERY">Доставка</option>
                <option value="PICKUP">Самовивіз</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Місто</label>
              <input type="text" value={city} onChange={e => setCity(e.target.value)} required placeholder="Київ" style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '14px' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Вулиця та Будинок (Опціонально)</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="text" value={street} onChange={e => setStreet(e.target.value)} placeholder="Хрещатик" style={{ flex: 2, padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '14px' }} />
                <input type="text" value={building} onChange={e => setBuilding(e.target.value)} placeholder="10A" style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '14px' }} />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Специфікація (Опціонально)</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="text" value={material} onChange={e => setMaterial(e.target.value)} placeholder="Матеріал (Граніт, Кварц...)" style={{ flex: 2, padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '14px' }} />
                <input type="number" value={area} onChange={e => setArea(e.target.value)} placeholder="Площа (м²)" style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '14px' }} />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', gridColumn: '1 / -1', marginTop: '8px', paddingTop: '16px', borderTop: '1px dashed var(--border-color)' }}>
              <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Планові та зовнішні дати (Опціонально)</label>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Дата оформлення (1С)</label>
                  <input type="date" value={documentDate} onChange={e => setDocumentDate(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '14px' }} />
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Дата готовності по базі</label>
                  <input type="date" value={baseReadinessDate} onChange={e => setBaseReadinessDate(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '14px' }} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Дата оплати</label>
                  <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '14px' }} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Розрахункова дата готовності</label>
                  <input type="date" value={calcReadinessDate} onChange={e => setCalcReadinessDate(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '14px' }} />
                </div>
              </div>
            </div>

          </div>

          <div style={{ marginTop: 'auto', paddingTop: '24px', display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <button type="button" onClick={onCancel} style={{ padding: '10px 24px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', fontWeight: 500, cursor: 'pointer' }}>
              Скасувати
            </button>
            <button type="submit" disabled={loading} style={{ padding: '10px 24px', borderRadius: '6px', border: 'none', background: 'var(--accent-primary)', color: 'white', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Save size={18} />
              Створити
            </button>
          </div>
        </form>
        
        {/* Placeholder for Map Side */}
        <div style={{ flex: 1, background: 'var(--bg-secondary)', position: 'relative' }}>
          {lat && lng ? (
             <Map
               longitude={lng}
               latitude={lat}
               zoom={14}
               mapStyle={MAP_STYLE}
               style={{ width: '100%', height: '100%' }}
             >
               <NavigationControl position="top-right" />
               <Marker longitude={lng} latitude={lat}>
                 <MapPin size={36} fill="var(--accent-color)" color="white" />
               </Marker>
             </Map>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: '40px', textAlign: 'center', height: '100%' }}>
               <MapPin size={48} style={{ color: 'var(--text-secondary)', opacity: 0.5, marginBottom: '16px' }} />
               <h3 style={{ color: 'var(--text-primary)', margin: '0 0 8px 0' }}>Модуль Карти</h3>
               <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0, lineHeight: 1.5 }}>
                 Знайдіть адресу, щоб вона відобразилась на карті.
               </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
