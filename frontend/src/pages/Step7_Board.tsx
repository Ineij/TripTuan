import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileFrame } from '../components/MobileFrame';
import { StatusBar } from '../components/StatusBar';
import { GoMark } from '../components/Atoms';
import { Photo } from '../components/Photo';
import { StreamingStatus } from '../components/StreamingStatus';
import { useApp, type Weather } from '../store';
import type { Scene } from '../types';
import { getBoardState, checkInStation, getWeather, getPreview, getPickerItems, getMicroRecs, getOrder } from '../api';
import type { MicroItem, OrderDraft } from '../api';
import { worldX, worldY, fitZoom, centerWorld, visibleTiles, type LatLng } from '../components/mapProjection';

type Tab = '总览' | 'Day 1' | 'Day 2';
type Drawer = null | 'menu' | 'memo' | 'share' | 'companion' | 'orders' | 'support' | 'settings' | 'trace' | 'weather' | 'fortune' | 'tea' | 'taxi' | 'place' | 'delivery';
type PanelMode = 'normal' | 'trip' | 'map';

interface Todo { id: string; text: string; done: boolean }
interface MapPin { lat: number; lng: number; icon: string; name: string; rating: number; walk: string; tint: string; photoSeed: string; imageUrl?: string; desc: string }
interface RouteStop { lat: number; lng: number; name: string; icon: string; done?: boolean }
interface DeliveryChoice { name: string; desc: string; price: string; seed: string; photo?: string; scene: Scene }
interface BoardItem {
  period: '上午' | '中午' | '下午' | '晚上' | '出发' | '晚餐' | '返程';
  cat: '交通' | '景点' | '美食';
  name: string;
  rating: number;
  duration: string;
  photoSeed: string;
  imageUrl?: string;
  desc: string;
  queue?: '低' | '中' | '高';
  segment?: { walk: string; drive: string; meters: string };
  price?: string;
}

// Thumbnail for a board station: use backend-provided images when available,
// else fall back to a soft emoji tile for self-arranged stops.
const STATION_PLACEHOLDER: Record<BoardItem['cat'], { icon: string; bg: string }> = {
  交通: { icon: '🚄', bg: 'linear-gradient(135deg,#e8f0ff,#d6e4ff)' },
  美食: { icon: '🍽️', bg: 'linear-gradient(135deg,#fff1e6,#ffe2cc)' },
  景点: { icon: '📍', bg: 'linear-gradient(135deg,#eef7ee,#dcefdc)' },
};

function StationThumb({ item }: { item: BoardItem }) {
  if (item.imageUrl) {
    return <Photo seed={item.photoSeed} src={item.imageUrl} width={74} height={74} radius={10} />;
  }
  const ph = STATION_PLACEHOLDER[item.cat] ?? STATION_PLACEHOLDER['景点'];
  return (
    <div
      style={{
        width: 74, height: 74, borderRadius: 10, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 30, background: ph.bg,
      }}
    >
      {ph.icon}
    </div>
  );
}

// OSM tile origins at zoom 12, centred on each scene's POI cluster
const SCENE_TILE_BASE: Record<Scene, { z: number; x: number; y: number }> = {
  sz: { z: 12, x: 3344, y: 1781 },
  bj: { z: 12, x: 3369, y: 1548 },
};

const WEATHER_META: Record<Weather, {
  title: string; temp: string; outfit: string; icon: string; mapIcon: string; bg: string; route: string;
}> = {
  sunny: { title: '晴', temp: '27°', outfit: '短袖 + 防晒帽，补水', icon: '🎐', mapIcon: '🎐', bg: 'rgba(255,255,255,.1)', route: '#3b82f6' },
  rainy: { title: '小雨', temp: '22°', outfit: '长袖 + 防水外套，穿防滑鞋', icon: '💧', mapIcon: '☔', bg: 'rgba(24,39,56,.28)', route: '#60a5fa' },
  snowy: { title: '小雪', temp: '-2°', outfit: '羽绒服 + 围巾手套，雪靴', icon: '⛄', mapIcon: '⛄', bg: 'rgba(255,255,255,.46)', route: '#8ab4ff' },
};

const periodEmoji: Record<BoardItem['period'], string> = {
  出发: '🚄', 上午: '☀️', 中午: '🍴', 下午: '⛅', 晚上: '🌙', 晚餐: '🍽️', 返程: '🏁',
};
const periodColor: Record<BoardItem['period'], string> = {
  出发: '#7c3aed', 上午: '#34d399', 中午: '#fb923c', 下午: '#3b82f6', 晚上: '#7c3aed', 晚餐: '#fb923c', 返程: '#10b981',
};

/** Maps board item name → backend station ID for checkin */
const ITEM_STATION_MAP: Record<string, string> = {};

/** Maps backend station ID → board item name for syncing completed set */
const STATION_ITEM_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(ITEM_STATION_MAP).map(([k, v]) => [v, k]),
);


