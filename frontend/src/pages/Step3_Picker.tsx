import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileFrame } from '../components/MobileFrame';
import { StatusBar } from '../components/StatusBar';
import { NavBar } from '../components/NavBar';
import { GoMark } from '../components/Atoms';
import { Photo } from '../components/Photo';
import { StreamingStatus } from '../components/StreamingStatus';
import { useApp } from '../store';
import type { Identity } from '../types';
import { getPickerItems } from '../api';

type Cat = 'all' | 'transport' | 'sight' | 'food' | 'hotel';
type Queue = '低' | '中' | '高';

interface TransportSchedule {
  no: string;
  dep: string;
  arr: string;
  mins: string;
  price: string;
  default?: boolean;
}

interface TransportItem {
  id: string;
  cat: 'transport';
  mode: '高铁' | '飞机';
  direction: '去程' | '返程';
  from: string;
  to: string;
  schedules: TransportSchedule[]; // schedules[0] = currently picked
}

interface POIItem {
  id: string;
  cat: 'sight' | 'food' | 'hotel';
  name: string;
  rating: number;
  duration: string;
  price: string;
  queue: Queue;
  hotelTier?: '高档型' | '豪华型' | '舒适型';
  hotelStatus?: string;
  subDesc: string;
  photoSeed: string;
  /** Pre-generated Qwen illustration URL (overrides loremflickr seed) */
  imageUrl?: string;
  badge?: { label: string; color: 'yellow' | 'red' | 'orange' };
  preselect?: boolean;
  // sight detail
  detail?: { tags: string[]; intro: string; tips: string[] };
  // food packages
  packages?: { id: string; name: string; price: string; original: string; items: string; subBadge: string }[];
}

type Item = TransportItem | POIItem;

const ITEMS: Item[] = [];

const BJ_ITEMS: Item[] = [];

const ITEMS_BY_SCENE: Record<'sz' | 'bj', Item[]> = { sz: [], bj: [] };

function defaultTransportPick(items: Item[]) {
  const init: Record<string, string> = {};
  items.forEach((it) => {
    if (it.cat === 'transport') {
      const def = it.schedules.find((s) => s.default);
      if (def) init[it.id] = def.no;
    }
  });
  return init;
}

function defaultSelectedItems(items: Item[]) {
  const next = new Set<string>();
  items.forEach((it) => {
    if ((it as POIItem).preselect || (it.cat === 'transport' && it.schedules.find((s) => s.default))) next.add(it.id);
  });
  return next;
}

const catChip: Record<Exclude<Cat,'all'>, { bg: string; fg: string }> = {
  transport: { bg: '#e8f0ff', fg: '#3b82f6' },
  sight:     { bg: '#e8f0ff', fg: '#3b82f6' },
  food:      { bg: '#fff1e6', fg: '#fb923c' },
  hotel:     { bg: '#f1ebff', fg: '#8b5cf6' },
};

