/**
 * P8 — Full-screen route map.
 *
 * Uses the shared slippy-map projection helpers from Step7_Board, but expands
 * to fill the whole screen and adds a selectable station list below.
 * Route data is loaded from /api/itinerary/preview + /api/pois.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileFrame } from '../components/MobileFrame';
import { StatusBar } from '../components/StatusBar';
import { GoMark } from '../components/Atoms';
import { StreamingStatus } from '../components/StreamingStatus';
import { useApp } from '../store';
import { callRide, checkInStation, getBoardState, getPreview, getPickerItems, getWeather } from '../api';
import { worldX, worldY, fitZoom, centerWorld, visibleTiles, type LatLng } from '../components/mapProjection';

// ── Types ───────────────────────────────────────────────────────────────────

interface MapStation {
  id: string;
  name: string;
  cat: '景点' | '美食' | '酒店' | '交通';
  rating: number;
  day: 1 | 2;
  /** Geographic position — projected to screen at render time */
  lat: number;
  lng: number;
  done?: boolean;
}

const catColor: Record<MapStation['cat'], string> = {
  景点: '#3b82f6', 美食: '#fb923c', 酒店: '#8b5cf6', 交通: '#10b981',
};
const catEmoji: Record<MapStation['cat'], string> = {
  景点: '📍', 美食: '🍜', 酒店: '🏨', 交通: '🚄',
};