export default function Step7_Board() {
  const nav = useNavigate();
  const { scene, weather, setWeather, orderId } = useApp();
  const [tab, setTab] = useState<Tab>('总览');
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>('normal');
  const [showNearby, setShowNearby] = useState(false);
  const [focusedPin, setFocusedPin] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<BoardItem | MapPin | null>(null);
  const [deliveryChoice, setDeliveryChoice] = useState<DeliveryChoice | null>(null);
  const [mapHeight, setMapHeight] = useState(330);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [forecastDays, setForecastDays] = useState<{ date: string; cond: string; tempH: number; tempL: number }[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [todoText, setTodoText] = useState('');
  const [loadingTrip, setLoadingTrip] = useState(false);

  // Board data loaded from API
  const [boardDay1, setBoardDay1] = useState<BoardItem[]>([]);
  const [boardDay2, setBoardDay2] = useState<BoardItem[]>([]);
  const [boardPins, setBoardPins] = useState<MapPin[]>([]);
  const [boardRouteStops, setBoardRouteStops] = useState<RouteStop[]>([]);

  useEffect(() => {
    setShowNearby(false);
    const t = window.setTimeout(() => setShowNearby(true), 15000);
    return () => window.clearTimeout(t);
  }, [scene]);

  // Sync real weather from backend
  useEffect(() => {
    getWeather(scene)
      .then((forecast) => {
        setForecastDays(forecast.days);
        const cond = forecast.days[0]?.cond ?? '';
        if (cond.includes('雪')) setWeather('snowy');
        else if (cond.includes('雨')) setWeather('rainy');
        else setWeather('sunny');
      })
      .catch(() => undefined);
  }, [scene]);

  // Load itinerary + POI data from backend
  useEffect(() => {
    let cancelled = false;
    setLoadingTrip(true);
    setBoardDay1([]);
    setBoardDay2([]);
    setBoardPins([]);
    setBoardRouteStops([]);
    Promise.all([getPreview(scene), getPickerItems(scene)])
      .then(([preview, items]) => {
        if (cancelled) return;
        // POI items with lat/lng (API returns them even though type doesn't declare them)
        type PoiWithCoords = { id: string; cat: string; name: string; rating: number;
          subDesc: string; photoSeed: string; imageUrl?: string; lat?: number; lng?: number };
        const pois = items.filter((it) => it.cat !== 'transport') as unknown as PoiWithCoords[];

        // Rating lookup by name
        const ratingMap: Record<string, number> = {};
        for (const p of pois) ratingMap[p.name] = p.rating ?? 0;

        const buildDay = (day: typeof preview.days[number] | undefined): BoardItem[] =>
          (day?.items ?? []).map((it) => ({
            period: it.period as BoardItem['period'],
            cat: (it.cat === '酒店' ? '景点' : it.cat) as BoardItem['cat'],
            name: it.name,
            rating: ratingMap[it.name] || it.rating || 0,
            duration: it.duration,
            photoSeed: it.photoSeed || it.name,
            imageUrl: it.imageUrl,
            desc: it.note ?? '',
            price: it.price || undefined,
            queue: it.queue || undefined,
          }));

        const d1 = buildDay(preview.days[0]);
        const d2 = buildDay(preview.days[1]);
        setBoardDay1(d1);
        setBoardDay2(d2);

        // Map pins from POIs that have coordinates (positioned later by lat/lng)
        const pins: MapPin[] = pois
          .filter((p) => p.lat && p.lng)
          .map((p) => ({
            lat: p.lat!,
            lng: p.lng!,
            icon: p.cat === 'food' ? '🍜' : p.cat === 'hotel' ? '🏨' : '🏛️',
            name: p.name,
            rating: p.rating ?? 0,
            walk: '',
            tint: p.cat === 'food' ? '#fff0e0' : p.cat === 'hotel' ? '#e8f4ff' : '#e8f0ff',
            photoSeed: p.photoSeed || p.name,
            imageUrl: p.imageUrl,
            desc: p.subDesc ?? '',
          }));
        setBoardPins(pins);

        // Route stops in itinerary sequence, skipping transport legs
        const poiByName: Record<string, PoiWithCoords> = {};
        for (const p of pois) if (p.lat && p.lng) poiByName[p.name] = p;

        const stops: RouteStop[] = [...d1, ...d2]
          .filter((it) => it.cat !== '交通' && poiByName[it.name])
          .map((it) => {
            const p = poiByName[it.name];
            return { lat: p.lat!, lng: p.lng!, name: it.name, icon: it.cat === '美食' ? '🍜' : '🏛️', done: false };
          });
        setBoardRouteStops(stops);
        // (MapStage fits & centres the view on these stops itself.)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingTrip(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scene]);

  // Sync completed stations from board state
  useEffect(() => {
    if (!orderId) return;
    getBoardState(orderId)
      .then((state) => {
        const names = state.completedStationIds
          .map((id) => STATION_ITEM_MAP[id])
          .filter(Boolean) as string[];
        if (names.length > 0) {
          setCompleted((prev) => new Set([...prev, ...names]));
        }
      })
      .catch(() => undefined);
  }, [orderId, scene]);

  const weatherMeta = WEATHER_META[weather];
  const pins = useMemo(() => {
    const routeNames = new Set(boardRouteStops.map((s) => s.name));
    const routeCoords = new Set(boardRouteStops.map((s) => `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`));
    return boardPins.filter((p) => (
      !routeNames.has(p.name)
      && !routeCoords.has(`${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
    ));
  }, [boardPins, boardRouteStops]);
  const items = useMemo(() => {
    if (tab === 'Day 1') return boardDay1;
    if (tab === 'Day 2') return boardDay2;
    return [...boardDay1, ...boardDay2];
  }, [tab, boardDay1, boardDay2]);
  const routeStops = useMemo(() => {
    if (tab === '总览') return boardRouteStops;
    const visibleNames = new Set(items.filter((it) => it.cat !== '交通').map((it) => it.name));
    return boardRouteStops.filter((stop) => visibleNames.has(stop.name));
  }, [tab, items, boardRouteStops]);
  const totalStations = Math.max(boardDay1.length + boardDay2.length, 1);
  const doneStations = items.filter((it) => completed.has(it.name)).length;
  const panelDrag = useRef<{ y: number; height: number } | null>(null);
  const clampMapHeight = (value: number) => Math.min(610, Math.max(130, value));
  const updatePanelModeForHeight = (height: number) => {
    if (height <= 180) setPanelMode('trip');
    else if (height >= 520) setPanelMode('map');
    else setPanelMode('normal');
  };
  const setMapHeightWithMode = (height: number) => {
    const next = clampMapHeight(height);
    setMapHeight(next);
    updatePanelModeForHeight(next);
  };

  const openPlace = (place: BoardItem | MapPin) => {
    setSelectedPlace(place);
    setDrawer('place');
  };

  return (
    <MobileFrame>
      <StatusBar bg="#fff" />

      <div style={{ height: 50, display: 'flex', alignItems: 'center', padding: '0 14px', background: '#fff', flexShrink: 0, gap: 8 }}>
        <button onClick={() => nav('/p6')} style={circleButtonStyle}>‹</button>
        <button onClick={() => setDrawer('trace')} style={{ flex: 1, height: 32, borderRadius: 999, background: 'var(--mt-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13.5, fontWeight: 700 }}>
          <GoMark size={20} />
          <span>小go旅迹</span>
        </button>
        <button onClick={() => setDrawer('companion')} style={{ ...circleButtonStyle, background: 'var(--go-grad)', color: '#fff', fontSize: 14 }}>👥</button>
        <button onClick={() => setDrawer('menu')} style={{ ...circleButtonStyle, fontSize: 16, fontWeight: 900 }}>☰</button>
      </div>

      <div className="scroll-area" style={{ padding: 0, background: '#fff' }}>
        <MapStage
          scene={scene}
          weather={weather}
          weatherMeta={weatherMeta}
          pins={pins}
          routeStops={routeStops}
          loading={loadingTrip}
          showNearby={showNearby}
          focusedPin={focusedPin}
          setFocusedPin={setFocusedPin}
          height={mapHeight}
          onOpenPlace={openPlace}
          onOpenWeather={() => setDrawer('weather')}
          onOpenFortune={() => setDrawer('fortune')}
          onOpenPoster={() => nav('/summary')}
          onExpandMap={() => setMapHeightWithMode(panelMode === 'map' ? 330 : 610)}
          onExpandTrip={() => setMapHeightWithMode(panelMode === 'trip' ? 330 : 130)}
          panelMode={panelMode}
          doneStations={doneStations}
          totalStations={totalStations}
        />

        <section
          style={{
            position: 'relative',
            zIndex: 4,
            marginTop: -12,
            background: '#fff',
            borderRadius: '20px 20px 0 0',
            boxShadow: '0 -8px 24px rgba(20,24,32,.08)',
            minHeight: panelMode === 'trip' ? 680 : 430,
            transition: 'min-height .28s ease',
          }}
        >
          <div
            onPointerDown={(e) => {
              panelDrag.current = { y: e.clientY, height: mapHeight };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!panelDrag.current) return;
              setMapHeightWithMode(panelDrag.current.height + e.clientY - panelDrag.current.y);
            }}
            onPointerUp={(e) => {
              panelDrag.current = null;
              e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onPointerCancel={() => { panelDrag.current = null; }}
            style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px', cursor: 'ns-resize', touchAction: 'none' }}
            title="拖动调整行程面板"
          >
            <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--mt-line)' }} />
          </div>

          <div style={{ display: 'flex', gap: 18, padding: '0 20px', borderBottom: '1px solid var(--mt-line-2)' }}>
            {(['总览', 'Day 1', 'Day 2'] as Tab[]).map((t) => {
              const active = tab === t;
              return (
                <button key={t} onClick={() => setTab(t)} style={{ padding: '13px 0', fontSize: 14, fontWeight: active ? 800 : 600, color: active ? 'var(--mt-text)' : 'var(--mt-text-3)', borderBottom: active ? '2px solid var(--mt-text)' : '2px solid transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.25 }}>
                  {t}
                  {t === 'Day 1' && <span className="text-tiny" style={{ color: 'var(--mt-text-3)', fontWeight: 400 }}>今天</span>}
                  {t === 'Day 2' && <span className="text-tiny" style={{ color: 'var(--mt-text-3)', fontWeight: 400 }}>明天</span>}
                </button>
              );
            })}
          </div>

          <div style={{ padding: '14px', maxHeight: panelMode === 'trip' ? 640 : 'none', overflowY: panelMode === 'trip' ? 'auto' : 'visible' }}>
            {tab === '总览' && (
              <TripProgress scene={scene} doneStations={doneStations} totalStations={totalStations} />
            )}

            {loadingTrip && items.length === 0 && (
              <StreamingStatus
                title="正在同步行中看板"
                messages={[
                  '读取已支付订单',
                  '加载行程时间轴',
                  '匹配地图坐标',
                  '刷新路线和附近推荐',
                ]}
              />
            )}

            {items.map((it, i) => (
              <BoardItemBlock
                key={`${it.name}-${i}`}
                item={it}
                checked={completed.has(it.name)}
                onToggleDone={() => {
                  const isChecking = !completed.has(it.name);
                  setCompleted((prev) => {
                    const next = new Set(prev);
                    next.has(it.name) ? next.delete(it.name) : next.add(it.name);
                    return next;
                  });
                  const stationId = ITEM_STATION_MAP[it.name];
                  if (isChecking && orderId && stationId) {
                    checkInStation(orderId, stationId).catch(() => undefined);
                  }
                }}
                onTaxi={() => { setSelectedPlace(it); setDrawer('taxi'); }}
                onDetail={() => openPlace(it)}
              />
            ))}

          </div>
        </section>
      </div>

      <FloatingAssistants
        scene={scene}
        onMemo={() => setDrawer('memo')}
        onTea={() => setDrawer('tea')}
      />

      {drawer === 'menu' && (
        <SideMenuOverlay
          scene={scene}
          onClose={() => setDrawer(null)}
          onSummary={() => nav('/summary')}
          onMap={() => nav('/p8')}
          onShare={() => setDrawer('share')}
          onCompanion={() => setDrawer('companion')}
          onOrders={() => setDrawer('orders')}
          onSupport={() => setDrawer('support')}
          onSettings={() => setDrawer('settings')}
        />
      )}

      {drawer && drawer !== 'menu' && (
        <DrawerSheet
          kind={drawer}
          scene={scene}
          weather={weather}
          forecastDays={forecastDays}
          selectedPlace={selectedPlace}
          onClose={() => setDrawer(null)}
          todos={todos}
          setTodos={setTodos}
          todoText={todoText}
          setTodoText={setTodoText}
          onTaxi={() => setDrawer('taxi')}
          deliveryChoice={deliveryChoice}
          onDelivery={(choice) => {
            setDeliveryChoice(choice);
            setDrawer('delivery');
          }}
        />
      )}
    </MobileFrame>
  );
}

function MapStage({
  scene, weather, weatherMeta, pins, routeStops, showNearby, focusedPin, setFocusedPin,
  height, onOpenPlace, onOpenWeather, onOpenFortune, onOpenPoster, onExpandMap, onExpandTrip, panelMode, doneStations, totalStations, loading,
}: {
  scene: Scene; weather: Weather; weatherMeta: typeof WEATHER_META[Weather]; pins: MapPin[]; routeStops: RouteStop[];
  loading: boolean;
  showNearby: boolean; focusedPin: string | null; setFocusedPin: (name: string) => void;
  height: number;
  onOpenPlace: (p: MapPin) => void; onOpenWeather: () => void; onOpenFortune: () => void; onOpenPoster: () => void;
  onExpandMap: () => void; onExpandTrip: () => void; panelMode: PanelMode; doneStations: number; totalStations: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(390);
  const [zoom, setZoom] = useState(12);
  // viewport top-left in world pixels (at `zoom`)
  const base0 = SCENE_TILE_BASE[scene];
  const [view, setView] = useState<{ x: number; y: number }>({ x: base0.x * 256, y: base0.y * 256 });
  const drag = useRef<{ sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);

  // Track the map's on-screen width (phone is fixed-width, but stay robust).
  useEffect(() => {
    const measure = () => { if (containerRef.current) setViewW(containerRef.current.clientWidth || 390); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const fitPoints: LatLng[] = routeStops.length > 0
    ? routeStops.map((s) => ({ lat: s.lat, lng: s.lng }))
    : pins.map((p) => ({ lat: p.lat, lng: p.lng }));

  // Fit the whole route inside the current map viewport.
  useEffect(() => {
    if (fitPoints.length === 0) return;
    const z = fitZoom(fitPoints, viewW, height, { pad: 46, max: 15 });
    const c = centerWorld(fitPoints, z);
    setZoom(z);
    setView({ x: c.x - viewW / 2, y: c.y - height / 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeStops, pins, viewW, height]);

  const focusPin = (pin: MapPin) => {
    setFocusedPin(pin.name);
    setView({ x: worldX(pin.lng, zoom) - viewW / 2, y: worldY(pin.lat, zoom) - height / 2 });
  };

  const tiles = visibleTiles(view.x, view.y, viewW, height, zoom);
  const nearbyPins = useMemo(() => {
    const routeNames = new Set(routeStops.map((s) => s.name));
    const routeCoords = new Set(routeStops.map((s) => `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`));
    return pins.filter((p) => (
      !routeNames.has(p.name)
      && !routeCoords.has(`${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
    ));
  }, [pins, routeStops]);

  // Route in world pixels + its bounding box (keeps the SVG small & placed right).
  const routeWorld = routeStops.map((s) => ({ x: worldX(s.lng, zoom), y: worldY(s.lat, zoom) }));
  const rMinX = routeWorld.length ? Math.min(...routeWorld.map((p) => p.x)) : 0;
  const rMinY = routeWorld.length ? Math.min(...routeWorld.map((p) => p.y)) : 0;
  const rMaxX = routeWorld.length ? Math.max(...routeWorld.map((p) => p.x)) : 0;
  const rMaxY = routeWorld.length ? Math.max(...routeWorld.map((p) => p.y)) : 0;
  const routeD = routeWorld.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x - rMinX} ${p.y - rMinY}`).join(' ');

  return (
    <div ref={containerRef} style={{ position: 'relative', height, overflow: 'hidden', background: '#eef3f5', borderBottom: '1px solid var(--mt-line)', transition: 'height .28s ease' }}>
      {/* Drag surface — covers the whole viewport so empty-area dragging pans */}
      <div
        onPointerDown={(e) => {
          drag.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dx = e.clientX - drag.current.sx;
          const dy = e.clientY - drag.current.sy;
          if (!drag.current.moved) {
            if (Math.abs(dx) + Math.abs(dy) < 4) return; // let taps through to pins
            drag.current.moved = true;
            e.currentTarget.setPointerCapture(e.pointerId);
          }
          // Compensate for the phone's auto-scale so 1 screen-px = 1 map-px.
          const s = (e.currentTarget.getBoundingClientRect().width / (e.currentTarget.offsetWidth || viewW)) || 1;
          setView({ x: drag.current.vx - dx / s, y: drag.current.vy - dy / s });
        }}
        onPointerUp={(e) => {
          if (drag.current?.moved) { try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ } }
          drag.current = null;
        }}
        onPointerCancel={() => { drag.current = null; }}
        style={{ position: 'absolute', inset: 0, touchAction: 'none', cursor: 'grab' }}
      >
        {/* World layer — translated by −view so world-px children land on screen */}
        <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${-view.x}px, ${-view.y}px)`, willChange: 'transform' }}>
          {tiles.map((t) => (
            <img
              key={t.key}
              src={t.src}
              alt=""
              draggable={false}
              style={{ position: 'absolute', left: t.left, top: t.top, width: 256, height: 256, opacity: weather === 'rainy' ? 0.48 : 0.58, filter: weather === 'snowy' ? 'saturate(.55) brightness(1.18)' : 'saturate(.7) brightness(1.08)' }}
            />
          ))}
          {routeStops.length >= 2 && (
            <svg
              width={Math.max(1, rMaxX - rMinX)}
              height={Math.max(1, rMaxY - rMinY)}
              style={{ position: 'absolute', left: rMinX, top: rMinY, overflow: 'visible' }}
            >
              <path d={routeD} stroke={weatherMeta.route} strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.86" />
              <path d={routeD} stroke="#fff" strokeWidth="2" strokeDasharray="10 12" fill="none" strokeLinecap="round" opacity="0.72" />
            </svg>
          )}
          {routeStops.map((stop, i) => (
            <RouteStopPin key={`${stop.name}-${i}`} stop={stop} px={worldX(stop.lng, zoom)} py={worldY(stop.lat, zoom)} />
          ))}
          {showNearby && nearbyPins.map((p, i) => (
            <NearbyPin
              key={p.name}
              pin={p}
              px={worldX(p.lng, zoom)}
              py={worldY(p.lat, zoom)}
              active={focusedPin === p.name}
              delay={i * 80}
              onFocus={() => focusPin(p)}
              onDetail={() => onOpenPlace(p)}
            />
          ))}
          {routeWorld.length > 0 && (
            <CurrentMarker weatherMeta={weatherMeta} scene={scene} px={routeWorld[0].x} py={routeWorld[0].y} />
          )}
        </div>
      </div>

      {/* Subtle weather tint over the map */}
      <div style={{ position: 'absolute', inset: 0, background: weatherMeta.bg, pointerEvents: 'none' }} />
      <WeatherEffect weather={weather} />

      {loading && routeStops.length === 0 && (
        <div style={{ position: 'absolute', left: 14, right: 14, bottom: 18, zIndex: 6 }}>
          <StreamingStatus
            title="正在加载地图路线"
            compact
            messages={[
              '读取行程站点',
              '匹配 POI 坐标',
              '铺设地图路径',
              '准备附近提醒',
            ]}
          />
        </div>
      )}

      <div style={{ position: 'absolute', top: 10, left: 10, right: 10, display: 'flex', gap: 8 }}>
        <MiniCard icon={weatherMeta.icon} title={`${weatherMeta.temp} ${weatherMeta.title}`} sub={weatherMeta.outfit} onClick={onOpenWeather} />
        <MiniCard icon="🍀" title="今日运" sub="点击占卜" onClick={onOpenFortune} />
        <MiniCard icon="✨" title="行程总结" sub={`${doneStations}/${totalStations} 站`} small onClick={onOpenPoster} />
      </div>

      <div style={{ position: 'absolute', right: 10, bottom: 46, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={onExpandMap} style={{ ...mapControlStyle, width: 86, borderRadius: 999, fontSize: 12 }}>
          {panelMode === 'map' ? '地图还原' : '地图放大'}
        </button>
        <button onClick={onExpandTrip} style={{ ...mapControlStyle, width: 86, borderRadius: 999, fontSize: 12 }}>
          {panelMode === 'trip' ? '行程还原' : '行程放大'}
        </button>
      </div>
    </div>
  );
}

function RouteStopPin({ stop, px, py }: { stop: RouteStop; px: number; py: number }) {
  return (
    <div style={{ position: 'absolute', left: px, top: py, transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2 }}>
      <div style={{ width: 34, height: 34, borderRadius: '50%', background: stop.done ? 'var(--mt-green)' : '#fff', border: `3px solid ${stop.done ? 'var(--mt-green)' : '#3b82f6'}`, boxShadow: '0 8px 18px rgba(59,130,246,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>
        {stop.done ? '✓' : stop.icon}
      </div>
      <MapPointName name={stop.name} />
    </div>
  );
}

function CurrentMarker({ weatherMeta, scene, px, py }: { weatherMeta: typeof WEATHER_META[Weather]; scene: Scene; px: number; py: number }) {
  return (
    <div style={{ position: 'absolute', left: px, top: py, transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 5 }}>
      <div style={{ width: 54, height: 54, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 25, boxShadow: '0 8px 24px rgba(59,130,246,.32)', border: '4px solid #dbeafe', animation: 'mapPinPulse 1.8s ease-in-out infinite' }}>
        {weatherMeta.mapIcon}
      </div>
    </div>
  );
}

function WeatherEffect({ weather }: { weather: Weather }) {
  if (weather === 'sunny') {
    return (
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', background: 'linear-gradient(180deg, rgba(255,244,191,.18), rgba(255,255,255,0) 48%)' }}>
        <span
          style={{
            position: 'absolute',
            inset: '-18% -34% auto -20%',
            height: 260,
            background: 'linear-gradient(118deg, rgba(255,246,194,0) 10%, rgba(255,246,194,.28) 34%, rgba(255,246,194,0) 48%), linear-gradient(118deg, rgba(255,229,132,0) 42%, rgba(255,229,132,.18) 58%, rgba(255,229,132,0) 72%)',
            mixBlendMode: 'screen',
            transformOrigin: '16% 0%',
            animation: 'sunRaySweep 9.5s ease-in-out infinite',
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: -34,
            top: -34,
            width: 150,
            height: 150,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,232,123,.68) 0%, rgba(255,210,66,.34) 38%, rgba(255,210,66,0) 72%)',
            filter: 'blur(.3px)',
            animation: 'sunBreath 5.8s ease-in-out infinite',
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: 6,
            top: 18,
            width: 250,
            height: 110,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(255,247,210,.36), rgba(255,247,210,0) 66%)',
            mixBlendMode: 'screen',
            animation: 'warmLightDrift 8s ease-in-out infinite',
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: '9%',
            right: '16%',
            bottom: 22,
            height: 76,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at 42% 50%, rgba(255,229,132,.24), rgba(255,229,132,.08) 44%, rgba(255,229,132,0) 72%)',
            filter: 'blur(7px)',
            mixBlendMode: 'screen',
            animation: 'sunPatchGlow 7.2s ease-in-out infinite',
          }}
        />
      </div>
    );
  }
  const particles = Array.from({ length: weather === 'rainy' ? 44 : 42 });
  const groundMarks = Array.from({ length: weather === 'rainy' ? 4 : 5 });
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', background: weather === 'rainy' ? 'linear-gradient(180deg, rgba(15,23,42,.28), rgba(30,41,59,.12) 42%, rgba(15,23,42,.22))' : 'linear-gradient(180deg, rgba(255,255,255,.34), rgba(239,246,255,.18) 42%, rgba(255,255,255,.26))' }}>
      <span
        style={{
          position: 'absolute',
          inset: weather === 'rainy' ? '0 -16% auto -16%' : '-8% -18% auto -18%',
          height: weather === 'rainy' ? 150 : 190,
          background: weather === 'rainy'
            ? 'radial-gradient(ellipse at 48% 20%, rgba(203,213,225,.26), rgba(203,213,225,0) 64%)'
            : 'radial-gradient(ellipse at 45% 18%, rgba(255,255,255,.72), rgba(255,255,255,0) 68%)',
          filter: 'blur(8px)',
          animation: 'weatherHazeDrift 10s ease-in-out infinite',
        }}
      />
      {weather === 'rainy' && (
        <span
          style={{
            position: 'absolute',
            left: -80,
            right: -80,
            bottom: -24,
            height: 150,
            background: 'linear-gradient(180deg, rgba(148,163,184,0), rgba(148,163,184,.18) 58%, rgba(15,23,42,.18))',
            filter: 'blur(10px)',
            animation: 'rainMistPulse 6.5s ease-in-out infinite',
          }}
        />
      )}
      <span
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: weather === 'rainy' ? 98 : 112,
          background: weather === 'rainy'
            ? 'linear-gradient(180deg, rgba(15,23,42,0), rgba(59,130,246,.09) 44%, rgba(15,23,42,.15)), radial-gradient(ellipse at 50% 100%, rgba(191,219,254,.24), rgba(191,219,254,0) 70%)'
            : 'linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,.48) 42%, rgba(239,246,255,.76)), radial-gradient(ellipse at 50% 100%, rgba(255,255,255,.9), rgba(255,255,255,0) 72%)',
          filter: weather === 'rainy' ? 'blur(3px)' : 'blur(1px)',
        }}
      />
      {groundMarks.map((_, i) => {
        const isRain = weather === 'rainy';
        return (
          <span
            key={`ground-${i}`}
            style={{
              position: 'absolute',
              left: `${isRain ? 6 + i * 23 : -10 + i * 25}%`,
              bottom: isRain ? 14 + (i % 2) * 17 : -6 + (i % 3) * 8,
              width: isRain ? 88 + (i % 2) * 28 : 118 + (i % 3) * 18,
              height: isRain ? 24 + (i % 3) * 5 : 36 + (i % 2) * 10,
              borderRadius: '50%',
              background: isRain
                ? 'radial-gradient(ellipse, rgba(219,234,254,.32), rgba(96,165,250,.16) 45%, rgba(15,23,42,0) 72%)'
                : 'radial-gradient(ellipse, rgba(255,255,255,.92), rgba(226,242,255,.54) 52%, rgba(226,242,255,0) 76%)',
              boxShadow: isRain ? 'inset 0 1px 10px rgba(255,255,255,.16)' : '0 -5px 14px rgba(255,255,255,.42)',
              filter: `blur(${isRain ? 1.8 : 2.4}px)`,
              opacity: isRain ? 0.72 : 0.78,
              animation: `${isRain ? 'puddleShimmer' : 'snowDriftSettle'} ${isRain ? 4.8 + i * 0.4 : 8.5 + i * 0.6}s ease-in-out infinite`,
              animationDelay: `${-i * 0.7}s`,
            }}
          />
        );
      })}
      {weather === 'rainy' && groundMarks.map((_, i) => (
        <span
          key={`ripple-${i}`}
          style={{
            position: 'absolute',
            left: `${12 + i * 22}%`,
            bottom: 24 + (i % 2) * 24,
            width: 22 + (i % 2) * 8,
            height: 8 + (i % 2) * 3,
            borderRadius: '50%',
            border: '1px solid rgba(219,234,254,.42)',
            opacity: 0,
            animation: `puddleRipple ${2.6 + i * 0.25}s ease-out infinite`,
            animationDelay: `${-i * 0.5}s`,
          }}
        />
      ))}
      {particles.map((_, i) => {
        const isRain = weather === 'rainy';
        const left = ((i * 29 + (i % 5) * 13) % 110) - 6;
        const duration = isRain ? 0.9 + (i % 5) * 0.15 : 5.6 + (i % 7) * 0.52;
        const size = isRain ? 1.2 + (i % 3) * 0.55 : 3.4 + (i % 5) * 1.15;
        const opacity = isRain ? 0.45 + (i % 4) * 0.11 : 0.5 + (i % 5) * 0.08;
        return (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: `${left}%`,
              top: isRain ? '-22%' : '-16%',
              width: isRain ? size : size,
              height: isRain ? 42 + (i % 4) * 12 : size,
              borderRadius: 999,
              background: isRain
                ? 'linear-gradient(180deg, rgba(255,255,255,0), rgba(219,234,254,.82), rgba(147,197,253,.46))'
                : 'radial-gradient(circle, rgba(255,255,255,.96), rgba(226,242,255,.72) 62%, rgba(226,242,255,0))',
              boxShadow: isRain ? '0 0 10px rgba(147,197,253,.26)' : '0 0 12px rgba(255,255,255,.74)',
              filter: isRain ? 'blur(.15px)' : `blur(${(i % 3) * 0.25}px)`,
              opacity,
              animation: `${isRain ? 'rainDrop' : 'snowFall'} ${duration}s ${isRain ? 'linear' : 'cubic-bezier(.45,0,.55,1)'} infinite`,
              animationDelay: `${-(i * (isRain ? 0.11 : 0.27))}s`,
            }}
          />
        );
      })}
    </div>
  );
}

