import { useState, useEffect, useRef } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { isPaused } from './utils/orderStages';
import Map, { Marker, NavigationControl, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { supabase } from './supabase';
import { MapPin } from 'lucide-react';

interface MapPanelProps {
  selectedOrderId: string | null;
  onSelectOrder: (id: string) => void;
  refreshTrigger: number;
  selectedMapDate?: Date;
  measurers?: any[];
  globalRegion?: string[];
  globalStatus?: string;
  globalType?: string;
}

const MAP_STYLE_GOOGLE = {
  version: 8,
  sources: {
    'google': {
      type: 'raster',
      tiles: [
        'https://mt0.google.com/vt/lyrs=m&hl=uk&x={x}&y={y}&z={z}',
        'https://mt1.google.com/vt/lyrs=m&hl=uk&x={x}&y={y}&z={z}',
        'https://mt2.google.com/vt/lyrs=m&hl=uk&x={x}&y={y}&z={z}'
      ],
      tileSize: 256
    }
  },
  layers: [
    {
      id: 'google',
      type: 'raster',
      source: 'google',
      minzoom: 0,
      maxzoom: 22
    }
  ]
};
const MAP_STYLE_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const DEFAULT_CENTER = { lat: 50.4501, lng: 30.5234 }; // Kyiv

const REGION_CENTERS: Record<string, {lat: number, lng: number, zoom: number}> = {
  'Всі': { lat: 48.3794, lng: 31.1656, zoom: 5 },
  'Київ': { lat: 50.4501, lng: 30.5234, zoom: 10 },
  'Центр': { lat: 50.4501, lng: 30.5234, zoom: 10 },
  'Захід': { lat: 49.8397, lng: 24.0297, zoom: 10 },
  'Варшава': { lat: 52.2297, lng: 21.0122, zoom: 10 },
  'Південь': { lat: 46.4825, lng: 30.7233, zoom: 10 }
};

const REGION_BASES: Record<string, {lat: number, lng: number}> = {
  'Київ': { lat: 50.4501, lng: 30.5234 },
  'Центр': { lat: 50.4501, lng: 30.5234 },
  'Захід': { lat: 49.8397, lng: 24.0297 },
  'Варшава': { lat: 52.2297, lng: 21.0122 },
  'Південь': { lat: 46.4825, lng: 30.7233 }
};

export function MapPanel({ selectedOrderId, onSelectOrder, refreshTrigger, selectedMapDate, measurers = [], globalRegion = ['Всі'], globalStatus = 'Актуальні', globalType = 'Всі' }: MapPanelProps) {
  const [filterMeasurerId, setFilterMeasurerId] = useState<string>(() => sessionStorage.getItem('map_filterMeasurerId') || 'ALL');
  const [filterStatus, setFilterStatus] = useState<string>(() => sessionStorage.getItem('map_filterStatus') || 'ALL');

  useEffect(() => {
    sessionStorage.setItem('map_filterMeasurerId', filterMeasurerId);
    sessionStorage.setItem('map_filterStatus', filterStatus);
  }, [filterMeasurerId, filterStatus]);
  const [theme, setTheme] = useState(document.documentElement.getAttribute('data-theme') || 'light');
  const [orders, setOrders] = useState<any[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<any[]>([]);
  const [viewState, setViewState] = useState({
    longitude: DEFAULT_CENTER.lng,
    latitude: DEFAULT_CENTER.lat,
    zoom: 11
  });
  
  const [routeSegments, setRouteSegments] = useState<any[]>([]);
  const [routeSequence, setRouteSequence] = useState<Record<string, number>>({});
  const [baseMarkers, setBaseMarkers] = useState<{lat: number, lng: number, name: string}[]>([]);

  const mapRef = useRef<any>(null);

  useEffect(() => {
    // Just use the first selected region for map center if 'Всі' is not selected, or fallback
    let centerRegion = 'Всі';
    if (!globalRegion.includes('Всі') && globalRegion.length > 0) {
      centerRegion = globalRegion[0];
    }
    const center = REGION_CENTERS[centerRegion] || DEFAULT_CENTER;
    setViewState(prev => ({
      ...prev,
      longitude: center.lng,
      latitude: center.lat,
      zoom: center.zoom
    }));
  }, [globalRegion]);

  useEffect(() => {
    fetchOrdersWithLocations();
    
    // Listen to theme changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme') {
          setTheme(document.documentElement.getAttribute('data-theme') || 'light');
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true });
    
    return () => observer.disconnect();
  }, [refreshTrigger, globalRegion, globalStatus, globalType]);

  const fetchOrdersWithLocations = async () => {
    try {
      const { data, error } = await supabase
      .from('orders')
      .select(`
        id, 
        order_number,
        external_id, 
        status, 
        order_type,
        is_incomplete,
        order_addresses (lat, lng, city, street, building),
        order_contacts (full_name, phone),
        measurement_tasks (measurer_id, scheduled_date, start_time, end_time, outcome, profiles ( color )),
        branches ( regions (name) )
      `)
      .in('status', ['MEASUREMENT_SCHEDULING', 'MEASUREMENT_SCHEDULED', 'PAUSED'])
      .eq('is_hidden', false);
      
    if (!error && data) {
      let fetchedOrders = data;
      
      // Apply global filters
      if (!globalRegion.includes('Всі')) {
        fetchedOrders = fetchedOrders.filter(o => {
          const rName = o.branches?.regions?.name;
          return rName && globalRegion.includes(rName);
        });
      }
      
      if (globalStatus !== 'Всі' && globalStatus !== 'Актуальні') {
        if (globalStatus === 'На паузі') {
          fetchedOrders = fetchedOrders.filter(o => isPaused(o.status));
        }
      }
      
      if (globalType !== 'Всі') {
        if (globalType === 'По кресленню') {
          fetchedOrders = fetchedOrders.filter(o => o.order_type === 'BY_DRAWING');
        } else if (globalType === 'Повний цикл') {
          fetchedOrders = fetchedOrders.filter(o => o.order_type === 'FULL_CYCLE');
        } else if (globalType === 'Без монтажу') {
          fetchedOrders = fetchedOrders.filter(o => o.order_type === 'NO_INSTALLATION');
        }
      }

      // Filter out orders without coordinates
      const withCoords = fetchedOrders.filter(o => o.order_addresses?.[0]?.lat && o.order_addresses?.[0]?.lng)
        .map(o => {
          const activeTasks = o.measurement_tasks?.filter((t: any) => t.outcome === 'SCHEDULED' || t.outcome === 'IN_PROGRESS') || [];
          let assignedColor = null;
          if (activeTasks.length > 0) {
            const task = activeTasks[0];
            if (task?.profiles?.color) assignedColor = task.profiles.color;
          }
          return {
            id: o.id,
            external_id: o.external_id,
            order_number: o.order_number,
            order_type: o.order_type,
            status: o.status,
            lat: parseFloat(o.order_addresses[0].lat),
            lng: parseFloat(o.order_addresses[0].lng),
            addressStr: `${o.order_addresses[0].city || ''}, ${o.order_addresses[0].street || ''}, ${o.order_addresses[0].building || ''}`.replace(/^[,\s]+|[,\s]+$/g, ''),
            color: assignedColor,
            measurement_tasks: activeTasks
          };
        });
      setOrders(withCoords);
    }
    } catch (err) {
      console.error('Error in fetchOrdersWithLocations:', err);
    }
  };

  useEffect(() => {
    let result = orders.filter(o => {
      // Always show selected order, regardless of other filters
      if (o.id === selectedOrderId) return true;

      // Always show new/unassigned orders without tasks
      const isNewOrder = o.status === 'MEASUREMENT_SCHEDULING' && (!o.measurement_tasks || o.measurement_tasks.length === 0);
      if (isNewOrder) return true;

      // Filter by map status
      if (filterStatus !== 'ALL') {
        if (filterStatus === 'ONLY_SELECTED_DATE') {
          if (!selectedMapDate) return false;
          const dateStr = selectedMapDate.toISOString().split('T')[0];
          if (!o.measurement_tasks || !o.measurement_tasks.some((t: any) => t.scheduled_date === dateStr)) return false;
        } else if (filterStatus === 'PRELIMINARY') {
          if (o.status !== 'MEASUREMENT_SCHEDULING') return false;
        } else if (filterStatus === 'SCHEDULED') {
          if (o.status !== 'MEASUREMENT_SCHEDULED') return false;
        } else if (filterStatus === 'PAUSED') {
          if (!isPaused(o.status)) return false;
        }
      }

      // Filter by measurer
      if (filterMeasurerId !== 'ALL') {
        if (filterMeasurerId === 'unassigned') {
           if (o.measurement_tasks?.[0]?.measurer_id) return false;
        } else {
           if (o.measurement_tasks?.[0]?.measurer_id !== filterMeasurerId) return false;
        }
      }

      return true;
    });

    setFilteredOrders(result);
  }, [orders, filterMeasurerId, filterStatus, refreshTrigger, globalRegion, globalStatus, globalType, selectedMapDate, selectedOrderId]);

  // Fly to selected order when it changes
  useEffect(() => {
    if (selectedOrderId && mapRef.current) {
      const order = orders.find(o => o.id === selectedOrderId);
      if (order && order.lat && order.lng) {
        mapRef.current.flyTo({
          center: [order.lng, order.lat],
          duration: 1000
        });
      }
    }
  }, [selectedOrderId, orders]);

  useEffect(() => {
    if (filteredOrders.length > 0) {
      buildRoutes();
    } else {
      setRouteSegments([]);
    }
  }, [filteredOrders, selectedMapDate, refreshTrigger]);

  const buildRoutes = async () => {
    try {
      if (!selectedMapDate) return;
      const dateStr = selectedMapDate.toISOString().split('T')[0];

      const { data } = await supabase
        .from('measurement_tasks')
        .select('measurer_id, order_id, profiles(color, base_lat, base_lng, branches(name, lat, lng, regions(name))), orders!inner(is_hidden, order_addresses(lat, lng))')
        .eq('scheduled_date', dateStr)
        .in('outcome', ['SCHEDULED', 'IN_PROGRESS'])
        .eq('orders.is_hidden', false)
        .order('start_time', { ascending: true });
        
      if (data && data.length > 0) {
        // Group by measurer and build sequence
        const grouped: Record<string, { points: string[], color: string, region: string | null, baseLat?: number, baseLng?: number, branchName?: string }> = {};
        const newSequence: Record<string, number> = {};
        const counters: Record<string, number> = {};

        data.forEach(t => {
          if (!t.measurer_id) return;
          if (filterMeasurerId !== 'ALL' && t.measurer_id !== filterMeasurerId) return;
          
          if (!grouped[t.measurer_id]) {
            const regionName = t.profiles?.branches?.regions?.name || null;
            const branchName = t.profiles?.branches?.name || 'База';
            const baseLat = t.profiles?.base_lat || t.profiles?.branches?.lat;
            const baseLng = t.profiles?.base_lng || t.profiles?.branches?.lng;

            grouped[t.measurer_id] = { points: [], color: t.profiles?.color || '#3b82f6', region: regionName, baseLat, baseLng, branchName };
            counters[t.measurer_id] = 1;
          }
          
          // Assign sequence number
          if (t.order_id) {
            newSequence[t.order_id] = counters[t.measurer_id]++;
          }

          const coords = t.orders?.order_addresses?.[0];
          if (coords && coords.lat && coords.lng) {
            grouped[t.measurer_id].points.push(`${coords.lng},${coords.lat}`);
          }
        });
        
        const uniqueBases: {lat: number, lng: number, name: string}[] = [];
        Object.values(grouped).forEach(g => {
          if (g.baseLat && g.baseLng && !uniqueBases.some(b => b.lat === g.baseLat && b.lng === g.baseLng)) {
            uniqueBases.push({ lat: g.baseLat, lng: g.baseLng, name: g.branchName || 'База' });
          }
        });
        setBaseMarkers(uniqueBases);
        setRouteSequence(newSequence);

      const newSegments: any[] = [];

      for (const mId of Object.keys(grouped)) {
        const { points, color } = grouped[mId];
        const allPoints = [...points];

        if (allPoints.length > 1) {
          for (let i = 0; i < allPoints.length - 1; i++) {
            const coords = `${allPoints[i]};${allPoints[i+1]}`;
            try {
              const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
              const json = await res.json();
              if (json.routes && json.routes.length > 0) {
                const route = json.routes[0];
                const geometry = route.geometry;
                const duration = route.duration;
                const distance = route.distance;
                const coordsArr = geometry.coordinates;
                const midpoint = coordsArr[Math.floor(coordsArr.length / 2)];
                
                newSegments.push({
                  color,
                  geometry,
                  duration,
                  distance,
                  midpoint,
                  id: `${mId}-${i}`
                });
              }
            } catch (err) {
              console.error('OSRM error', err);
            }
          }
        }
      }

      setRouteSegments(newSegments);
    } else {
      setRouteSegments([]);
      setRouteSequence({});
    }
    } catch (err) {
      console.error('Error in buildRoutes:', err);
    }
  };

  const getPinColor = (order: any) => {
    // If assigned to a measurer, use their personal color
    if (order.color) return order.color;
    
    // If unassigned, fall back to status colors
    const hasTasks = order.measurement_tasks && order.measurement_tasks.length > 0;
    
    if (isPaused(order.status)) return 'var(--danger-color, #ef4444)';
    if (order.status === 'MEASUREMENT_SCHEDULED') return '#8b5cf6'; // purple
    if (order.status === 'MEASUREMENT_SCHEDULING' && hasTasks) return '#eab308'; // yellow (Попередньо заплановано)
    
    // Default (Нове)
    return 'var(--accent-color, #3b82f6)';
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <style>{`
        @keyframes pulse-pin {
          0% { transform: scale(1.2); filter: drop-shadow(0 0 0 rgba(0,0,0,0.5)); }
          50% { transform: scale(1.4); filter: drop-shadow(0 0 8px rgba(0,0,0,0.8)); }
          100% { transform: scale(1.2); filter: drop-shadow(0 0 0 rgba(0,0,0,0.5)); }
        }
      `}</style>
      

      <Map
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapStyle={theme === 'dark' ? MAP_STYLE_DARK : MAP_STYLE_GOOGLE}
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="top-right" />
        {filteredOrders.map(order => {
          const isSelected = order.id === selectedOrderId;
          const tooltipText = `Замовлення: ${order.external_id || order.order_number || 'Без номера'}\nСтатус: ${order.status || 'Невідомо'}\nАдреса: ${order.addressStr || 'Не вказана'}\nТип: ${order.order_type || 'Не вказано'}`;
          return (
            <Marker 
              key={order.id} 
              longitude={order.lng} 
              latitude={order.lat}
              anchor="bottom"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                onSelectOrder(order.id);
              }}
              style={{ cursor: 'pointer', zIndex: isSelected ? 10 : 1 }}
            >
              <div 
                title={tooltipText}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  animation: isSelected ? 'pulse-pin 1.5s infinite' : 'none',
                  transform: isSelected ? 'scale(1.2)' : 'scale(1)',
                  transition: isSelected ? 'none' : 'transform 0.2s, filter 0.2s'
                }}>
                <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', paddingBottom: '4px' }}>
                  {routeSequence[order.id] ? (
                    <div style={{
                      width: '28px',
                      height: '28px',
                      backgroundColor: getPinColor(order),
                      border: '2px solid white',
                      borderRadius: '50% 50% 50% 0',
                      transform: 'rotate(-45deg)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '-2px 2px 4px rgba(0,0,0,0.3)',
                    }}>
                      <span style={{
                        transform: 'rotate(45deg)',
                        color: 'white',
                        fontWeight: 900,
                        fontSize: '13px',
                        lineHeight: 1
                      }}>
                        {routeSequence[order.id]}
                      </span>
                    </div>
                  ) : (
                    <MapPin 
                      size={32} 
                      fill={getPinColor(order)} 
                      color="white" 
                      strokeWidth={1.5}
                      style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}
                    />
                  )}
                </div>
                {isSelected && (
                  <div style={{
                    background: 'var(--bg-surface)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    boxShadow: 'var(--shadow-sm)',
                    fontSize: '11px',
                    fontWeight: 600,
                    marginTop: '2px',
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap'
                  }}>
                    {order.external_id || order.order_number}
                  </div>
                )}
              </div>
            </Marker>
          );
        })}


        {routeSegments.map((segment) => (
          <Source key={`route-src-${segment.id}`} id={`route-src-${segment.id}`} type="geojson" data={{ type: 'Feature', properties: {}, geometry: segment.geometry }}>
            <Layer
              id={`route-layer-${segment.id}`}
              type="line"
              layout={{
                'line-join': 'round',
                'line-cap': 'round'
              }}
              paint={{
                'line-color': ['case', ['boolean', ['feature-state', 'hover'], false], '#2563eb', segment.color || '#2563eb'],
                'line-width': 5,
                'line-opacity': 0.8
              }}
            />
          </Source>
        ))}

        {routeSegments.map((seg) => (
          <Marker 
            key={`marker-${seg.id}`} 
            longitude={seg.midpoint[0]} 
            latitude={seg.midpoint[1]}
            anchor="bottom"
            offset={[0, -5]}
            style={{ zIndex: 5 }}
          >
            <div style={{ position: 'relative' }}>
              <div style={{
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                padding: '4px 8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                fontSize: '12px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                minWidth: '50px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '700', color: '#ea580c' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
                  {Math.round(seg.duration / 60)} хв
                </div>
                <div style={{ color: '#4b5563', fontSize: '11px', fontWeight: '500' }}>
                  {(seg.distance / 1000).toFixed(1)} км
                </div>
              </div>
              <div style={{
                 position: 'absolute',
                 bottom: '-5px',
                 left: '50%',
                 transform: 'translateX(-50%)',
                 width: 0,
                 height: 0,
                 borderLeft: '6px solid transparent',
                 borderRight: '6px solid transparent',
                 borderTop: '6px solid white',
                 filter: 'drop-shadow(0px 2px 1px rgba(0,0,0,0.1))'
              }} />
            </div>
          </Marker>
        ))}
      </Map>

      {/* Map Floating Filters */}
      <div style={{
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 10,
        display: 'flex',
        gap: '8px',
        background: 'var(--bg-panel)',
        padding: '8px',
        borderRadius: '8px',
        boxShadow: 'var(--shadow-md)',
        border: '1px solid var(--border-color)',
        opacity: 0.95
      }}>
        <select 
          value={filterMeasurerId}
          onChange={e => setFilterMeasurerId(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
        >
          <option value="ALL">Всі замірники</option>
          {measurers.map(m => (
            <option key={m.id} value={m.id}>{m.full_name}</option>
          ))}
          <option value="unassigned">Без замірника</option>
        </select>

        <select 
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
        >
          <option value="ALL">Всі на карті</option>
          <option value="ONLY_SELECTED_DATE">Лише на обрану дату ({selectedMapDate ? selectedMapDate.toLocaleDateString('uk-UA') : ''})</option>
          <option value="PRELIMINARY">Усі попередньо заплановані</option>
          <option value="SCHEDULED">Зафіксовані (Замір)</option>
          <option value="PAUSED">На паузі</option>
        </select>
      </div>
    </div>
  );
}