function localDistanceKm(from?: MapStation, to?: MapStation): number | null {
  if (!from || !to) return null;
  const earthKm = 6371;
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function localRideQuote(scene: string, from?: MapStation, to?: MapStation) {
  const distance = localDistanceKm(from, to);
  if (distance == null) return null;
  const km = Math.max(0.6, Math.round(distance * 10) / 10);
  const base = scene === 'bj' ? 16 : 13;
  const estimate = Math.max(18, Math.round(base + km * 5.8));
  const etaMin = Math.max(6, Math.round((km / (km > 3 ? 20 : 12)) * 60));
  return { km, estimate, etaMin, carType: '美团快车' };
}

function cleanCarType(value?: string) {
  return (value || '美团快车').replace(/[（(]\s*mock\s*[）)]/ig, '').trim();
}

function formatKm(value?: number) {
  if (value == null || Number.isNaN(value)) return '--';
  return value.toFixed(value >= 10 ? 0 : 1);
}

// ── Component ───────────────────────────────────────────────────────────────

export default function Step8_BoardMap() {
  const nav = useNavigate();
  const { scene } = useApp();
  const [tab, setTab] = useState<'总览' | 'Day 1' | 'Day 2'>('总览');
  const [stations, setStations] = useState<MapStation[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [weatherText, setWeatherText] = useState('');
  const [rideQuote, setRideQuote] = useState<{ km: number; estimate: number; etaMin: number; carType: string } | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const orderId = window.localStorage.getItem('xiaotuan_order_id') ?? '';

  // Slippy-map view state — viewport top-left in world pixels at `zoom`.
  const MAP_H = 440;
  const mapWrapRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(390);
  const [zoom, setZoom] = useState(12);
  const [view, setView] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const drag = useRef<{ sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);

  // ── Load route data ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setStations([]);
    setActiveId(null);
    setLoadingRoute(true);

    Promise.all([getPreview(scene), getPickerItems(scene)]).then(([preview, items]) => {
      if (cancelled) return;
      type PoiWithCoords = { id: string; name: string; cat: string; rating: number; lat?: number; lng?: number };
      const pois = items.filter((it) => it.cat !== 'transport') as unknown as PoiWithCoords[];
      const poiByName: Record<string, PoiWithCoords> = {};
      for (const p of pois) if (p.lat && p.lng) poiByName[p.name] = p;
      const ratingMap: Record<string, number> = {};
      for (const p of pois) ratingMap[p.name] = p.rating ?? 0;

      const built: MapStation[] = [];
      (preview.days ?? []).forEach((day, di) => {
        (day.items ?? []).forEach((it) => {
          if (it.cat === '交通') return;
          const poi = poiByName[it.name];
          if (!poi?.lat || !poi?.lng) return;
          built.push({
            id: poi.id || `station-${di}-${it.name}`,
            name: it.name,
            cat: (it.cat === '酒店' ? '景点' : it.cat) as MapStation['cat'],
            rating: ratingMap[it.name] || it.rating || 0,
            day: di === 0 ? 1 : 2,
            lat: poi.lat,
            lng: poi.lng,
          });
        });
      });

      setStations(built);
      if (built.length > 0) setActiveId(built[0].id);
      // (fit-to-bounds runs in a dedicated effect once stations + width are known)
    }).catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingRoute(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scene]);

  // ── Measure map width + fit the whole route into the viewport ────────────
  useEffect(() => {
    const measure = () => { if (mapWrapRef.current) setViewW(mapWrapRef.current.clientWidth || 390); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    const pts: LatLng[] = (tab === 'Day 1' ? stations.filter((s) => s.day === 1)
      : tab === 'Day 2' ? stations.filter((s) => s.day === 2)
      : stations).map((s) => ({ lat: s.lat, lng: s.lng }));
    if (pts.length === 0) return;
    const z = fitZoom(pts, viewW, MAP_H, { pad: 46, max: 15 });
    const c = centerWorld(pts, z);
    setZoom(z);
    setView({ x: c.x - viewW / 2, y: c.y - MAP_H / 2 });
  }, [stations, tab, viewW]);

  // ── Load completed IDs ───────────────────────────────────────────────────
  useEffect(() => {
    if (!orderId) return;
    getBoardState(orderId)
      .then((state) => setCompletedIds(new Set(state.completedStationIds)))
      .catch(() => undefined);
  }, [orderId, scene]);

  // ── Weather ──────────────────────────────────────────────────────────────
  useEffect(() => {
    getWeather(scene)
      .then((forecast) => {
        const today = forecast.days[0];
        if (today) setWeatherText(`${forecast.city} ${today.cond} ${today.tempL}–${today.tempH}°`);
      })
      .catch(() => undefined);
  }, [scene]);

  // ── Ride quote for next station ──────────────────────────────────────────
  const filtered = tab === 'Day 1' ? stations.filter((s) => s.day === 1)
                 : tab === 'Day 2' ? stations.filter((s) => s.day === 2)
                 : stations;
  const rawActiveIdx = filtered.findIndex((s) => s.id === activeId);
  const activeIdx = rawActiveIdx >= 0 ? rawActiveIdx : 0;
  const cur = filtered[activeIdx];
  const next = filtered[activeIdx + 1];
  const selectedId = rawActiveIdx >= 0 ? activeId : cur?.id ?? null;
  const fallbackRideQuote = localRideQuote(scene, cur, next);
  const displayRideQuote = rideQuote
    ? { ...rideQuote, carType: cleanCarType(rideQuote.carType) }
    : fallbackRideQuote;

  useEffect(() => {
    if (!orderId || !cur || !next) { setRideQuote(null); return; }
    setRideQuote(null);
    callRide(orderId, cur.name, next.name)
      .then((q) => setRideQuote(q))
      .catch(() => setRideQuote(null));
  }, [orderId, cur?.name, next?.name]);

  const activateStation = async (id: string) => {
    setActiveId(id);
    setCompletedIds((prev) => new Set([...prev, id]));
    if (!orderId) return;
    await checkInStation(orderId, id).catch(() => undefined);
  };

  // ── Dynamic tiles + route geometry in world pixels ───────────────────────
  const tiles = visibleTiles(view.x, view.y, viewW, MAP_H, zoom);
  const routeWorld = filtered.map((s) => ({ x: worldX(s.lng, zoom), y: worldY(s.lat, zoom) }));
  const rMinX = routeWorld.length ? Math.min(...routeWorld.map((p) => p.x)) : 0;
  const rMinY = routeWorld.length ? Math.min(...routeWorld.map((p) => p.y)) : 0;
  const rMaxX = routeWorld.length ? Math.max(...routeWorld.map((p) => p.x)) : 0;
  const rMaxY = routeWorld.length ? Math.max(...routeWorld.map((p) => p.y)) : 0;
  const pathD = routeWorld.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x - rMinX} ${p.y - rMinY}`).join(' ');
  const doneD = routeWorld
    .slice(0, Math.max(1, activeIdx + 1))
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x - rMinX} ${p.y - rMinY}`)
    .join(' ');

  return (
    <MobileFrame>
      <StatusBar bg="#fff" />

      {/* Header */}
      <div style={{ height: 50, display: 'flex', alignItems: 'center', padding: '0 14px', background: '#fff', flexShrink: 0, borderBottom: '1px solid var(--mt-line)', gap: 8 }}>
        <button onClick={() => nav('/p7')} style={{ width: 32, height: 32, borderRadius: '50%', background: '#f5f6f8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>‹</button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 700 }}>
          🗺️ {scene === 'bj' ? '北京' : '深圳'}地图路线
        </div>
        <GoMark size={28} />
      </div>

      {/* Day tabs */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', background: '#fff', borderBottom: '1px solid var(--mt-line-2)' }}>
        {(['总览', 'Day 1', 'Day 2'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ flex: 1, height: 34, borderRadius: 999, background: tab === t ? '#1a1a1a' : 'var(--mt-bg)', color: tab === t ? '#fff' : 'var(--mt-text-2)', fontSize: 12.5, fontWeight: 800 }}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="scroll-area" style={{ padding: 0 }}>
        {/* Full-screen OSM tile map */}
        <div
          ref={mapWrapRef}
          style={{ position: 'relative', height: MAP_H, background: '#eef3f5', overflow: 'hidden' }}
        >
          {/* Draggable viewport */}
          <div
            onPointerDown={(e) => {
              drag.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const dx = e.clientX - drag.current.sx;
              const dy = e.clientY - drag.current.sy;
              if (!drag.current.moved) {
                if (Math.abs(dx) + Math.abs(dy) < 4) return;
                drag.current.moved = true;
                e.currentTarget.setPointerCapture(e.pointerId);
              }
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
              {tiles.map((tile) => (
                <img
                  key={tile.key}
                  src={tile.src}
                  alt=""
                  draggable={false}
                  style={{ position: 'absolute', left: tile.left, top: tile.top, width: 256, height: 256, opacity: 0.48, filter: 'saturate(.64) brightness(1.12)' }}
                />
              ))}

              {/* Route lines */}
              {filtered.length >= 2 && (
                <svg
                  width={Math.max(1, rMaxX - rMinX)}
                  height={Math.max(1, rMaxY - rMinY)}
                  style={{ position: 'absolute', left: rMinX, top: rMinY, overflow: 'visible' }}
                >
                  <path
                    d={pathD}
                    stroke="rgba(124,58,237,.25)" strokeWidth="6" fill="none"
                    strokeDasharray="12 10" strokeLinecap="round"
                  />
                  <path
                    d={doneD}
                    stroke="#7c3aed" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round"
                  />
                  <path
                    d={doneD}
                    stroke="#fff" strokeWidth="1.5" strokeDasharray="10 12" fill="none" strokeLinecap="round" opacity="0.72"
                  />
                </svg>
              )}

              {/* Station pins */}
              {filtered.map((s, i) => {
                const done = completedIds.has(s.id) || i < activeIdx;
                const isActive = s.id === selectedId;
                const px = worldX(s.lng, zoom);
                const py = worldY(s.lat, zoom);
                return (
                  <div
                    key={s.id}
                    onClick={() => activateStation(s.id)}
                    style={{
                      position: 'absolute', left: px, top: py,
                      transform: 'translate(-50%, -50%)',
                      cursor: 'pointer', zIndex: isActive ? 10 : 3,
                    }}
                  >
                    <div style={{
                      width: isActive ? 30 : 22, height: isActive ? 30 : 22,
                      borderRadius: '50%',
                      background: done ? 'var(--mt-green)' : isActive ? catColor[s.cat] : '#fff',
                      border: `2px solid ${done ? 'var(--mt-green)' : catColor[s.cat]}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: isActive ? 13 : 10,
                      boxShadow: isActive ? `0 6px 14px ${catColor[s.cat]}50` : '0 3px 7px rgba(0,0,0,.14)',
                      transition: 'all .2s',
                    }}>
                      {done ? <span style={{ color: '#fff', fontWeight: 900 }}>✓</span> : catEmoji[s.cat]}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top-left info chip */}
          <div style={{ position: 'absolute', top: 10, left: 10, padding: '6px 12px', borderRadius: 999, background: 'rgba(255,255,255,.94)', fontSize: 11.5, fontWeight: 700, boxShadow: 'var(--shadow-1)' }}>
            {filtered.length > 0 ? `${tab === '总览' ? '全程' : tab} · ${filtered.length} 站` : loadingRoute ? '同步中…' : '暂无路线'}
          </div>

          {/* Weather chip */}
          {weatherText && (
            <div style={{ position: 'absolute', top: 10, right: 10, padding: '6px 12px', borderRadius: 999, background: 'rgba(255,255,255,.94)', fontSize: 11, fontWeight: 600, boxShadow: 'var(--shadow-1)' }}>
              {weatherText}
            </div>
          )}

          {/* Legend */}
          <div style={{ position: 'absolute', bottom: 10, left: 10, display: 'flex', gap: 8, padding: '6px 12px', borderRadius: 999, background: 'rgba(255,255,255,.94)', fontSize: 10.5, fontWeight: 600, boxShadow: 'var(--shadow-1)' }}>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#10b981', marginRight: 4 }} />已完成</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#7c3aed', marginRight: 4 }} />当前</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#fff', border: '1.5px solid #3b82f6', marginRight: 4 }} />待访</span>
          </div>

          {/* Empty state */}
          {stations.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {loadingRoute ? (
                <StreamingStatus
                  title="正在加载地图数据"
                  compact
                  style={{ width: 300, background: 'rgba(255,255,255,.94)' }}
                  messages={[
                    '读取行程预览',
                    '匹配 POI 坐标',
                    '生成地图站点',
                    '铺设路线连线',
                  ]}
                />
              ) : (
                <div style={{ background: 'rgba(255,255,255,.9)', borderRadius: 12, padding: '16px 24px', fontSize: 13.5, fontWeight: 700, textAlign: 'center' }}>
                  暂无可显示路线
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom panel */}
        <div style={{ padding: 14 }}>
          {/* Active station card */}
          {loadingRoute && !cur && (
            <StreamingStatus
              title="正在同步路线站点"
              messages={[
                '读取 DAY 1 和 DAY 2',
                '过滤交通和自理节点',
                '匹配地图坐标',
                '刷新站点列表',
              ]}
            />
          )}

          {cur && (
            <div className="card fade-up" style={{ marginBottom: 12 }}>
              <div className="h-between" style={{ marginBottom: 6 }}>
                <div>
                  <div className="text-tiny text-muted">当前站点</div>
                  <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>{cur.name}</div>
                </div>
                <span style={{ padding: '4px 10px', borderRadius: 4, background: catColor[cur.cat] + '22', color: catColor[cur.cat], fontSize: 11.5, fontWeight: 800 }}>
                  {catEmoji[cur.cat]} {cur.cat} · {activeIdx + 1}/{filtered.length}
                </span>
              </div>
              <div className="hairline" />
              <div className="text-small" style={{ color: 'var(--mt-text-2)', lineHeight: 1.7, marginTop: 8 }}>
                ★ {cur.rating} · 点击地图上的图标切换站点{weatherText ? ` · ${weatherText}` : ''}
              </div>
            </div>
          )}

          {/* Next segment ride */}
          {next && (
            <div className="card" style={{ background: 'linear-gradient(135deg,#fff8d6,#ffe7a3)', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>🚕 下一段建议</div>
              <div className="text-small text-muted" style={{ marginBottom: 10, lineHeight: 1.6 }}>
                {cur?.name} → {next.name}，约 {formatKm(displayRideQuote?.km)} km，
                打车约 ¥{displayRideQuote?.estimate ?? '--'}
                {displayRideQuote?.etaMin ? ` · 约 ${displayRideQuote.etaMin} 分钟` : ''}
                {displayRideQuote?.carType ? ` · ${displayRideQuote.carType}` : ''}
              </div>
              <button className="btn-go" style={{ width: '100%', height: 36 }} onClick={() => activateStation(next.id)}>
                🚕 出发前往下一站
              </button>
            </div>
          )}

          {/* All stations list */}
          <div style={{ fontSize: 13, fontWeight: 700, margin: '0 4px 10px', color: 'var(--mt-text-2)' }}>
            📋 {tab} 全部站点
          </div>
          <div className="card" style={{ padding: 0 }}>
            {filtered.map((s, i) => {
              const done = completedIds.has(s.id) || i < activeIdx;
              const isActive = s.id === selectedId;
              return (
                <button
                  key={s.id}
                  onClick={() => activateStation(s.id)}
                  style={{
                    display: 'flex', width: '100%', alignItems: 'center', gap: 12,
                    padding: '12px 14px', textAlign: 'left',
                    background: isActive ? 'var(--mt-yellow-soft)' : '#fff',
                    borderBottom: i < filtered.length - 1 ? '1px solid var(--mt-line-2)' : 'none',
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: done ? 'var(--mt-green)' : isActive ? catColor[s.cat] : '#fff',
                    border: '2px solid ' + (done ? 'var(--mt-green)' : catColor[s.cat]),
                    color: done || isActive ? '#fff' : catColor[s.cat],
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800,
                  }}>
                    {done ? '✓' : catEmoji[s.cat]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{s.name}</div>
                    <div className="text-tiny text-muted" style={{ marginTop: 2 }}>{s.cat} · ★ {s.rating}</div>
                  </div>
                  {isActive && <GoMark size={20} />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-small text-muted" style={{ padding: '16px 14px', textAlign: 'center' }}>
                暂无站点数据
              </div>
            )}
          </div>

          <button className="btn-ghost" style={{ width: '100%', marginTop: 14 }} onClick={() => nav('/summary')}>
            🎉 行程结束 · 查看总结
          </button>
        </div>
      </div>
    </MobileFrame>
  );
}