function TripProgress({ scene, doneStations, totalStations }: { scene: Scene; doneStations: number; totalStations: number }) {
  return (
    <div style={{ background: 'linear-gradient(135deg,#fff8d6,#ffe7a3)', border: '1px solid #ffd76b', borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div className="h-between">
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{scene === 'sz' ? '深圳周末游' : '北京家庭文化游'}</div>
          <div className="text-tiny text-muted" style={{ marginTop: 4 }}>已完成 {doneStations} / {totalStations} 站</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--mt-orange)' }}>{Math.round((doneStations / totalStations) * 100)}%</div>
          <div className="text-tiny text-muted">完成度</div>
        </div>
      </div>
      <div style={{ marginTop: 12, height: 7, borderRadius: 999, background: 'rgba(255,255,255,.72)', overflow: 'hidden' }}>
        <div style={{ width: `${(doneStations / totalStations) * 100}%`, height: '100%', background: 'linear-gradient(90deg,#ffd84a,#f59e0b)' }} />
      </div>
    </div>
  );
}

function FloatingAssistants({ scene, onMemo, onTea }: { scene: Scene; onMemo: () => void; onTea: () => void }) {
  return (
    <div style={{ position: 'absolute', right: 12, bottom: 132, zIndex: 20, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
      <button onClick={onMemo} style={floatBtnStyle}>
        <span style={{ position: 'absolute', right: -2, top: -3, width: 17, height: 17, borderRadius: '50%', background: '#ef4444', color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>2</span>
        📝
      </button>
      <button onClick={onTea} style={{ ...floatBtnStyle, width: 78, borderRadius: 999, gap: 5, background: 'linear-gradient(135deg,#ffd84a,#f59e0b)', fontSize: 18, fontWeight: 900 }}>
        <span>{scene === 'bj' ? '🥖' : '🍵'}</span>
      </button>
    </div>
  );
}

function NearbyPin({
  pin, px, py, active, delay, onFocus, onDetail,
}: {
  pin: MapPin; px: number; py: number; active: boolean; delay: number; onFocus: () => void; onDetail: () => void;
}) {
  return (
    <div className="fade-up" style={{ position: 'absolute', left: px, top: py, transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', animationDelay: `${delay}ms`, zIndex: active ? 8 : 3 }}>
      <button
        aria-label={pin.name}
        onClick={() => { if (active) onDetail(); else onFocus(); }}
        style={{
          width: active ? 38 : 32,
          height: active ? 38 : 32,
          borderRadius: '50%',
          background: '#fff',
          border: `3px solid ${active ? '#ffd84a' : '#fff'}`,
          boxShadow: active ? '0 14px 30px rgba(0,0,0,.28)' : '0 8px 20px rgba(0,0,0,.18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: active ? 17 : 14,
        }}
      >
        <span style={{ width: 24, height: 24, borderRadius: '50%', background: pin.tint, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{pin.icon}</span>
      </button>
      <MapPointName name={pin.name} active={active} />
    </div>
  );
}

function MapPointName({ name, active }: { name: string; active?: boolean }) {
  return (
    <div
      title={name}
      style={{
        marginTop: 4,
        width: 'max-content',
        padding: '2px 6px',
        borderRadius: 6,
        background: 'rgba(255,255,255,.78)',
        boxShadow: '0 4px 10px rgba(15,23,42,.10)',
        color: active ? '#111827' : '#1f2937',
        fontSize: active ? 10.8 : 10.2,
        fontWeight: active ? 900 : 800,
        lineHeight: 1.2,
        textAlign: 'center',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }}
    >
      {name}
    </div>
  );
}

function MiniCard({ icon, title, sub, small, onClick }: { icon: string; title: string; sub: string; small?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ flex: small ? 0.8 : 1.35, minWidth: 0, background: '#fff', borderRadius: 12, padding: '8px 10px', boxShadow: 'var(--shadow-1)', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', border: '1px solid rgba(124,58,237,.08)' }}>
      <span style={{ width: 30, height: 30, borderRadius: '50%', background: '#f1f5f9', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 900 }}>{title}</div>
        <div className="text-tiny text-muted" style={{ marginTop: 1, lineHeight: 1.25 }}>{sub}</div>
      </div>
    </button>
  );
}

function BoardItemBlock({
  item, checked, onToggleDone, onTaxi, onDetail,
}: {
  item: BoardItem; checked: boolean; onToggleDone: () => void; onTaxi: () => void; onDetail: () => void;
}) {
  const left = periodColor[item.period];
  const queueChip = item.queue === '高'
    ? { bg: 'var(--mt-red-soft)', fg: 'var(--mt-red)', label: '排队高' }
    : item.queue === '中'
    ? { bg: '#fff5cc', fg: '#b88500', label: '排队中' }
    : { bg: 'var(--mt-green-soft)', fg: 'var(--mt-green)', label: '排队低' };

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ color: left, fontSize: 13, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>{periodEmoji[item.period]} {item.period}</span>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <button
          onClick={onToggleDone}
          title={checked ? '取消完成' : '手动勾选完成'}
          style={{
            width: 28, height: 28, marginTop: 26, borderRadius: '50%',
            background: checked ? 'var(--mt-green)' : '#fff',
            border: '2px solid ' + (checked ? 'var(--mt-green)' : 'var(--mt-line)'),
            color: checked ? 'var(--mt-green)' : 'var(--mt-text-3)',
            fontSize: 18, fontWeight: 900,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: checked ? '0 6px 16px rgba(16,185,129,.22)' : 'none',
            flexShrink: 0,
          }}
        >
          <span style={{ color: '#fff', fontSize: 15, lineHeight: 1 }}>{checked ? '✓' : ''}</span>
        </button>
        <button onClick={onDetail} className="card" style={{ flex: 1, minWidth: 0, padding: 12, borderLeft: `4px solid ${left}`, borderRadius: '4px 12px 12px 4px', textAlign: 'left' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <StationThumb item={item} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="h-between">
                <span style={{ fontSize: 14.5, fontWeight: 800, flex: 1 }}>{item.name}</span>
                <span style={{ fontSize: 12, color: 'var(--mt-orange)', fontWeight: 800 }}>★ {item.rating}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 11.5, color: 'var(--mt-text-2)', flexWrap: 'wrap' }}>
                <span>{item.duration}</span>
                {item.price && <span style={{ color: 'var(--mt-orange)', fontWeight: 800 }}>{item.price}</span>}
                {item.queue && <span style={{ padding: '1px 6px', borderRadius: 3, background: queueChip.bg, color: queueChip.fg, fontSize: 10, fontWeight: 800 }}>{queueChip.label}</span>}
              </div>
              <div className="text-tiny text-muted" style={{ marginTop: 7, lineHeight: 1.45 }}>{item.desc}</div>
            </div>
          </div>
        </button>
      </div>

      {item.segment && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', marginTop: 6 }}>
          <span className="text-tiny" style={{ color: 'var(--mt-text-3)' }}>🚶 {item.segment.walk} · 🚗 {item.segment.drive} · {item.segment.meters}</span>
          <button onClick={onTaxi} style={{ marginLeft: 'auto', padding: '5px 11px', borderRadius: 999, background: 'linear-gradient(135deg,#ffd84a,#f5b800)', fontSize: 11, fontWeight: 800, color: '#1a1a1a', display: 'inline-flex', alignItems: 'center', gap: 4 }}>🚗 美团打车</button>
        </div>
      )}
    </div>
  );
}

function DrawerSheet({
  kind, scene, weather, forecastDays, selectedPlace, onClose, todos, setTodos, todoText, setTodoText, onTaxi, deliveryChoice, onDelivery,
}: {
  kind: Exclude<Drawer, null | 'menu'>; scene: Scene; weather: Weather;
  forecastDays: { date: string; cond: string; tempH: number; tempL: number }[];
  selectedPlace: BoardItem | MapPin | null; onClose: () => void;
  todos: Todo[]; setTodos: (t: Todo[]) => void; todoText: string; setTodoText: (t: string) => void; onTaxi: () => void;
  deliveryChoice: DeliveryChoice | null; onDelivery: (choice: DeliveryChoice) => void;
}) {
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 50, display: 'flex', alignItems: 'flex-end', animation: 'overlayFade .2s ease' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxHeight: '74%', background: '#fff', borderRadius: '20px 20px 0 0', padding: '14px 16px 24px', overflowY: 'auto', animation: 'sheetUp .28s ease', position: 'relative' }}>
        <div style={{ width: 36, height: 4, background: 'var(--mt-line)', borderRadius: 999, margin: '0 auto 14px' }} />
        <button onClick={onClose} style={{ position: 'absolute', right: 14, top: 14, width: 28, height: 28, borderRadius: '50%', background: 'var(--mt-bg)', fontSize: 16, color: 'var(--mt-text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        {kind === 'memo' && <MemoSheet todos={todos} setTodos={setTodos} todoText={todoText} setTodoText={setTodoText} />}
        {kind === 'share' && <ShareSheet scene={scene} />}
        {kind === 'companion' && <CompanionSheet scene={scene} />}
        {kind === 'orders' && <OrdersSheet scene={scene} />}
        {kind === 'support' && <SupportSheet scene={scene} />}
        {kind === 'settings' && <SettingsSheet scene={scene} />}
        {kind === 'trace' && <TraceSheet />}
        {kind === 'weather' && <WeatherSheet scene={scene} weather={weather} forecastDays={forecastDays} />}
        {kind === 'fortune' && <FortuneSheet scene={scene} />}
        {kind === 'tea' && <TeaSheet scene={scene} onDelivery={onDelivery} />}
        {kind === 'delivery' && <DeliverySheet choice={deliveryChoice} />}
        {kind === 'taxi' && <TaxiSheet scene={scene} place={selectedPlace} />}
        {kind === 'place' && <PlaceSheet place={selectedPlace} onTaxi={onTaxi} />}
      </div>
    </div>
  );
}

function SideMenuOverlay({
  scene, onClose, onSummary, onMap, onShare, onCompanion, onOrders, onSupport, onSettings,
}: {
  scene: Scene;
  onClose: () => void;
  onSummary: () => void;
  onMap: () => void;
  onShare: () => void;
  onCompanion: () => void;
  onOrders: () => void;
  onSupport: () => void;
  onSettings: () => void;
}) {
  const rows = [
    { icon: '✨', title: '行程总结', sub: '智能生成回忆 · 一键分享', action: onSummary, primary: true },
    { icon: '🗺️', title: '全屏地图路线', sub: '查看实时定位与点位', action: onMap },
    { icon: '↗', title: '分享我的旅程', sub: '保存照片或转发朋友圈', action: onShare },
    { icon: '👥', title: '共享看板给同行人', sub: '一键生成链接 / 二维码', action: onCompanion },
    { icon: '📋', title: '订单与凭证', sub: '查看已购的票和券', action: onOrders },
    { icon: '☎', title: '客服中心', sub: '7×24h 帮你解决问题', action: onSupport },
    { icon: '⚙', title: '设置', sub: '通知 · 隐私 · 语言', action: onSettings },
  ];

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end', background: 'rgba(17,24,39,.18)', backdropFilter: 'blur(5px)', animation: 'overlayFade .2s ease' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 284,
          height: '100%',
          background: 'linear-gradient(180deg,#fff 0%,#fbfbfc 100%)',
          borderRadius: '28px 0 0 28px',
          boxShadow: '-18px 0 42px rgba(15,23,42,.22)',
          padding: '34px 16px 18px',
          animation: 'sideMenuIn .26s cubic-bezier(.2,.8,.2,1)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 8px 24px', borderBottom: '1px solid var(--mt-line-2)' }}>
          <GoMark size={44} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>小go旅迹</div>
            <div className="text-small text-muted" style={{ marginTop: 3 }}>正在跟随你的旅程</div>
          </div>
        </div>

        <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {rows.map((row) => (
            <button
              key={row.title}
              onClick={row.action}
              style={{
                minHeight: row.primary ? 76 : 58,
                borderRadius: row.primary ? 16 : 14,
                padding: '10px 8px',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                color: row.primary ? '#fff' : 'var(--mt-text)',
                background: row.primary ? 'linear-gradient(135deg,#17213d,#0f4672)' : 'transparent',
                boxShadow: row.primary ? '0 14px 30px rgba(15,70,114,.24)' : 'none',
              }}
            >
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  background: row.primary ? 'rgba(255,255,255,.14)' : 'var(--mt-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  flexShrink: 0,
                }}
              >
                {row.icon}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 900 }}>{row.title}</span>
                <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: row.primary ? 'rgba(255,255,255,.76)' : 'var(--mt-text-3)' }}>{row.sub}</span>
              </span>
              <span style={{ fontSize: 18, color: row.primary ? '#fff' : 'var(--mt-text-3)' }}>›</span>
            </button>
          ))}
        </div>

        <div style={{ marginTop: 'auto', textAlign: 'center', color: 'var(--mt-text-3)', fontSize: 12 }}>
          美团 × 小go · v1.0 · {scene === 'bj' ? '北京' : '深圳'}
        </div>
      </div>
    </div>
  );
}