export default function Step3_Picker() {
  const nav = useNavigate();
  const { selectedPOIs, setSelectedPOIs, togglePOI, scene, identity, poiPackages, setPoiPackage } = useApp();
  const [items, setItems] = useState<Item[]>(() => ITEMS_BY_SCENE[scene]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [cat, setCat] = useState<Cat>('all');
  const [foodSheet, setFoodSheet] = useState<POIItem | null>(null);
  const [scenicSheet, setScenicSheet] = useState<POIItem | null>(null);
  const [hotelSheet, setHotelSheet] = useState<POIItem | null>(null);
  const [overselectModal, setOverselectModal] = useState(false);
  const prevHotelCount = useRef(0);
  const [scheduleOpen, setScheduleOpen] = useState<Record<string, boolean>>({});
  const [transportPick, setTransportPick] = useState<Record<string, string>>(() => defaultTransportPick(items));

  // Load pickable cards from src/api; keep local page data as a fallback.
  useEffect(() => {
    let cancelled = false;
    const fallback = ITEMS_BY_SCENE[scene];
    const applyItems = (nextItems: Item[]) => {
      setItems(nextItems);
      setSelectedPOIs(defaultSelectedItems(nextItems));
      setTransportPick(defaultTransportPick(nextItems));
      nextItems.forEach((it) => {
        if (it.cat === 'food' && (it as POIItem).packages && (it as POIItem).preselect) {
          setPoiPackage(it.id, (it as POIItem).packages![0].id);
        }
      });
    };

    setLoadingItems(true);
    applyItems(fallback);
    setScheduleOpen({});
    getPickerItems(scene)
      .then((remoteItems) => {
        if (!cancelled) applyItems(remoteItems as Item[]);
      })
      .catch(() => {
        if (!cancelled) applyItems(fallback);
      })
      .finally(() => {
        if (!cancelled) setLoadingItems(false);
      });

    return () => {
      cancelled = true;
    };
  }, [scene]);

  // Watch hotel overselect — fire modal only when threshold is crossed
  useEffect(() => {
    const hotelCount = items.filter((i) => i.cat === 'hotel' && selectedPOIs.has(i.id)).length;
    const limit = identity.nights;
    if (hotelCount > limit && prevHotelCount.current <= limit) {
      setOverselectModal(true);
    }
    prevHotelCount.current = hotelCount;
  }, [selectedPOIs, identity.nights]);

  const filtered = items.filter((i) => cat === 'all' || i.cat === cat);
  const counts = {
    transport: items.filter((i) => i.cat === 'transport' && selectedPOIs.has(i.id)).length,
    sight:     items.filter((i) => i.cat === 'sight'     && selectedPOIs.has(i.id)).length,
    food:      items.filter((i) => i.cat === 'food'      && selectedPOIs.has(i.id)).length,
    hotel:     items.filter((i) => i.cat === 'hotel'     && selectedPOIs.has(i.id)).length,
  };
  const totalSelected = counts.transport + counts.sight + counts.food + counts.hotel;

  const cats: { key: Cat; label: string; count: number }[] = [
    { key: 'all',       label: '全部',  count: items.length },
    { key: 'transport', label: '🚄 交通', count: items.filter((i) => i.cat === 'transport').length },
    { key: 'sight',     label: '🌄 景点', count: items.filter((i) => i.cat === 'sight').length },
    { key: 'food',      label: '🍜 美食', count: items.filter((i) => i.cat === 'food').length },
    { key: 'hotel',     label: '🏨 酒店', count: items.filter((i) => i.cat === 'hotel').length },
  ];

  const toggleSchedule = (id: string) => setScheduleOpen((p) => ({ ...p, [id]: !p[id] }));
  const pickSchedule = (id: string, no: string) => {
    setTransportPick((p) => ({ ...p, [id]: no }));
    setScheduleOpen((p) => ({ ...p, [id]: false }));
    if (!selectedPOIs.has(id)) togglePOI(id);
  };

  return (
    <MobileFrame>
      <StatusBar bg="#fff" />
      <NavBar title="挑你想去的" />

      <div className="scroll-area" style={{ padding: '12px 14px 140px' }}>
        {/* Yellow intro card */}
        <div
          style={{
            background: 'linear-gradient(135deg,#fff8d6,#ffe7a3)',
            borderRadius: 14, padding: 14, marginBottom: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GoMark size={26} />
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 800 }}>
                {scene === 'sz' ? '深圳周末游' : '北京家庭文化游'}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--mt-text-3)', marginTop: 2 }}>
                {scene === 'sz' ? '广州 → 深圳 · 2 天 1 夜' : '河北 → 北京 · 2 天 1 夜'}
              </div>
            </div>
          </div>
          <div
            style={{
              background: 'rgba(255,255,255,.55)', borderRadius: 10,
              padding: 10, marginTop: 10,
              fontSize: 12.5, color: 'var(--mt-text-2)', lineHeight: 1.7,
            }}
          >
            👥 {summaryParty(identity)}<br />
            ✨ 已从后端读取候选卡片，当前<b>预先勾选 {totalSelected || 0} 个</b>
            {loadingItems ? '，正在同步最新数据' : '，可自由调整'}
          </div>
        </div>

        {loadingItems && (
          <StreamingStatus
            title="正在同步可选项目"
            messages={[
              '读取交通和目的地信息',
              '加载大众点评 POI 候选',
              '按你的偏好预勾选项目',
              '刷新景点、美食和酒店卡片',
            ]}
          />
        )}

        {/* Tab filters */}
        <div
          style={{
            display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 14, paddingBottom: 4,
          }}
        >
          {cats.map((c) => {
            const active = cat === c.key;
            return (
              <button
                key={c.key}
                onClick={() => setCat(c.key)}
                style={{
                  flexShrink: 0,
                  padding: '7px 14px', borderRadius: 999,
                  background: active ? '#1a1a1a' : '#fff',
                  color: active ? '#fff' : 'var(--mt-text-2)',
                  fontSize: 12.5, fontWeight: 600,
                  border: '1px solid ' + (active ? '#1a1a1a' : 'var(--mt-line)'),
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}
              >
                <span>{c.label}</span>
                <span
                  style={{
                    padding: '1px 6px', borderRadius: 999,
                    background: active ? 'rgba(255,255,255,.18)' : '#f0f1f3',
                    color: active ? '#fff' : 'var(--mt-text-3)',
                    fontSize: 10.5, fontWeight: 700,
                  }}
                >
                  {c.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((it) =>
            it.cat === 'transport' ? (
              <TransportCard
                key={it.id}
                item={it}
                checked={selectedPOIs.has(it.id)}
                onToggle={() => togglePOI(it.id)}
                pickedNo={transportPick[it.id]}
                scheduleOpen={!!scheduleOpen[it.id]}
                onToggleSchedule={() => toggleSchedule(it.id)}
                onPickSchedule={(no) => pickSchedule(it.id, no)}
              />
            ) : (
              <POICardView
                key={it.id}
                item={it}
                checked={selectedPOIs.has(it.id)}
                onToggle={() => togglePOI(it.id)}
                onDetail={() => {
                  if (it.cat === 'sight') setScenicSheet(it);
                  else if (it.cat === 'food') setFoodSheet(it);
                  else if (it.cat === 'hotel') setHotelSheet(it);
                }}
                pkgName={
                  it.cat === 'food' && poiPackages[it.id]
                    ? it.packages?.find((p) => p.id === poiPackages[it.id])?.name
                    : undefined
                }
              />
            ),
          )}
        </div>
      </div>

      {/* Sticky footer */}
      <div className="footer-bar" style={{ paddingTop: 12 }}>
        <div className="h-between" style={{ marginBottom: 10 }}>
          <div className="text-small" style={{ color: 'var(--mt-text-2)' }}>
            已选 <b style={{ color: 'var(--mt-orange)', fontSize: 15 }}>{totalSelected}</b> 项
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <CountPill emoji="🚄" n={counts.transport} />
            <CountPill emoji="🌄" n={counts.sight} />
            <CountPill emoji="🍜" n={counts.food} />
            <CountPill emoji="🏨" n={counts.hotel} />
          </div>
        </div>
        <button className="btn-primary" onClick={() => nav('/p4')}>
          下一步 · 帮我精细化排序 →
        </button>
      </div>

      {/* Food package sheet */}
      {foodSheet && (
        <FoodPackageSheet
          item={foodSheet}
          currentPackageId={poiPackages[foodSheet.id]}
          onClose={() => setFoodSheet(null)}
          onPick={(pkgId) => {
            setPoiPackage(foodSheet.id, pkgId);
            if (!selectedPOIs.has(foodSheet.id)) togglePOI(foodSheet.id);
            setFoodSheet(null);
          }}
          onRemove={() => {
            if (selectedPOIs.has(foodSheet.id)) togglePOI(foodSheet.id);
            setPoiPackage(foodSheet.id, null);
            setFoodSheet(null);
          }}
        />
      )}

      {/* Scenic detail sheet */}
      {scenicSheet && (
        <ScenicSheet
          item={scenicSheet}
          checked={selectedPOIs.has(scenicSheet.id)}
          onClose={() => setScenicSheet(null)}
          onToggle={() => togglePOI(scenicSheet.id)}
        />
      )}

      {/* Hotel detail sheet */}
      {hotelSheet && (
        <HotelSheet
          item={hotelSheet}
          checked={selectedPOIs.has(hotelSheet.id)}
          nights={identity.nights}
          onClose={() => setHotelSheet(null)}
          onToggle={() => togglePOI(hotelSheet.id)}
        />
      )}

      {/* Hotel overselect modal popup */}
      {overselectModal && (
        <OverselectModal
          nights={identity.nights}
          onClose={() => setOverselectModal(false)}
        />
      )}
    </MobileFrame>
  );
}

function summaryParty(id: Identity) {
  const parts = [`${id.partySize} 人`];
  if (id.hasElder) parts.push('含老人');
  if (id.hasKid) parts.push('含小孩');
  if (id.hasSpecial) parts.push('含特殊群体');
  if (id.preferences.length) parts.push(id.preferences.join('、'));
  return parts.join(' · ');
}

/* ============== POI / Food / Hotel card ============== */
function POICardView({
  item, checked, onToggle, onDetail, pkgName,
}: {
  item: POIItem; checked: boolean; onToggle: () => void;
  onDetail: () => void; pkgName?: string;
}) {
  const cc = catChip[item.cat];
  const catLabel = item.cat === 'sight' ? '景点' : item.cat === 'food' ? '美食' : '酒店';
  const checkColor =
    item.cat === 'sight' ? '#3b82f6' : item.cat === 'food' ? 'var(--mt-orange)' : '#8b5cf6';

  const queueChip =
    item.queue === '高' ? { bg: 'var(--mt-red-soft)', fg: 'var(--mt-red)', label: '排队高' }
    : item.queue === '中' ? { bg: '#fff5cc', fg: '#b88500', label: '排队中' }
    : { bg: 'var(--mt-green-soft)', fg: 'var(--mt-green)', label: '排队低' };
  const hotelChip = item.hotelTier
    ? {
      bg: item.hotelTier === '豪华型' ? '#f1ebff' : item.hotelTier === '高档型' ? '#e8f0ff' : 'var(--mt-green-soft)',
      fg: item.hotelTier === '豪华型' ? '#7c3aed' : item.hotelTier === '高档型' ? '#3b82f6' : 'var(--mt-green)',
      label: item.hotelTier,
    }
    : null;

  return (
    <div
      onClick={onDetail}
      style={{
        background: '#fff', borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
        border: checked ? `2px solid ${checkColor}` : '2px solid transparent',
        boxShadow: checked ? `0 6px 18px ${checkColor}28` : 'var(--shadow-1)',
      }}
    >
      <div style={{ display: 'flex', gap: 0, padding: 0 }}>
        {/* Photo */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Photo seed={item.photoSeed} src={item.imageUrl} width={104} height={item.cat === 'food' ? 138 : 100} radius={0} />
          <div
            style={{
              position: 'absolute', top: 8, left: 8,
              padding: '3px 9px', borderRadius: 6,
              background: cc.fg, color: '#fff',
              fontSize: 10.5, fontWeight: 800,
              display: 'inline-flex', alignItems: 'center', gap: 3,
            }}
          >
            <span style={{ fontSize: 11 }}>
              {item.cat === 'sight' ? '🌄' : item.cat === 'food' ? '🍜' : '🏨'}
            </span>
            {catLabel}
          </div>
          {item.badge && (
            <div
              style={{
                position: 'absolute', bottom: 8, left: 8,
                padding: '2px 8px', borderRadius: 4,
                background: item.badge.color === 'red' ? '#fde68a'
                  : item.badge.color === 'orange' ? '#ffd84a' : '#fff5cc',
                color: '#92400e',
                fontSize: 10, fontWeight: 800,
              }}
            >
              {item.badge.label}
            </div>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0, padding: 12, position: 'relative' }}>
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            style={{
              position: 'absolute', top: 10, right: 10,
              width: 24, height: 24, borderRadius: '50%',
              background: checked ? checkColor : '#fff',
              border: '2px solid ' + (checked ? checkColor : 'var(--mt-line)'),
              color: '#fff', fontSize: 14, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {checked && '✓'}
          </button>
          <div style={{ fontSize: 14.5, fontWeight: 700, paddingRight: 32 }}>{item.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--mt-orange)', fontWeight: 800 }}>★ {item.rating}</span>
            <span style={{ color: 'var(--mt-text-3)' }}>⏱ {item.duration}</span>
            <span style={{ color: 'var(--mt-orange)', fontWeight: 700 }}>{item.price}</span>
          </div>
          <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span
              style={{
                padding: '2px 7px', borderRadius: 4,
                background: hotelChip?.bg ?? queueChip.bg, color: hotelChip?.fg ?? queueChip.fg,
                fontSize: 10.5, fontWeight: 700,
              }}
            >
              {hotelChip?.label ?? queueChip.label}
            </span>
            {item.hotelStatus && (
              <span style={{ padding: '2px 7px', borderRadius: 4, background: '#fff8d6', color: '#b88500', fontSize: 10.5, fontWeight: 700 }}>
                {item.hotelStatus}
              </span>
            )}
          </div>
          <div className="text-tiny text-muted" style={{ marginTop: 6, lineHeight: 1.5 }}>
            {item.subDesc}
          </div>
        </div>
      </div>

      {/* Food package prompt — only for food */}
      {item.cat === 'food' && (
        <div
          onClick={(e) => { e.stopPropagation(); onDetail(); }}
          style={{
            margin: '0 12px 12px',
            padding: '8px 12px', borderRadius: 8,
            background: '#fff8d6',
            border: '1px dashed var(--mt-yellow-dark)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: 12, fontWeight: 700,
            color: '#b88500',
          }}
        >
          <span>🎫 {pkgName ? `已选：${pkgName}` : '请选择套餐'}</span>
          <span>修改 ›</span>
        </div>
      )}
    </div>
  );
}

/* ============== Transport card with schedule expand ============== */
function TransportCard({
  item, checked, onToggle, pickedNo, scheduleOpen, onToggleSchedule, onPickSchedule,
}: {
  item: TransportItem;
  checked: boolean;
  onToggle: () => void;
  pickedNo: string | undefined;
  scheduleOpen: boolean;
  onToggleSchedule: () => void;
  onPickSchedule: (no: string) => void;
}) {
  const picked = item.schedules.find((s) => s.no === pickedNo) ?? item.schedules[0];
  const dirColor = item.direction === '去程'
    ? { bg: '#fff5cc', fg: '#b88500' }
    : { bg: '#f1ebff', fg: 'var(--go-purple)' };

  return (
    <div
      style={{
        background: '#fff', borderRadius: 14, padding: 14,
        border: checked ? '2px solid #3b82f6' : '2px solid transparent',
        boxShadow: checked ? '0 6px 18px rgba(59,130,246,.18)' : 'var(--shadow-1)',
      }}
    >
      <div className="h-between" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 40, height: 40, borderRadius: 10,
              background: item.mode === '高铁'
                ? 'linear-gradient(135deg,#60a5fa,#3b82f6)'
                : 'linear-gradient(135deg,#a78bfa,#60a5fa)',
              color: '#fff', fontSize: 20,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {item.mode === '高铁' ? '🚄' : '✈️'}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  padding: '2px 7px', borderRadius: 4,
                  background: '#e8f0ff', color: '#3b82f6',
                  fontSize: 10.5, fontWeight: 800,
                }}
              >
                {item.mode}
              </span>
              <span
                style={{
                  padding: '2px 7px', borderRadius: 4,
                  background: dirColor.bg, color: dirColor.fg,
                  fontSize: 10, fontWeight: 800,
                }}
              >
                {item.direction}
              </span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>
              {item.from} → {item.to}
            </div>
          </div>
        </div>
        <button
          onClick={onToggle}
          style={{
            width: 24, height: 24, borderRadius: '50%',
            background: checked ? '#3b82f6' : '#fff',
            border: '2px solid ' + (checked ? '#3b82f6' : 'var(--mt-line)'),
            color: '#fff', fontSize: 13, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {checked && '✓'}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 4px' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{picked.dep}</div>
          <div className="text-tiny text-muted">{item.from}</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--mt-text-3)', fontWeight: 600 }}>
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', marginRight: 4 }} />
            {picked.mins}
            <span style={{ marginLeft: 4 }}>›</span>
          </div>
          <div
            style={{
              height: 1, marginTop: 4,
              backgroundImage: 'repeating-linear-gradient(90deg,#3b82f6 0 4px,transparent 4px 8px)',
            }}
          />
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{picked.arr}</div>
          <div className="text-tiny text-muted">{item.to}</div>
        </div>
      </div>

      <div className="hairline" style={{ marginTop: 12, marginBottom: 10 }} />
      <div className="h-between">
        <span className="text-small" style={{ color: 'var(--mt-text-3)' }}>{picked.no}</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--mt-orange)' }}>{picked.price} / 人</span>
        <button
          onClick={onToggleSchedule}
          style={{
            padding: '6px 12px', borderRadius: 999,
            background: scheduleOpen ? '#1a1a1a' : 'var(--mt-bg)',
            color: scheduleOpen ? '#fff' : 'var(--mt-text-2)',
            fontSize: 11.5, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          ⏱ 换班次 {scheduleOpen ? '∧' : '∨'}
        </button>
      </div>

      {scheduleOpen && (
        <div
          className="fade-up"
          style={{
            marginTop: 10,
            padding: 4,
            background: 'var(--mt-bg)', borderRadius: 10,
          }}
        >
          {item.schedules.map((s) => {
            const isPicked = s.no === picked.no;
            return (
              <button
                key={s.no}
                onClick={() => onPickSchedule(s.no)}
                style={{
                  display: 'flex', width: '100%', alignItems: 'center', gap: 12,
                  padding: '10px 12px', borderRadius: 8,
                  background: isPicked ? '#fff' : 'transparent',
                  border: isPicked ? '1px solid #3b82f6' : '1px solid transparent',
                  margin: '2px 0',
                  textAlign: 'left',
                }}
              >
                <div style={{ minWidth: 50, fontSize: 13, fontWeight: 700 }}>{s.dep}</div>
                <div style={{ flex: 1, fontSize: 11.5, color: 'var(--mt-text-3)' }}>
                  {s.mins} → {s.arr}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--mt-text-3)' }}>{s.no}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--mt-orange)', minWidth: 48, textAlign: 'right' }}>
                  {s.price}
                </div>
                {isPicked && <span style={{ color: '#3b82f6', fontWeight: 800 }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============== Food package selection sheet ============== */
function FoodPackageSheet({
  item, currentPackageId, onClose, onPick, onRemove,
}: {
  item: POIItem;
  currentPackageId?: string | null;
  onClose: () => void;
  onPick: (pkgId: string) => void;
  onRemove: () => void;
}) {
  const [tab, setTab] = useState<'package' | 'visit'>('package');
  const [selected, setSelected] = useState<string>(currentPackageId ?? item.packages?.[0]?.id ?? '');

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)',
        zIndex: 50, display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', background: '#fff',
          borderRadius: '20px 20px 0 0',
          padding: '16px 18px 22px',
          animation: 'sheetUp .3s ease',
          maxHeight: '78%', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div className="h-between" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Photo seed={item.photoSeed} src={item.imageUrl} width={44} height={44} radius={8} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{item.name}</div>
              <div className="text-tiny text-muted" style={{ marginTop: 2 }}>选择套餐 · 或只去店不团券</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: '50%', background: 'var(--mt-bg)',
              fontSize: 14, color: 'var(--mt-text-3)',
            }}
          >
            ×
          </button>
        </div>

        {/* Tab pair */}
        <div
          style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
            padding: 4, background: '#f5f6f8', borderRadius: 12,
            marginBottom: 14,
          }}
        >
          {[
            { k: 'package', t: '🎫 团套餐下单', s: '提前锁定优惠' },
            { k: 'visit',   t: '👀 只去店看看', s: '不团券 · 按门市价' },
          ].map((b) => {
            const active = tab === b.k;
            return (
              <button
                key={b.k}
                onClick={() => setTab(b.k as any)}
                style={{
                  padding: '8px 4px', borderRadius: 8,
                  background: active ? '#fff' : 'transparent',
                  boxShadow: active ? 'var(--shadow-1)' : 'none',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: active ? 'var(--mt-text)' : 'var(--mt-text-3)' }}>
                  {b.t}
                </div>
                <div className="text-tiny text-muted" style={{ marginTop: 2 }}>{b.s}</div>
              </button>
            );
          })}
        </div>

        {/* Packages */}
        {tab === 'package' && item.packages && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {item.packages.map((p) => {
              const isSel = selected === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelected(p.id)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: 14, borderRadius: 12,
                    background: isSel ? '#fff8d6' : '#fff',
                    border: '2px solid ' + (isSel ? 'var(--mt-yellow-dark)' : 'var(--mt-line)'),
                  }}
                >
                  <div className="h-between">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 800 }}>
                        {p.name}
                        <span style={{ color: 'var(--mt-orange)', marginLeft: 8, fontWeight: 800 }}>{p.price}</span>
                        <span style={{ color: 'var(--mt-text-4)', marginLeft: 6, fontSize: 12.5, textDecoration: 'line-through' }}>
                          {p.original}
                        </span>
                      </div>
                    </div>
                    <div
                      style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: isSel ? 'var(--mt-yellow-dark)' : '#fff',
                        border: '2px solid ' + (isSel ? 'var(--mt-yellow-dark)' : 'var(--mt-line)'),
                        color: '#fff', fontSize: 12, fontWeight: 800,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {isSel && '✓'}
                    </div>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--mt-text-2)', lineHeight: 1.7, marginTop: 6 }}>
                    {p.items}
                  </div>
                  <span
                    style={{
                      display: 'inline-block', marginTop: 8,
                      padding: '3px 8px', borderRadius: 4,
                      background: 'var(--mt-purple-soft)', color: 'var(--mt-purple)',
                      fontSize: 10.5, fontWeight: 700,
                    }}
                  >
                    {p.subBadge}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {tab === 'visit' && (
          <div
            style={{
              padding: 16, borderRadius: 12,
              background: 'var(--mt-bg)',
              fontSize: 13, color: 'var(--mt-text-2)', lineHeight: 1.7,
              marginBottom: 16,
            }}
          >
            👀 选择「只去店看看」，到店按门市价点单，本店不参与团购。<br />
            行程会保留这家店的时间段提醒。
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onRemove}
            className="btn-ghost"
            style={{ flex: 1, height: 48, borderRadius: 12, background: 'var(--mt-bg)' }}
          >
            从行程移除
          </button>
          <button
            onClick={() => tab === 'package' ? onPick(selected) : onPick(`visit:${item.id}`)}
            className="btn-primary"
            style={{ flex: 1.4 }}
          >
            {tab === 'package' ? '确认套餐 · 加入行程' : '只去店 · 加入行程'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============== Scenic spot detail sheet ============== */
function ScenicSheet({
  item, checked, onClose, onToggle,
}: {
  item: POIItem; checked: boolean; onClose: () => void; onToggle: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)',
        zIndex: 50, display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', background: '#fff',
          borderRadius: '20px 20px 0 0',
          maxHeight: '82%', overflowY: 'auto',
          animation: 'sheetUp .3s ease',
        }}
      >
        {/* Hero photo */}
        <Photo seed={item.photoSeed} src={item.imageUrl} height={180} radius={0}>
          <div
            style={{
              position: 'absolute', top: 12, left: 12,
              padding: '4px 10px', borderRadius: 6,
              background: 'rgba(0,0,0,.55)', color: '#fff',
              fontSize: 11, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            📷 高清实拍
          </div>
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: 12, right: 12,
              width: 30, height: 30, borderRadius: '50%',
              background: 'rgba(0,0,0,.55)', color: '#fff',
              fontSize: 16,
            }}
          >
            ×
          </button>
        </Photo>

        <div style={{ padding: '16px 18px 22px' }}>
          {/* Title + rating */}
          <div className="h-between" style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 19, fontWeight: 800 }}>{item.name}</div>
            <div style={{ fontSize: 14, color: 'var(--mt-orange)', fontWeight: 800 }}>★ {item.rating}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {item.detail?.tags.map((t) => (
              <span
                key={t}
                style={{
                  padding: '3px 9px', borderRadius: 999,
                  background: '#fff8d6', color: '#b88500',
                  fontSize: 11, fontWeight: 700,
                }}
              >
                {t}
              </span>
            ))}
          </div>

          {/* Info row */}
          <div
            style={{
              display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8,
              marginBottom: 14,
            }}
          >
            <InfoCell label="时长" value={item.duration} />
            <InfoCell label="门票" value={item.price} />
            <InfoCell label={item.cat === 'hotel' ? '档次' : '排队'} value={item.cat === 'hotel' ? (item.hotelTier ?? '高档型') : `${item.queue}峰`} />
          </div>

          {/* Intro */}
          <div style={{ fontSize: 13.5, color: 'var(--mt-text-2)', lineHeight: 1.85, marginBottom: 14 }}>
            {item.detail?.intro}
          </div>

          {/* Tips */}
          {item.detail?.tips && (
            <>
              <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}>💡 实用提示</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--mt-text-2)', lineHeight: 1.85, marginBottom: 16 }}>
                {item.detail.tips.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </>
          )}

          <button
            className={checked ? 'btn-ghost' : 'btn-primary'}
            style={{ width: '100%', height: 48, borderRadius: 14 }}
            onClick={() => { onToggle(); onClose(); }}
          >
            {checked ? '✓ 已加入行程，点击取消' : '＋ 加入我的行程'}
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '10px 12px', borderRadius: 10,
        background: 'var(--mt-bg)', textAlign: 'center',
      }}
    >
      <div className="text-tiny text-muted">{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function CountPill({ emoji, n }: { emoji: string; n: number }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        padding: '3px 8px', borderRadius: 999,
        background: 'var(--mt-bg)',
        fontSize: 11.5, fontWeight: 700,
      }}
    >
      <span style={{ fontSize: 11 }}>{emoji}</span>
      <span>{n}</span>
    </span>
  );
}

/* ============== Hotel detail sheet ============== */
function HotelSheet({
  item, checked, nights, onClose, onToggle,
}: {
  item: POIItem; checked: boolean; nights: number;
  onClose: () => void; onToggle: () => void;
}) {
  const isBj = item.photoSeed.startsWith('bj-');
  const roomTypes = isBj
    ? [
      { name: '亲子双床房', price: item.price, badge: '当前选择' },
      { name: '行政景观房', price: '¥1580 起 / 晚', badge: '升级 +¥300' },
      { name: '家庭套房', price: '¥1980 起 / 晚', badge: '4 人入住' },
    ]
    : [
      { name: '高级双床房', price: item.price, badge: '当前选择' },
      { name: '维港景观房', price: '¥1480 起 / 晚', badge: '升级 +¥320' },
      { name: '家庭套房', price: '¥1880 起 / 晚', badge: '4 人入住' },
    ];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)',
        zIndex: 50, display: 'flex', alignItems: 'flex-end',
        animation: 'overlayFade .25s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', background: '#fff',
          borderRadius: '20px 20px 0 0',
          maxHeight: '86%', overflowY: 'auto',
          animation: 'sheetUp .3s ease',
        }}
      >
        <Photo seed={item.photoSeed} src={item.imageUrl} height={200} radius={0}>
          <div
            style={{
              position: 'absolute', top: 12, left: 12,
              padding: '4px 10px', borderRadius: 6,
              background: 'rgba(0,0,0,.55)', color: '#fff',
              fontSize: 11, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            📷 高清实拍
          </div>
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: 12, right: 12,
              width: 30, height: 30, borderRadius: '50%',
              background: 'rgba(0,0,0,.55)', color: '#fff',
              fontSize: 16,
            }}
          >
            ×
          </button>
        </Photo>

        <div style={{ padding: '16px 18px 22px' }}>
          <div className="h-between" style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 19, fontWeight: 800 }}>{item.name}</div>
            <div style={{ fontSize: 14, color: 'var(--mt-orange)', fontWeight: 800 }}>★ {item.rating}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {item.detail?.tags.map((t) => (
              <span
                key={t}
                style={{
                  padding: '3px 9px', borderRadius: 999,
                  background: '#f1ebff', color: '#7c3aed',
                  fontSize: 11, fontWeight: 700,
                }}
              >
                {t}
              </span>
            ))}
          </div>

          {/* Booking info */}
          <div
            style={{
              padding: 12, borderRadius: 12,
              background: 'var(--mt-bg)',
              marginBottom: 14,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div className="text-tiny text-muted">入住</div>
              <div className="text-tiny text-muted">离店</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>05-23 周六</div>
              <div style={{ fontSize: 12, color: 'var(--mt-text-3)' }}>共 {nights} 晚</div>
              <div style={{ fontSize: 15, fontWeight: 800 }}>05-24 周日</div>
            </div>
          </div>

          <div style={{ fontSize: 13.5, color: 'var(--mt-text-2)', lineHeight: 1.9, marginBottom: 14 }}>
            {item.detail?.intro}
          </div>

          {/* Room types */}
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>🛏 房型选择</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {roomTypes.map((r, i) => (
              <div
                key={r.name}
                style={{
                  padding: 12, borderRadius: 10,
                  background: i === 0 ? '#fff8d6' : '#fff',
                  border: '1.5px solid ' + (i === 0 ? 'var(--mt-yellow-dark)' : 'var(--mt-line)'),
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{r.name}</div>
                  <div style={{
                    display: 'inline-block', marginTop: 4,
                    padding: '2px 7px', borderRadius: 4,
                    background: i === 0 ? '#ffd84a' : 'var(--mt-purple-soft)',
                    color: i === 0 ? '#92400e' : 'var(--mt-purple)',
                    fontSize: 10, fontWeight: 800,
                  }}>
                    {r.badge}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--mt-orange)' }}>{r.price}</div>
              </div>
            ))}
          </div>

          {/* Tips */}
          {item.detail?.tips && (
            <>
              <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}>💡 入住贴士</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--mt-text-2)', lineHeight: 1.85, marginBottom: 16 }}>
                {item.detail.tips.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </>
          )}

          <button
            className={checked ? 'btn-ghost' : 'btn-primary'}
            style={{ width: '100%', height: 48, borderRadius: 14 }}
            onClick={() => { onToggle(); onClose(); }}
          >
            {checked ? '✓ 已加入行程，点击取消' : '＋ 加入我的行程'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============== Overselect modal popup ============== */
function OverselectModal({ nights, onClose }: { nights: number; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)',
        zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 28px',
        animation: 'overlayFade .25s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 320, background: '#fff',
          borderRadius: 18, padding: '22px 22px 16px',
          boxShadow: '0 24px 60px rgba(0,0,0,.4)',
          animation: 'modalPop .28s cubic-bezier(.34,1.56,.64,1)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg,#ffd84a,#f5b800)',
            color: '#1a1a1a', fontSize: 28, fontWeight: 800,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 14,
            boxShadow: '0 8px 20px rgba(245,184,0,.35)',
          }}
        >
          💡
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>
          已选超过行程晚数
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--mt-text-2)', lineHeight: 1.7 }}>
          本次行程共 <b style={{ color: 'var(--mt-orange)' }}>{nights}</b> 晚，通常 1 家酒店即可。
          如果要分开住或临时换酒店可以继续添加，小go 不会强制限制。
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button
            className="btn-ghost"
            style={{ flex: 1, height: 42, borderRadius: 10, background: 'var(--mt-bg)' }}
            onClick={onClose}
          >
            知道了
          </button>
          <button
            className="btn-primary"
            style={{ flex: 1, height: 42, borderRadius: 10, fontSize: 13.5 }}
            onClick={onClose}
          >
            继续添加
          </button>
        </div>
      </div>
    </div>
  );
}