function MemoSheet({ todos, setTodos, todoText, setTodoText }: { todos: Todo[]; setTodos: (t: Todo[]) => void; todoText: string; setTodoText: (t: string) => void }) {
  const doneCount = todos.filter((t) => t.done).length;
  const add = () => {
    if (!todoText.trim()) return;
    setTodos([...todos, { id: 't' + Date.now(), text: todoText.trim(), done: false }]);
    setTodoText('');
  };
  return (
    <>
      <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 12 }}>备忘录 · 待办清单</div>
      <div style={{ background: 'linear-gradient(135deg,#e8f0ff,#f1ebff)', border: '1px solid #bfdbfe', borderRadius: 12, padding: 12, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 22 }}>📝</span>
        <div><div style={{ fontSize: 14, fontWeight: 800 }}>已完成 {doneCount} / {todos.length}</div><div className="text-tiny text-muted" style={{ marginTop: 2 }}>点亮小圆圈表示已搞定，离开本旅程会自动清理</div></div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input value={todoText} onChange={(e) => setTodoText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="加个待办：充电宝 / 防晒霜 / 现金..." style={{ flex: 1, background: 'var(--mt-bg)', borderRadius: 10, padding: '12px 14px', fontSize: 13.5 }} />
        <button onClick={add} style={{ padding: '0 18px', borderRadius: 10, background: 'linear-gradient(135deg,#ffd84a,#f5b800)', fontWeight: 800, fontSize: 14, color: '#1a1a1a' }}>+ 加</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {todos.map((t) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, background: t.done ? 'var(--mt-green-soft)' : 'var(--mt-bg)' }}>
            <button onClick={() => setTodos(todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))} style={{ width: 24, height: 24, borderRadius: '50%', background: t.done ? 'var(--mt-green)' : '#fff', border: '2px solid ' + (t.done ? 'var(--mt-green)' : 'var(--mt-line)'), color: '#fff', fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{t.done ? '✓' : ''}</button>
            <span style={{ flex: 1, fontSize: 14, color: t.done ? 'var(--mt-text-3)' : 'var(--mt-text)', textDecoration: t.done ? 'line-through' : 'none' }}>{t.text}</span>
            <button onClick={() => setTodos(todos.filter((x) => x.id !== t.id))} style={{ color: 'var(--mt-text-3)', fontSize: 18, padding: 4 }}>×</button>
          </div>
        ))}
      </div>
      <div className="text-tiny text-muted" style={{ lineHeight: 1.7 }}>💡 备忘录会同步到共享看板，同行人也能看到 / 勾选</div>
    </>
  );
}

function SupportSheet({ scene }: { scene: Scene }) {
  const tripName = scene === 'bj' ? '北京家庭文化游' : '深圳周末游';
  const supportOptions = [
    {
      icon: '☎',
      title: '人工客服 1:1 对接',
      sub: '专属客服接入，帮你处理订单、改签、退款、同行人协同问题',
      meta: '当前预计等待 1 分钟',
      cta: '接入人工客服',
      primary: true,
    },
    {
      icon: 'go',
      title: 'AI 助手对接',
      sub: '快速回答行程、天气、路线、餐厅排队、附近服务等问题',
      meta: '秒级响应 · 可继续追问',
      cta: '打开 AI 助手',
      primary: false,
    },
  ];
  return (
    <>
      <div style={{ fontSize: 19, fontWeight: 900, marginBottom: 4 }}>客服中心</div>
      <div className="text-tiny text-muted" style={{ marginBottom: 14, lineHeight: 1.6 }}>
        当前旅程：{tripName}。选择一种方式继续处理你的问题。
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
        {supportOptions.map((item) => (
          <div key={item.title} style={{ padding: 14, borderRadius: 16, background: item.primary ? 'linear-gradient(135deg,#17213d,#0f4672)' : '#fff', color: item.primary ? '#fff' : 'var(--mt-text)', border: item.primary ? 'none' : '1px solid var(--mt-line-2)', boxShadow: item.primary ? '0 16px 34px rgba(15,70,114,.24)' : 'var(--shadow-1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 46, height: 46, borderRadius: 14, background: item.primary ? 'rgba(255,255,255,.14)' : 'var(--mt-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: item.icon === 'go' ? 14 : 23, fontWeight: 900 }}>
                {item.icon}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 900 }}>{item.title}</div>
                <div style={{ marginTop: 5, fontSize: 12, lineHeight: 1.55, color: item.primary ? 'rgba(255,255,255,.78)' : 'var(--mt-text-3)' }}>{item.sub}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 13 }}>
              <span style={{ flex: 1, fontSize: 11.5, color: item.primary ? 'rgba(255,255,255,.72)' : 'var(--mt-text-3)' }}>{item.meta}</span>
              <button style={{ height: 32, padding: '0 13px', borderRadius: 999, background: item.primary ? '#fff' : '#1a1a1a', color: item.primary ? '#0f4672' : '#fff', fontSize: 12, fontWeight: 900 }}>
                {item.cta}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: 13, borderRadius: 14, background: 'var(--mt-bg)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center' }}>
        {['订单问题', '路线变更', '紧急求助'].map((label) => (
          <button key={label} style={{ padding: '9px 4px', borderRadius: 10, background: '#fff', fontSize: 12, fontWeight: 800, boxShadow: 'var(--shadow-1)' }}>{label}</button>
        ))}
      </div>
    </>
  );
}

function SettingsSheet({ scene }: { scene: Scene }) {
  const cityName = scene === 'bj' ? '北京' : '深圳';
  const sections = [
    {
      title: '通知',
      rows: [
        { label: '行程节点提醒', value: '开启', on: true },
        { label: '天气突变提醒', value: '开启', on: true },
        { label: '排队与闭园提醒', value: '提前 30 分钟', on: true },
      ],
    },
    {
      title: '隐私与共享',
      rows: [
        { label: '同行人实时位置', value: '仅旅程中共享', on: true },
        { label: '允许同行人编辑待办', value: '开启', on: true },
        { label: '分享页隐藏订单金额', value: '开启', on: true },
      ],
    },
    {
      title: '语言与显示',
      rows: [
        { label: '界面语言', value: '简体中文' },
        { label: '地图显示', value: `${cityName} · 浅色地图` },
        { label: '大字号模式', value: '关闭', on: false },
      ],
    },
    {
      title: '出行偏好',
      rows: [
        { label: '少走路路线', value: '优先推荐', on: true },
        { label: '预算提醒', value: '超过 ¥500 提醒', on: true },
        { label: '老人小孩友好', value: '已纳入排序', on: true },
      ],
    },
  ];
  return (
    <>
      <div style={{ fontSize: 19, fontWeight: 900, marginBottom: 4 }}>设置</div>
      <div className="text-tiny text-muted" style={{ marginBottom: 14, lineHeight: 1.6 }}>
        管理通知、共享权限、地图显示与本次旅程偏好。
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sections.map((section) => (
          <div key={section.title}>
            <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--mt-text-3)', margin: '0 2px 7px' }}>{section.title}</div>
            <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--mt-line-2)', background: '#fff' }}>
              {section.rows.map((row, i) => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 13px', borderBottom: i < section.rows.length - 1 ? '1px solid var(--mt-line-2)' : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 850 }}>{row.label}</div>
                    <div className="text-tiny text-muted" style={{ marginTop: 3 }}>{row.value}</div>
                  </div>
                  {'on' in row ? <SettingSwitch on={Boolean(row.on)} /> : <span style={{ color: 'var(--mt-text-3)', fontSize: 18 }}>›</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
        <button className="btn-ghost">清理本地缓存</button>
        <button className="btn-primary">保存设置</button>
      </div>
    </>
  );
}

function SettingSwitch({ on }: { on: boolean }) {
  return (
    <span style={{ width: 42, height: 24, borderRadius: 999, padding: 2, background: on ? 'var(--mt-green)' : 'var(--mt-line)', display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start', flexShrink: 0 }}>
      <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 6px rgba(15,23,42,.18)' }} />
    </span>
  );
}

function WeatherSheet({ scene, weather, forecastDays }: {
  scene: Scene; weather: Weather;
  forecastDays: { date: string; cond: string; tempH: number; tempL: number }[];
}) {
  const meta = WEATHER_META[weather];
  const displayDays = forecastDays.length > 0
    ? forecastDays.map((d) => `${d.date} ${d.cond} ${d.tempL}°/${d.tempH}°`)
    : (scene === 'bj'
        ? ['今天 小雨 22°/17°', '明天 多云 26°/18°', '后天 晴 28°/19°']
        : ['今天 小雪 -2°/-5°', '明天 晴 25°/20°', '后天 小雨 22°/18°']);
  return (
    <>
      <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 12 }}>天气预报</div>
      <div style={{ padding: 14, borderRadius: 14, background: 'linear-gradient(135deg,#eff6ff,#fff)', border: '1px solid #bfdbfe', display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 32 }}>{meta.icon}</span>
        <div><div style={{ fontSize: 18, fontWeight: 900 }}>{meta.temp} {meta.title}</div><div className="text-small text-muted" style={{ marginTop: 4 }}>{meta.outfit}</div></div>
      </div>
      {displayDays.map((d, i) => <div key={d} className="card" style={{ marginBottom: 9, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontWeight: 800 }}>{d}</span><span className="text-tiny text-muted">{i === 0 ? '当前路线已适配' : '可自动重排'}</span></div>)}
    </>
  );
}

function FortuneSheet({ scene }: { scene: Scene }) {
  return (
    <>
      <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 12 }}>今日运势解析</div>
      <div style={{ padding: 15, borderRadius: 14, background: 'linear-gradient(135deg,#fff7ed,#f1ebff)', border: '1px solid #fed7aa', marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 900 }}>🍀 小吉 · 适合临时加一站</div>
        <div className="text-small text-muted" style={{ marginTop: 8, lineHeight: 1.65 }}>
          {scene === 'bj' ? '家庭出行今天适合把午餐提前，老人和孩子体力会更稳；下午推荐安排室内或近距离胡同点位。' : '今天适合海港附近慢逛，咖啡和室内商场是加分项；若天气转雨，系统会把山顶类点位延后。'}
        </div>
      </div>
      {['财运：优惠券命中率高', '拍照运：傍晚光线最佳', '避坑：高排队点位会自动提醒'].map((x) => <div key={x} className="card" style={{ marginBottom: 8, fontSize: 13.5, fontWeight: 700 }}>{x}</div>)}
    </>
  );
}

function TeaSheet({ scene, onDelivery }: { scene: Scene; onDelivery: (choice: DeliveryChoice) => void }) {
  const isBj = scene === 'bj';
  const [batch, setBatch] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [items, setItems] = useState<MicroItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getMicroRecs(scene, batch, 5)
      .then((data) => setItems(data))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [scene, batch]);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 19, fontWeight: 800 }}>{isBj ? '吃了嘛您' : '得闲饮茶啦'}</div>
        <button
          onClick={() => { setBatch((v) => v + 1); setExpanded(null); }}
          disabled={loading}
          style={{ padding: '7px 12px', borderRadius: 999, background: '#1a1a1a', color: '#fff', fontSize: 12, fontWeight: 800, opacity: loading ? 0.6 : 1 }}
        >
          {loading ? '加载中…' : '🔄 换一批'}
        </button>
      </div>
      <div style={{ padding: 14, borderRadius: 14, background: 'linear-gradient(135deg,#fff7d6,#fff)', border: '1px solid #facc15', marginBottom: 12, fontSize: 13.5, fontWeight: 800 }}>
        {isBj ? '🥟 附近北京特色茶饮小吃 · 点外卖或到店' : '🍵 广东特色饮品早茶 · 点外卖或到店'}
      </div>
      {items.length === 0 && !loading && (
        <div className="text-small text-muted" style={{ textAlign: 'center', padding: '24px 0' }}>
          暂无推荐，请稍后再试
        </div>
      )}
      {items.length === 0 && loading && (
        <StreamingStatus
          title="正在寻找附近推荐"
          messages={[
            '读取当前位置附近候选',
            '过滤饮品和小吃类型',
            '按距离和评分排序',
            '同步推荐卡片',
          ]}
        />
      )}
      {items.map((item) => {
        const open = expanded === item.id;
        const priceText = item.price ? `¥${item.price}/人` : '';
        const recs = item.recommended?.join(' / ') || item.desc;
        return (
          <div key={item.id} className="card" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
            <Photo seed={item.name} src={item.photo} width={72} height={72} radius={10} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 900 }}>{item.name}</span>
                <span style={{ fontSize: 10.5, padding: '1px 5px', borderRadius: 3, background: item.mode === '外卖' ? '#fff0e0' : '#f0f8ff', color: item.mode === '外卖' ? 'var(--mt-orange)' : '#3b82f6', fontWeight: 700 }}>{item.mode}</span>
              </div>
              <div className="text-tiny text-muted" style={{ marginTop: 4 }}>{item.category_2} · {item.area}</div>
              <div style={{ marginTop: 4, display: 'flex', gap: 10, fontSize: 12 }}>
                <span style={{ color: 'var(--mt-orange)', fontWeight: 800 }}>★ {item.rating}</span>
                {priceText && <span style={{ color: 'var(--mt-text-3)', fontWeight: 700 }}>{priceText}</span>}
              </div>
              {open && (
                <div className="text-tiny" style={{ marginTop: 8, padding: 8, borderRadius: 8, background: 'var(--mt-bg)', color: 'var(--mt-text-2)', lineHeight: 1.65 }}>
                  {recs && <div>推荐：{recs}</div>}
                  {item.address && <div style={{ marginTop: 4, color: 'var(--mt-text-3)' }}>📍 {item.address}</div>}
                </div>
              )}
            </div>
            {item.mode === '外卖' ? (
              <button
                onClick={() => onDelivery({ name: item.name, desc: item.desc, price: priceText, seed: item.name, photo: item.photo, scene })}
                className="btn-go"
                style={{ width: 58, height: 30, fontSize: 12, flexShrink: 0, marginTop: 4 }}
              >
                外卖
              </button>
            ) : (
              <button
                onClick={() => setExpanded(open ? null : item.id)}
                className="btn-go"
                style={{ width: 58, height: 30, fontSize: 12, flexShrink: 0, marginTop: 4 }}
              >
                {open ? '收起' : '展开'}
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}

function DeliverySheet({ choice }: { choice: DeliveryChoice | null }) {
  if (!choice) return null;
  const isBj = choice.scene === 'bj';
  const sides = isBj ? ['北冰洋', '炸灌肠小份', '糖火烧'] : ['冰奶茶', '鸡蛋仔', '菠萝油'];
  return (
    <>
      <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 12 }}>外卖下单</div>
      <div style={{ borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--shadow-1)', marginBottom: 12 }}>
        <Photo seed={choice.seed} src={choice.photo} height={150} radius={0} />
        <div style={{ padding: 14, background: '#fff' }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{choice.name}</div>
          <div className="text-small text-muted" style={{ marginTop: 6, lineHeight: 1.55 }}>{choice.desc}</div>
          <div style={{ marginTop: 8, color: 'var(--mt-orange)', fontSize: 15, fontWeight: 900 }}>{choice.price}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
        {[
          ['送达', isBj ? '32 min' : '28 min'],
          ['配送', isBj ? '¥5' : '¥4'],
          ['距离', isBj ? '1.6 km' : '1.1 km'],
        ].map(([label, value]) => (
          <div key={label} style={{ padding: 10, borderRadius: 12, background: 'var(--mt-bg)', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 900 }}>{value}</div>
            <div className="text-tiny text-muted" style={{ marginTop: 3 }}>{label}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13.5, fontWeight: 900, marginBottom: 8 }}>顺手加一份</div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {sides.map((side) => (
            <button key={side} style={{ padding: '7px 10px', borderRadius: 999, background: '#fff7d6', color: '#8a5a00', fontSize: 12, fontWeight: 800 }}>
              + {side}
            </button>
          ))}
        </div>
      </div>

      <button className="btn-primary">{isBj ? '打开美团外卖 · 吃了嘛您' : '打开美团外卖 · 得闲饮茶'}</button>
    </>
  );
}

function TaxiSheet({ scene, place }: { scene: Scene; place: BoardItem | MapPin | null }) {
  return (
    <>
      <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 12 }}>美团打车</div>
      <div style={{ padding: 14, borderRadius: 14, background: 'linear-gradient(135deg,#fff8d6,#ffe7a3)', border: '1px solid #facc15', marginBottom: 12 }}>
        <div className="text-tiny text-muted">目的地</div>
        <div style={{ fontSize: 17, fontWeight: 900, marginTop: 4 }}>{place?.name ?? ''}</div>
        <div className="text-small text-muted" style={{ marginTop: 6 }}>预计 5-8 分钟上车 · 已按当前行程预填目的地</div>
      </div>
      {[['快车', '约 ¥28', '2 min'], ['舒适型', '约 ¥42', '4 min'], ['六座商务', '约 ¥68', '6 min']].map(([name, price, wait]) => (
        <div key={name} className="card" style={{ display: 'flex', alignItems: 'center', marginBottom: 9 }}>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 900 }}>{name}</div><div className="text-tiny text-muted" style={{ marginTop: 3 }}>{wait} 接驾</div></div>
          <div style={{ color: 'var(--mt-orange)', fontWeight: 900 }}>{price}</div>
        </div>
      ))}
      <button className="btn-primary" style={{ marginTop: 8 }}>确认呼叫</button>
    </>
  );
}

function PlaceSheet({ place, onTaxi }: { place: BoardItem | MapPin | null; onTaxi: () => void }) {
  if (!place) return null;
  const seed = 'photoSeed' in place ? place.photoSeed : 'victoria-harbour';
  const desc = 'desc' in place ? place.desc : '';
  const img = 'imageUrl' in place ? place.imageUrl : undefined;
  return (
    <>
      <Photo seed={seed} src={img || undefined} height={180} radius={16} style={{ marginBottom: 12 }} />
      <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 6 }}>{place.name}</div>
      <div style={{ color: 'var(--mt-orange)', fontWeight: 900, marginBottom: 8 }}>★ {place.rating}</div>
      <div className="text-small text-muted" style={{ lineHeight: 1.7, marginBottom: 14 }}>{desc}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-ghost" style={{ flex: 1 }}>加入行程</button>
        <button onClick={onTaxi} className="btn-primary" style={{ flex: 1 }}>美团打车</button>
      </div>
    </>
  );
}

function ShareSheet({ scene }: { scene: Scene }) {
  const tripName = scene === 'bj' ? '北京家庭文化游' : '深圳周末游';
  const channels = [
    { name: '微信', logo: 'wechat', bg: '#07c160' },
    { name: '朋友圈', logo: 'moments', bg: '#1aad19' },
    { name: 'QQ', logo: 'qq', bg: '#12b7f5' },
    { name: '微博', logo: 'weibo', bg: '#ff8200' },
    { name: '小红书', logo: 'xiaohongshu', bg: '#ff2442' },
    { name: '复制链接', logo: 'link', bg: '#111827' },
    { name: '保存图片', logo: 'image', bg: '#8b5cf6' },
    { name: '更多', logo: 'more', bg: '#f3f4f6' },
  ];
  return (
    <>
      <div style={{ fontSize: 19, fontWeight: 900, marginBottom: 4 }}>分享我的旅程</div>
      <div className="text-tiny text-muted" style={{ marginBottom: 14, lineHeight: 1.6 }}>
        将「{tripName}」分享到社交平台，朋友可以看到路线、站点与旅行进度。
      </div>

      <div style={{ padding: 14, borderRadius: 16, background: 'linear-gradient(135deg,#fff8d6,#fff)', border: '1px solid #facc15', boxShadow: 'var(--shadow-1)', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 54, height: 54, borderRadius: 14, background: 'linear-gradient(135deg,#ffd84a,#f59e0b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 25, boxShadow: '0 10px 22px rgba(245,158,11,.24)' }}>
            ↗
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 900 }}>{tripName}</div>
            <div className="text-tiny text-muted" style={{ marginTop: 5, lineHeight: 1.5 }}>
              路线地图 · 打卡进度 · 美食景点清单
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
        {channels.map((channel) => (
          <button key={channel.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <span style={{ width: 48, height: 48, borderRadius: '50%', background: channel.bg, color: channel.logo === 'more' ? '#374151' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 9px 18px rgba(15,23,42,.12)' }}>
              <SocialLogo logo={channel.logo as SocialLogoKind} />
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--mt-text-2)', whiteSpace: 'nowrap' }}>
              {channel.name}
            </span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn-ghost" style={{ flex: 1 }}>生成分享图</button>
        <button className="btn-primary" style={{ flex: 1 }}>立即分享</button>
      </div>
    </>
  );
}

function CompanionSheet({ scene }: { scene: Scene }) {
  const tripName = scene === 'bj' ? '北京家庭文化游' : '深圳周末游';
  const inviteUrl = `https://go.meituan.com/trip/${scene}-weekend`;
  return (
    <>
      <div style={{ fontSize: 19, fontWeight: 900, marginBottom: 4 }}>共享看板给同行人</div>
      <div className="text-tiny text-muted" style={{ marginBottom: 14, lineHeight: 1.6 }}>
        邀请同行人加入「{tripName}」，扫码或复制链接即可查看同一份动态看板。
      </div>

      <div style={{ padding: 14, borderRadius: 16, background: 'linear-gradient(135deg,#f8fafc,#fff)', border: '1px solid var(--mt-line-2)', boxShadow: 'var(--shadow-1)', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 42, height: 42, borderRadius: 13, background: 'var(--mt-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21 }}>👥</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 900 }}>{tripName}</div>
            <div className="text-tiny text-muted" style={{ marginTop: 4 }}>同行人可同步查看路线、待办和打卡进度</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0 16px' }}>
        <div style={{ width: 178, height: 178, borderRadius: 18, background: '#fff', padding: 12, boxShadow: '0 14px 32px rgba(15,23,42,.14)', border: '1px solid var(--mt-line-2)' }}>
          <div style={{ width: '100%', height: '100%', borderRadius: 12, background: 'repeating-linear-gradient(45deg,#111827 0 5px,#fff 5px 10px)' }} />
        </div>
      </div>

      <div style={{ padding: '11px 12px', borderRadius: 12, background: 'var(--mt-bg)', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--mt-text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {inviteUrl}
        </span>
        <button style={{ padding: '6px 10px', borderRadius: 8, background: '#fff', fontSize: 11.5, fontWeight: 900, boxShadow: 'var(--shadow-1)' }}>
          复制
        </button>
      </div>

      <button className="btn-primary" style={{ width: '100%' }}>复制邀请链接</button>
    </>
  );
}

type SocialLogoKind = 'wechat' | 'moments' | 'qq' | 'weibo' | 'xiaohongshu' | 'link' | 'image' | 'more';

function SocialLogo({ logo }: { logo: SocialLogoKind }) {
  const brandSources: Partial<Record<SocialLogoKind, string>> = {
    wechat: 'https://cdn.simpleicons.org/wechat/FFFFFF',
    qq: 'https://cdn.simpleicons.org/qq/FFFFFF',
    weibo: 'https://cdn.simpleicons.org/sinaweibo/FFFFFF',
    xiaohongshu: 'https://cdn.simpleicons.org/xiaohongshu/FFFFFF',
  };
  if (brandSources[logo]) {
    return <img src={brandSources[logo]} alt="" draggable={false} style={{ width: 27, height: 27, display: 'block' }} />;
  }
  if (logo === 'moments') {
    return (
      <svg width="29" height="29" viewBox="0 0 29 29" aria-hidden="true">
        <circle cx="14.5" cy="14.5" r="4.2" fill="none" stroke="currentColor" strokeWidth="2.3" />
        {[0, 60, 120, 180, 240, 300].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          const x1 = 14.5 + Math.cos(rad) * 7.2;
          const y1 = 14.5 + Math.sin(rad) * 7.2;
          const x2 = 14.5 + Math.cos(rad) * 11.2;
          const y2 = 14.5 + Math.sin(rad) * 11.2;
          return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />;
        })}
      </svg>
    );
  }
  if (logo === 'link') {
    return (
      <svg width="25" height="25" viewBox="0 0 25 25" aria-hidden="true">
        <path d="M10.5 8.2l1.3-1.3a4.2 4.2 0 015.9 5.9l-2 2a4.2 4.2 0 01-5.9 0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M14.5 16.8l-1.3 1.3a4.2 4.2 0 01-5.9-5.9l2-2a4.2 4.2 0 015.9 0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (logo === 'image') {
    return (
      <svg width="25" height="25" viewBox="0 0 25 25" aria-hidden="true">
        <rect x="4" y="5" width="17" height="15" rx="3" fill="none" stroke="currentColor" strokeWidth="2.1" />
        <circle cx="9" cy="10" r="1.8" fill="currentColor" />
        <path d="M6.8 17.2l4.2-4.1 3.1 3.1 1.8-1.8 2.5 2.8" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: 1 }}>•••</span>;
}

function OrdersSheet({ scene }: { scene: Scene }) {
  void scene;
  const orderId = window.localStorage.getItem('xiaotuan_order_id');
  // Backend returns more fields than the OrderDraft type — cast wide
  const [order, setOrder] = useState<(OrderDraft & { status?: string }) | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    setLoading(true);
    getOrder(orderId)
      .then((o) => setOrder(o as OrderDraft & { status?: string }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orderId]);

  const typeEmoji: Record<string, string> = { 交通: '🚄', 景点: '🏛️', 美食: '🍜', 酒店: '🏨' };

  return (
    <>
      <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 4 }}>订单与凭证</div>
      {!orderId && (
        <div className="text-small text-muted" style={{ marginBottom: 14, lineHeight: 1.6 }}>尚未创建订单。请先完成选址确认步骤。</div>
      )}
      {loading && (
        <StreamingStatus
          title="正在同步订单凭证"
          messages={[
            '读取订单号',
            '同步支付状态',
            '加载凭证列表',
            '刷新订单金额',
          ]}
        />
      )}
      {order && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', marginBottom: 10, borderBottom: '1px solid var(--mt-line-2)' }}>
            <span className="text-small" style={{ color: 'var(--mt-text-3)' }}>订单 {orderId?.slice(-8)}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: order.status === 'paid' ? 'var(--mt-green)' : 'var(--mt-orange)' }}>
              {order.status === 'paid' ? '✓ 已支付' : '待支付'} · ¥{order.total}
            </span>
          </div>
          {(order.items ?? []).map((item, i) => (
            <div key={item.id ?? i} className="card" style={{ marginBottom: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>{typeEmoji[item.type ?? ''] ?? '🎫'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800 }}>{item.name}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
                    <span className="text-tiny text-muted">{item.type}</span>
                    <span style={{ color: 'var(--mt-orange)', fontSize: 13, fontWeight: 800 }}>{item.amountText}</span>
                  </div>
                </div>
                <button style={{ height: 30, padding: '0 12px', borderRadius: 8, background: 'var(--mt-bg)', fontSize: 11.5, fontWeight: 700, flexShrink: 0 }}>
                  出示凭证
                </button>
              </div>
              <div className="text-tiny text-muted" style={{ marginTop: 8, borderTop: '1px solid var(--mt-line-2)', paddingTop: 8 }}>
                凭证号：GO-{String(2305 + i).padStart(4, '0')}-{item.id?.slice(-6) ?? `77${i}`}
              </div>
            </div>
          ))}
          {(order.items ?? []).length === 0 && (
            <div className="text-small text-muted" style={{ textAlign: 'center', padding: '20px 0' }}>暂无行程票券</div>
          )}
        </>
      )}
    </>
  );
}

function TraceSheet() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}><GoMark size={32} /><div><div style={{ fontSize: 19, fontWeight: 800 }}>小go旅迹</div><div className="text-tiny text-muted">正在跟随你的旅程</div></div></div>
      <div style={{ marginTop: 14, padding: 14, borderRadius: 14, background: 'linear-gradient(135deg,#f1ebff,#e8f0ff)' }}><div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>✨ 智能生成回忆 · 一键分享</div><div className="text-small" style={{ color: 'var(--mt-text-2)', lineHeight: 1.6 }}>山河辽阔，脚步不停，下一程已在路上。</div></div>
      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>{['全屏地图路线', '分享我的旅程', '共享看板给同行人', '订单与凭证', '设置'].map((label, i) => <div key={label} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--mt-bg)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{['🗺️', '📸', '🔗', '🎫', '⚙️'][i]}</span><div style={{ flex: 1, fontSize: 13.5, fontWeight: 800 }}>{label}</div><span style={{ color: 'var(--mt-text-3)' }}>›</span></div>)}</div>
    </>
  );
}

const circleButtonStyle = {
  width: 32, height: 32, borderRadius: '50%', background: '#f5f6f8',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 20, color: '#1a1a1a',
};

const mapControlStyle = {
  width: 44, height: 44, borderRadius: '50%', background: '#fff',
  boxShadow: 'var(--shadow-2)', fontSize: 16, fontWeight: 800,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const floatBtnStyle = {
  position: 'relative' as const,
  width: 54, height: 54, borderRadius: '50%', background: '#fff',
  boxShadow: '0 10px 26px rgba(0,0,0,.18), 0 0 0 3px rgba(255,255,255,.72)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 25,
};
