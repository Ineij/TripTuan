import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileFrame } from '../components/MobileFrame';
import { StatusBar } from '../components/StatusBar';
import { GoMark } from '../components/Atoms';
import { Photo } from '../components/Photo';
import { useApp, type Weather } from '../store';
import type { Scene } from '../types';

type Tab = '总览' | 'Day 1' | 'Day 2';
type Drawer = null | 'menu' | 'memo' | 'share' | 'orders' | 'trace' | 'weather' | 'fortune' | 'poster' | 'tea' | 'taxi' | 'place' | 'delivery';
type PanelMode = 'normal' | 'trip' | 'map';

interface Todo { id: string; text: string; done: boolean }
interface Point { x: number; y: number }
interface MapPin { x: number; y: number; icon: string; name: string; rating: number; walk: string; tint: string; photoSeed: string; desc: string }
interface RouteStop { x: number; y: number; name: string; icon: string; done?: boolean }
interface DeliveryChoice { name: string; desc: string; price: string; seed: string; scene: Scene }
interface BoardItem {
  period: '上午' | '中午' | '下午' | '晚上' | '出发' | '晚餐' | '返程';
  cat: '交通' | '景点' | '美食';
  name: string;
  rating: number;
  duration: string;
  photoSeed: string;
  desc: string;
  queue?: '低' | '中' | '高';
  segment?: { walk: string; drive: string; meters: string };
  price?: string;
}

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

const routePoints: Point[] = [
  { x: 140, y: 610 }, { x: 260, y: 560 }, { x: 390, y: 520 }, { x: 520, y: 470 }, { x: 690, y: 420 }, { x: 850, y: 345 },
];

function getPins(scene: Scene): MapPin[] {
  const center = scene === 'bj' ? { x: 48, y: 56 } : { x: 48, y: 56 };
  const offsets = [
    { x: -6, y: -8 },
    { x: 7, y: -9 },
    { x: 11, y: 1 },
    { x: -9, y: 5 },
    { x: 5, y: 10 },
    { x: -12, y: -1 },
  ];
  if (scene === 'bj') {
    return [
      { icon: '🏮', name: '前门大街', rating: 4.6, walk: '步行 260m', tint: 'linear-gradient(135deg,#ef4444,#fb923c)', photoSeed: 'bj-tiananmen', desc: '胡同、老字号、夜景都能顺路拍。' },
      { icon: '🥢', name: '护国寺小吃', rating: 4.5, walk: '步行 520m', tint: 'linear-gradient(135deg,#fbbf24,#fb923c)', photoSeed: 'bj-roast-duck', desc: '豆汁、焦圈、驴打滚，一次补齐地道小吃。' },
      { icon: '🏛️', name: '故宫角楼', rating: 4.8, walk: '步行 680m', tint: 'linear-gradient(135deg,#a78bfa,#7c3aed)', photoSeed: 'bj-forbidden-city', desc: '下午光线更稳，适合家庭合照。' },
      { icon: '📷', name: '正阳门城楼', rating: 4.6, walk: '步行 380m', tint: 'linear-gradient(135deg,#3b82f6,#60a5fa)', photoSeed: 'bj-tiananmen', desc: '城楼视角开阔，适合作为北京第一张合影。' },
      { icon: '🌿', name: '景山公园', rating: 4.7, walk: '步行 740m', tint: 'linear-gradient(135deg,#10b981,#34d399)', photoSeed: 'bj-forbidden-city', desc: '登高看中轴线，路线短但记忆点很强。' },
      { icon: '🍡', name: '大栅栏小吃街', rating: 4.4, walk: '步行 430m', tint: 'linear-gradient(135deg,#fb923c,#f59e0b)', photoSeed: 'bj-wangfujing', desc: '适合临时补一站，孩子也容易有参与感。' },
    ].map((pin, i) => ({ ...pin, x: center.x + offsets[i].x, y: center.y + offsets[i].y }));
  }
  return [
    { icon: '☕', name: '%Arabica（K11 店）', rating: 4.7, walk: '步行 180m', tint: 'linear-gradient(135deg,#fbbf24,#fb923c)', photoSeed: 'aussie-dairy', desc: '靠近海港，适合短暂停留补咖啡。' },
    { icon: '🍜', name: '九记牛腩', rating: 4.6, walk: '步行 320m', tint: 'linear-gradient(135deg,#34d399,#10b981)', photoSeed: 'yung-kee-goose', desc: '经典港式热食，雨天也适合。' },
    { icon: '🌹', name: 'K11 MUSEA', rating: 4.7, walk: '步行 400m', tint: 'linear-gradient(135deg,#ef4444,#fb923c)', photoSeed: 'victoria-harbour', desc: '海边商场，适合拍照和躲天气。' },
    { icon: '🛍️', name: '海港城 LCX', rating: 4.5, walk: '步行 250m', tint: 'linear-gradient(135deg,#a78bfa,#7c3aed)', photoSeed: 'tst-harbour-city', desc: '亲子购物友好，排队压力低。' },
    { icon: '🎬', name: '星光大道海边位', rating: 4.6, walk: '步行 300m', tint: 'linear-gradient(135deg,#3b82f6,#60a5fa)', photoSeed: 'avenue-of-stars', desc: '维港背景干净，傍晚很适合拍旅迹封面。' },
    { icon: '⛴️', name: '天星小轮码头', rating: 4.5, walk: '步行 460m', tint: 'linear-gradient(135deg,#06b6d4,#3b82f6)', photoSeed: 'victoria-harbour', desc: '短程体验感强，能把海港路线串起来。' },
  ].map((pin, i) => ({ ...pin, x: center.x + offsets[i].x, y: center.y + offsets[i].y }));
}

function getItems(scene: Scene, tab: Tab): BoardItem[] {
  const hk: BoardItem[] = [
    { period: '出发', cat: '交通', name: 'G6501 · 高铁', rating: 4.8, duration: '已出票 · 14 min', price: '¥75', photoSeed: 'hk-train', desc: '深圳北出发，抵达后自动衔接港铁/打车。', segment: { walk: '5min', drive: '—', meters: '200m' } },
    { period: '上午', cat: '景点', name: '尖沙咀海港城', rating: 4.6, duration: '2-3 小时', queue: '低', photoSeed: 'tst-harbour-city', desc: '先走室内购物与海港拍照，天气不好也不影响。', segment: { walk: '10min', drive: '5min', meters: '800m' } },
    { period: '中午', cat: '美食', name: '澳洲牛奶公司', rating: 4.6, duration: '40 分钟', queue: '中', photoSeed: 'aussie-dairy', desc: '茶餐厅效率高，适合快速补能。', segment: { walk: '8min', drive: '4min', meters: '600m' } },
    { period: '下午', cat: '景点', name: '维多利亚港', rating: 4.7, duration: '2-3 小时', queue: '低', photoSeed: 'victoria-harbour', desc: '沿海港慢走，自动记录高光照片。' },
  ];
  const bj: BoardItem[] = [
    { period: '出发', cat: '交通', name: 'G671 · 石家庄到北京南', rating: 4.8, duration: '已出票 · 72 min', price: '¥128', photoSeed: 'bj-train', desc: '河北出发抵达北京南，后续优先安排少走路路线。', segment: { walk: '6min', drive: '—', meters: '300m' } },
    { period: '上午', cat: '景点', name: '天安门广场', rating: 4.9, duration: '1.5 小时', queue: '中', photoSeed: 'bj-tiananmen', desc: '提前看预约状态和安检排队，作为北京第一站合影。', segment: { walk: '8min', drive: '18min', meters: '6.2km' } },
    { period: '上午', cat: '景点', name: '故宫博物院', rating: 4.8, duration: '3 小时', queue: '中', photoSeed: 'bj-forbidden-city', desc: '中轴线轻量走法：午门、太和殿、御花园。', segment: { walk: '12min', drive: '—', meters: '900m' } },
    { period: '中午', cat: '美食', name: '四季民福烤鸭', rating: 4.7, duration: '70 分钟', queue: '中', photoSeed: 'bj-roast-duck', desc: '王府井店亲子友好，适合第一天午餐。', segment: { walk: '10min', drive: '12min', meters: '2.4km' } },
  ];
  const base = scene === 'bj' ? bj : hk;
  if (tab === '总览') return base.slice(1);
  if (tab === 'Day 2') {
    return scene === 'bj'
      ? [
        { period: '上午', cat: '景点', name: '颐和园泛舟', rating: 4.7, duration: '2 小时', queue: '低', photoSeed: 'bj-summer-palace', desc: '第二天节奏放慢，湖边路线更适合家庭。', segment: { walk: '7min', drive: '14min', meters: '4.2km' } },
        { period: '中午', cat: '美食', name: '护国寺小吃', rating: 4.5, duration: '50 分钟', queue: '低', photoSeed: 'bj-roast-duck', desc: '颐和园出来后顺路补给，豆汁、焦圈、驴打滚一次尝到。', segment: { walk: '10min', drive: '18min', meters: '5.4km' } },
        { period: '下午', cat: '景点', name: '什刹海', rating: 4.4, duration: '1.5 小时', queue: '低', photoSeed: 'bj-shichahai', desc: '返程前轻松收尾，胡同和湖边都适合拍照。', segment: { walk: '12min', drive: '10min', meters: '2.1km' } },
        { period: '返程', cat: '交通', name: 'G672 · 北京南返程', rating: 4.8, duration: '已出票 · 74 min', price: '¥128', photoSeed: 'bj-train', desc: '返程高铁已计入 Day 2，结束后直达北京南站。' },
      ]
      : [
        { period: '上午', cat: '景点', name: '太平山顶', rating: 4.7, duration: '2 小时', queue: '中', photoSeed: 'victoria-peak', desc: '视野好，天气放晴优先上山。', segment: { walk: '6min', drive: '15min', meters: '5.1km' } },
        { period: '中午', cat: '美食', name: '兰芳园中环创办店', rating: 4.5, duration: '45 分钟', queue: '低', photoSeed: 'aussie-dairy', desc: '丝袜奶茶和菠萝油，作为返程前补给。', segment: { walk: '8min', drive: '10min', meters: '2.8km' } },
        { period: '返程', cat: '交通', name: 'G6534 · 西九龙返程', rating: 4.8, duration: '已出票 · 14 min', price: '¥75', photoSeed: 'hk-train', desc: '返程高铁已计入 Day 2，按西九龙站出发时间提醒。' },
      ];
  }
  return base;
}

function getRouteStops(scene: Scene, tab: Tab): RouteStop[] {
  const hkDay1: RouteStop[] = [
    { x: 360, y: 520, icon: '🚄', name: '西九龙', done: true },
    { x: 420, y: 500, icon: '🛍️', name: '海港城' },
    { x: 455, y: 545, icon: '🍞', name: '澳牛' },
    { x: 500, y: 500, icon: '🌊', name: '维港' },
    { x: 560, y: 495, icon: '🎬', name: '星光大道' },
    { x: 470, y: 575, icon: '🏨', name: '君怡酒店' },
  ];
  const hkDay2: RouteStop[] = [
    { x: 470, y: 575, icon: '🏨', name: '君怡酒店', done: true },
    { x: 610, y: 455, icon: '⛰️', name: '太平山顶' },
    { x: 585, y: 525, icon: '☕', name: '兰芳园' },
    { x: 360, y: 520, icon: '🚄', name: '西九龙返程' },
  ];
  const bjDay1: RouteStop[] = [
    { x: 420, y: 690, icon: '🚄', name: '北京南', done: true },
    { x: 465, y: 555, icon: '🏮', name: '天安门' },
    { x: 470, y: 505, icon: '🏛️', name: '故宫' },
    { x: 525, y: 535, icon: '🦆', name: '四季民福' },
    { x: 550, y: 560, icon: '🛍️', name: '王府井' },
    { x: 555, y: 575, icon: '🏨', name: '希尔顿' },
  ];
  const bjDay2: RouteStop[] = [
    { x: 555, y: 575, icon: '🏨', name: '希尔顿', done: true },
    { x: 310, y: 355, icon: '⛵', name: '颐和园' },
    { x: 420, y: 470, icon: '🥣', name: '护国寺' },
    { x: 455, y: 450, icon: '🌃', name: '什刹海' },
    { x: 420, y: 690, icon: '🚄', name: '北京南返程' },
  ];
  const day1 = scene === 'bj' ? bjDay1 : hkDay1;
  const day2 = scene === 'bj' ? bjDay2 : hkDay2;
  if (tab === 'Day 1') return day1;
  if (tab === 'Day 2') return day2;
  return [...day1, ...day2.slice(1)];
}

export default function Step7_Board() {
  const nav = useNavigate();
  const { scene, weather } = useApp();
  const [tab, setTab] = useState<Tab>('总览');
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>('normal');
  const [showNearby, setShowNearby] = useState(false);
  const [focusedPin, setFocusedPin] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<BoardItem | MapPin | null>(null);
  const [deliveryChoice, setDeliveryChoice] = useState<DeliveryChoice | null>(null);
  const [mapPan, setMapPan] = useState(scene === 'bj' ? { x: -315, y: -310 } : { x: -330, y: -335 });
  const [mapHeight, setMapHeight] = useState(330);
  const [completed, setCompleted] = useState<Set<string>>(new Set(['G6501 · 高铁', 'G671 · 高铁']));
  const [todos, setTodos] = useState<Todo[]>([
    { id: 't1', text: '充电宝带上', done: true },
    { id: 't2', text: scene === 'bj' ? '身份证和预约码' : '提前换八达通', done: false },
    { id: 't3', text: '订一张高铁返程票', done: false },
  ]);
  const [todoText, setTodoText] = useState('');

  useEffect(() => {
    setShowNearby(false);
    const t = window.setTimeout(() => setShowNearby(true), 15000);
    return () => window.clearTimeout(t);
  }, [scene]);

  useEffect(() => {
    setMapPan(scene === 'bj' ? { x: -315, y: -310 } : { x: -330, y: -335 });
  }, [scene]);

  const weatherMeta = WEATHER_META[weather];
  const pins = useMemo(() => getPins(scene), [scene]);
  const items = useMemo(() => getItems(scene, tab), [scene, tab]);
  const routeStops = useMemo(() => getRouteStops(scene, tab), [scene, tab]);
  const totalStations = 10;
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
        <button onClick={() => setDrawer('share')} style={{ ...circleButtonStyle, background: 'var(--go-grad)', color: '#fff', fontSize: 14 }}>👥</button>
        <button onClick={() => setDrawer('menu')} style={{ ...circleButtonStyle, fontSize: 16, fontWeight: 900 }}>☰</button>
      </div>

      <div className="scroll-area" style={{ padding: 0, background: '#fff' }}>
        <MapStage
          scene={scene}
          weather={weather}
          weatherMeta={weatherMeta}
          pins={pins}
          routeStops={routeStops}
          showNearby={showNearby}
          focusedPin={focusedPin}
          setFocusedPin={setFocusedPin}
          mapPan={mapPan}
          setMapPan={setMapPan}
          height={mapHeight}
          onOpenPlace={openPlace}
          onOpenWeather={() => setDrawer('weather')}
          onOpenFortune={() => setDrawer('fortune')}
          onOpenPoster={() => setDrawer('poster')}
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

            {items.map((it, i) => (
              <BoardItemBlock
                key={`${it.name}-${i}`}
                item={it}
                checked={completed.has(it.name)}
                onToggleDone={() => setCompleted((prev) => {
                  const next = new Set(prev);
                  next.has(it.name) ? next.delete(it.name) : next.add(it.name);
                  return next;
                })}
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
          onCompanion={() => setDrawer('share')}
          onOrders={() => setDrawer('orders')}
        />
      )}

      {drawer && drawer !== 'menu' && (
        <DrawerSheet
          kind={drawer}
          scene={scene}
          weather={weather}
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
  scene, weather, weatherMeta, pins, routeStops, showNearby, focusedPin, setFocusedPin, mapPan, setMapPan,
  height, onOpenPlace, onOpenWeather, onOpenFortune, onOpenPoster, onExpandMap, onExpandTrip, panelMode, doneStations, totalStations,
}: {
  scene: Scene; weather: Weather; weatherMeta: typeof WEATHER_META[Weather]; pins: MapPin[]; routeStops: RouteStop[];
  showNearby: boolean; focusedPin: string | null; setFocusedPin: (name: string) => void;
  mapPan: Point; setMapPan: (p: Point) => void; height: number;
  onOpenPlace: (p: MapPin) => void; onOpenWeather: () => void; onOpenFortune: () => void; onOpenPoster: () => void;
  onExpandMap: () => void; onExpandTrip: () => void; panelMode: PanelMode; doneStations: number; totalStations: number;
}) {
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const focusPin = (pin: MapPin) => {
    setFocusedPin(pin.name);
    setMapPan({
      x: clamp(195 - (pin.x / 100) * 1024, -690, 12),
      y: clamp(height / 2 - (pin.y / 100) * 1024, -710, 10),
    });
  };
  const tileBase = scene === 'bj' ? { z: 15, x: 26976, y: 12414 } : { z: 15, x: 26773, y: 14299 };
  const districtLabels = scene === 'bj'
    ? [{ t: '前门', x: 29, y: 69 }, { t: '天安门', x: 51, y: 54 }, { t: '王府井', x: 78, y: 62 }]
    : [{ t: '上环', x: 16, y: 69 }, { t: '湾仔', x: 52, y: 76 }, { t: '铜锣湾', x: 80, y: 60 }];

  return (
    <div style={{ position: 'relative', height, overflow: 'hidden', background: '#eef3f5', borderBottom: '1px solid var(--mt-line)', transition: 'height .28s ease' }}>
      <div
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, px: mapPan.x, py: mapPan.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setMapPan({
            x: clamp(drag.current.px + e.clientX - drag.current.x, -690, 12),
            y: clamp(drag.current.py + e.clientY - drag.current.y, -710, 10),
          });
        }}
        onPointerUp={(e) => {
          drag.current = null;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => { drag.current = null; }}
        style={{
          position: 'absolute', left: 0, top: 0,
          width: 1024, height: 1024,
          transform: `translate(${mapPan.x}px, ${mapPan.y}px)`,
          touchAction: 'none',
          cursor: 'grab',
        }}
      >
        {Array.from({ length: 4 }).map((_, row) =>
          Array.from({ length: 4 }).map((__, col) => (
            <img
              key={`${row}-${col}`}
              src={`https://tile.openstreetmap.org/${tileBase.z}/${tileBase.x + col}/${tileBase.y + row}.png`}
              alt=""
              draggable={false}
              style={{ position: 'absolute', left: col * 256, top: row * 256, width: 256, height: 256, opacity: weather === 'rainy' ? 0.48 : 0.58, filter: weather === 'snowy' ? 'saturate(.55) brightness(1.18)' : 'saturate(.7) brightness(1.08)' }}
            />
          ))
        )}
        <div style={{ position: 'absolute', inset: 0, background: weatherMeta.bg, pointerEvents: 'none' }} />
        <svg width="1024" height="1024" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <path
            d={routeStops.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
            stroke={weatherMeta.route}
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.86"
          />
          <path
            d={routeStops.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
            stroke="#fff"
            strokeWidth="2"
            strokeDasharray="10 12"
            fill="none"
            strokeLinecap="round"
            opacity="0.72"
          />
        </svg>
        {districtLabels.map((d) => <Label key={d.t} x={`${d.x}%`} y={`${d.y}%`}>{d.t}</Label>)}
        {routeStops.map((stop, i) => <RouteStopPin key={`${stop.name}-${i}`} stop={stop} index={i} />)}
        {showNearby && pins.map((p, i) => (
          <PinCard
            key={p.name}
            pin={p}
            active={focusedPin === p.name}
            delay={i * 80}
            onFocus={() => focusPin(p)}
            onDetail={() => onOpenPlace(p)}
          />
        ))}
        <CurrentMarker weatherMeta={weatherMeta} scene={scene} />
      </div>

      <WeatherEffect weather={weather} />

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

function RouteStopPin({ stop, index }: { stop: RouteStop; index: number }) {
  return (
    <div style={{ position: 'absolute', left: stop.x, top: stop.y, transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2 }}>
      <div style={{ width: 34, height: 34, borderRadius: '50%', background: stop.done ? 'var(--mt-green)' : '#fff', border: `3px solid ${stop.done ? 'var(--mt-green)' : '#3b82f6'}`, boxShadow: '0 8px 18px rgba(59,130,246,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>
        {stop.done ? '✓' : stop.icon}
      </div>
      <div style={{ marginTop: 4, padding: '3px 7px', borderRadius: 999, background: 'rgba(255,255,255,.92)', color: '#1f2937', boxShadow: '0 4px 12px rgba(0,0,0,.12)', fontSize: 10.5, fontWeight: 900, whiteSpace: 'nowrap' }}>
        {index + 1}. {stop.name}
      </div>
    </div>
  );
}

function CurrentMarker({ weatherMeta, scene }: { weatherMeta: typeof WEATHER_META[Weather]; scene: Scene }) {
  return (
    <div style={{ position: 'absolute', left: '48%', top: '56%', transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ padding: '6px 12px', borderRadius: 999, background: '#1a1a1a', color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', boxShadow: '0 8px 18px rgba(0,0,0,.32)', marginBottom: 7 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 0 5px rgba(52,211,153,.14)' }} />
        我在 · {scene === 'bj' ? '天安门附近' : '维多利亚港'}
      </div>
      <div style={{ width: 54, height: 54, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 25, boxShadow: '0 8px 24px rgba(59,130,246,.32)', border: '4px solid #dbeafe', animation: 'mapPinPulse 1.8s ease-in-out infinite' }}>
        {weatherMeta.mapIcon}
      </div>
    </div>
  );
}

function WeatherEffect({ weather }: { weather: Weather }) {
  if (weather === 'sunny') {
    return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(circle at 18% 12%, rgba(255,216,74,.22), transparent 26%)' }} />;
  }
  const drops = Array.from({ length: weather === 'rainy' ? 26 : 34 });
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', background: weather === 'rainy' ? 'rgba(17,24,39,.22)' : 'rgba(255,255,255,.16)' }}>
      {drops.map((_, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            left: `${(i * 37) % 100}%`,
            top: `${-20 + (i * 11) % 60}%`,
            width: weather === 'rainy' ? 2 : 6,
            height: weather === 'rainy' ? 40 : 6,
            borderRadius: 999,
            background: weather === 'rainy' ? 'rgba(226,242,255,.78)' : 'rgba(255,255,255,.9)',
            animation: `${weather === 'rainy' ? 'rainDrop' : 'snowFall'} ${weather === 'rainy' ? 1.15 : 3.6}s linear infinite`,
            animationDelay: `${i * 0.12}s`,
            opacity: weather === 'rainy' ? 0.78 : 0.85,
          }}
        />
      ))}
    </div>
  );
}

function TripProgress({ scene, doneStations, totalStations }: { scene: Scene; doneStations: number; totalStations: number }) {
  return (
    <div style={{ background: 'linear-gradient(135deg,#fff8d6,#ffe7a3)', border: '1px solid #ffd76b', borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div className="h-between">
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{scene === 'hk' ? '香港周末漫游' : '北京家庭文化游'}</div>
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

function Label({ x, y, children }: { x: string; y: string; children: ReactNode }) {
  return <div style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%,-50%)', fontSize: 12, fontWeight: 800, color: '#6b7280', background: 'rgba(255,255,255,.48)', padding: '2px 7px', borderRadius: 999, pointerEvents: 'none' }}>{children}</div>;
}

function PinCard({
  pin, active, delay, onFocus, onDetail,
}: {
  pin: MapPin; active: boolean; delay: number; onFocus: () => void; onDetail: () => void;
}) {
  return (
    <div className="fade-up" style={{ position: 'absolute', left: `${pin.x}%`, top: `${pin.y}%`, transform: 'translate(-50%,-100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', animationDelay: `${delay}ms`, zIndex: active ? 8 : 3 }}>
      <button onClick={onFocus} style={{ padding: active ? '7px 9px 7px 6px' : '6px 10px 6px 6px', borderRadius: active ? 16 : 999, background: '#fff', display: 'flex', alignItems: 'center', gap: 6, boxShadow: active ? '0 14px 30px rgba(0,0,0,.28), 0 0 0 3px rgba(255,216,74,.45)' : '0 8px 20px rgba(0,0,0,.18)', whiteSpace: 'nowrap', fontSize: 11.5, fontWeight: 800, textAlign: 'left' }}>
        <span style={{ width: 24, height: 24, borderRadius: '50%', background: pin.tint, fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{pin.icon}</span>
        <span>
          <span style={{ marginRight: 4 }}>{pin.name}</span>
          <span style={{ color: 'var(--mt-orange)', fontWeight: 800 }}>★ {pin.rating}</span>
          <span style={{ color: 'var(--mt-text-3)', marginLeft: 4 }}>· {pin.walk}</span>
        </span>
      </button>
      {active && (
        <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ padding: '5px 9px', borderRadius: 999, background: 'rgba(26,26,26,.82)', color: '#fff', fontSize: 10.5, fontWeight: 900, boxShadow: '0 8px 18px rgba(0,0,0,.18)' }}>
            已定位到此点
          </span>
          <button onClick={onDetail} style={{ padding: '6px 12px', borderRadius: 999, background: '#1a1a1a', color: '#fff', fontSize: 11.5, fontWeight: 900, boxShadow: '0 8px 18px rgba(0,0,0,.22)' }}>
            查看详情
          </button>
        </div>
      )}
      <div style={{ width: 0, height: 0, marginTop: -1, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '7px solid #fff' }} />
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
            <Photo seed={item.photoSeed} width={74} height={74} radius={10} />
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
  kind, scene, weather, selectedPlace, onClose, todos, setTodos, todoText, setTodoText, onTaxi, deliveryChoice, onDelivery,
}: {
  kind: Exclude<Drawer, null | 'menu'>; scene: Scene; weather: Weather; selectedPlace: BoardItem | MapPin | null; onClose: () => void;
  todos: Todo[]; setTodos: (t: Todo[]) => void; todoText: string; setTodoText: (t: string) => void; onTaxi: () => void;
  deliveryChoice: DeliveryChoice | null; onDelivery: (choice: DeliveryChoice) => void;
}) {
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 50, display: 'flex', alignItems: 'flex-end', animation: 'overlayFade .2s ease' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxHeight: kind === 'poster' ? '82%' : '74%', background: '#fff', borderRadius: '20px 20px 0 0', padding: '14px 16px 24px', overflowY: 'auto', animation: 'sheetUp .28s ease', position: 'relative' }}>
        <div style={{ width: 36, height: 4, background: 'var(--mt-line)', borderRadius: 999, margin: '0 auto 14px' }} />
        <button onClick={onClose} style={{ position: 'absolute', right: 14, top: 14, width: 28, height: 28, borderRadius: '50%', background: 'var(--mt-bg)', fontSize: 16, color: 'var(--mt-text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        {kind === 'memo' && <MemoSheet todos={todos} setTodos={setTodos} todoText={todoText} setTodoText={setTodoText} />}
        {kind === 'share' && <ShareSheet scene={scene} />}
        {kind === 'orders' && <OrdersSheet scene={scene} />}
        {kind === 'trace' && <TraceSheet />}
        {kind === 'weather' && <WeatherSheet scene={scene} weather={weather} />}
        {kind === 'fortune' && <FortuneSheet scene={scene} />}
        {kind === 'poster' && <PosterSheet scene={scene} />}
        {kind === 'tea' && <TeaSheet scene={scene} onDelivery={onDelivery} />}
        {kind === 'delivery' && <DeliverySheet choice={deliveryChoice} />}
        {kind === 'taxi' && <TaxiSheet scene={scene} place={selectedPlace} />}
        {kind === 'place' && <PlaceSheet place={selectedPlace} onTaxi={onTaxi} />}
      </div>
    </div>
  );
}

function SideMenuOverlay({
  scene, onClose, onSummary, onMap, onShare, onCompanion, onOrders,
}: {
  scene: Scene;
  onClose: () => void;
  onSummary: () => void;
  onMap: () => void;
  onShare: () => void;
  onCompanion: () => void;
  onOrders: () => void;
}) {
  const rows = [
    { icon: '✨', title: '行程总结', sub: '智能生成回忆 · 一键分享', action: onSummary, primary: true },
    { icon: '🗺️', title: '全屏地图路线', sub: '查看实时定位与点位', action: onMap },
    { icon: '↗', title: '分享我的旅程', sub: '保存照片或转发朋友圈', action: onShare },
    { icon: '👥', title: '共享看板给同行人', sub: '一键生成链接 / 二维码', action: onCompanion },
    { icon: '📋', title: '订单与凭证', sub: '查看已购的票和券', action: onOrders },
    { icon: '☎', title: '客服中心', sub: '7×24h 帮你解决问题', action: onClose },
    { icon: '⚙', title: '设置', sub: '通知 · 隐私 · 语言', action: onClose },
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
          美团 × 小go · v1.0 · {scene === 'bj' ? '北京' : '香港'}
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

function WeatherSheet({ scene, weather }: { scene: Scene; weather: Weather }) {
  const meta = WEATHER_META[weather];
  const days = scene === 'bj'
    ? ['今天 小雨 22°/17°', '明天 多云 26°/18°', '后天 晴 28°/19°']
    : ['今天 小雪 -2°/-5°', '明天 晴 25°/20°', '后天 小雨 22°/18°'];
  return (
    <>
      <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 12 }}>天气预报</div>
      <div style={{ padding: 14, borderRadius: 14, background: 'linear-gradient(135deg,#eff6ff,#fff)', border: '1px solid #bfdbfe', display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 32 }}>{meta.icon}</span>
        <div><div style={{ fontSize: 18, fontWeight: 900 }}>{meta.temp} {meta.title}</div><div className="text-small text-muted" style={{ marginTop: 4 }}>{meta.outfit}</div></div>
      </div>
      {days.map((d, i) => <div key={d} className="card" style={{ marginBottom: 9, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontWeight: 800 }}>{d}</span><span className="text-tiny text-muted">{i === 0 ? '当前路线已适配' : '可自动重排'}</span></div>)}
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

function PosterSheet({ scene }: { scene: Scene }) {
  return (
    <>
      <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 12 }}>行程总结海报</div>
      <div style={{ borderRadius: 18, overflow: 'hidden', boxShadow: 'var(--shadow-2)', background: '#111827', color: '#fff', marginBottom: 14 }}>
        <Photo seed={scene === 'bj' ? 'bj-chapter-2' : 'hk-chapter-2'} height={220} radius={0}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.68))' }} />
          <div style={{ position: 'absolute', left: 18, right: 18, bottom: 18 }}>
            <div style={{ fontSize: 24, fontWeight: 900 }}>{scene === 'bj' ? '北京家庭文化游' : '香港周末漫游'}</div>
            <div style={{ marginTop: 5, fontSize: 12, opacity: 0.86 }}>已完成 1/10 站 · 自动生成照片墙和路线卡</div>
          </div>
        </Photo>
        <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {['路线', '美食', '高光'].map((x, i) => <div key={x} style={{ background: 'rgba(255,255,255,.1)', borderRadius: 10, padding: 9 }}><div style={{ fontSize: 18, fontWeight: 900 }}>{i === 0 ? '6.4km' : i === 1 ? '3家' : '12张'}</div><div style={{ fontSize: 11, opacity: 0.7 }}>{x}</div></div>)}
        </div>
      </div>
      <button className="btn-primary">生成长图海报</button>
    </>
  );
}

function TeaSheet({ scene, onDelivery }: { scene: Scene; onDelivery: (choice: DeliveryChoice) => void }) {
  const isBj = scene === 'bj';
  const [batch, setBatch] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const listA = isBj
    ? [
      ['护国寺小吃', '豆汁、焦圈、驴打滚', '人均 ¥45', 'bj-roast-duck', '到店'],
      ['姚记炒肝外卖', '炒肝包子 + 北冰洋，送到酒店', '外卖 ¥39 起', 'bj-shichahai', '外卖'],
      ['门框胡同百年卤煮', '卤煮火烧，老北京味', '人均 ¥58', 'bj-wangfujing', '到店'],
    ]
    : [
      ['陶陶居早茶', '虾饺、凤爪、叉烧包，广东早茶经典', '人均 ¥95', 'aussie-dairy', '到店'],
      ['喜茶外卖', '多肉葡萄 + 轻乳茶，送到附近', '外卖 ¥19 起', 'sweet-dynasty', '外卖'],
      ['点都德早茶', '红米肠、流沙包、艇仔粥', '人均 ¥88', 'aussie-dairy', '到店'],
    ];
  const listB = isBj
    ? [
      ['南门涮肉', '铜锅涮肉，适合家庭桌', '人均 ¥120', 'bj-hotpot', '到店'],
      ['庆丰包子铺外卖', '包子 + 炒肝，快速送达', '外卖 ¥28 起', 'bj-roast-duck', '外卖'],
      ['北新桥卤煮老店', '卤煮火烧 + 北冰洋', '人均 ¥52', 'bj-wangfujing', '到店'],
    ]
    : [
      ['广州酒家早茶', '艇仔粥、叉烧酥、干蒸烧卖', '人均 ¥110', 'aussie-dairy', '到店'],
      ['奈雪奶茶外卖', '霸气芝士葡萄，30 分钟送达', '外卖 ¥26 起', 'sweet-dynasty', '外卖'],
      ['莲香楼', '老派茶楼，点心推车', '人均 ¥120', 'sweet-dynasty', '到店'],
    ];
  const list = batch % 2 === 0 ? listA : listB;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 19, fontWeight: 800 }}>{isBj ? '吃了嘛您' : '得闲饮茶啦'}</div>
        <button onClick={() => setBatch((v) => v + 1)} style={{ padding: '7px 12px', borderRadius: 999, background: '#1a1a1a', color: '#fff', fontSize: 12, fontWeight: 800 }}>
          🔄 换一批
        </button>
      </div>
      <div style={{ padding: 14, borderRadius: 14, background: 'linear-gradient(135deg,#fff7d6,#fff)', border: '1px solid #facc15', marginBottom: 12, fontSize: 14, fontWeight: 800 }}>
        {isBj ? '吃了嘛您：附近北京地道小吃和可送达外卖' : '得闲饮茶啦：广东特色早茶店和外卖奶茶'}
      </div>
      {list.map(([name, desc, price, seed, mode]) => {
        const open = expanded === name;
        return (
        <div key={name} className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <Photo seed={seed} width={72} height={72} radius={10} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 900 }}>{name}</div>
            <div className="text-tiny text-muted" style={{ marginTop: 4 }}>{desc}</div>
            <div style={{ marginTop: 7, color: 'var(--mt-orange)', fontSize: 12, fontWeight: 800 }}>{price}</div>
            {open && mode === '到店' && (
              <div className="text-tiny" style={{ marginTop: 8, padding: 8, borderRadius: 8, background: 'var(--mt-bg)', color: 'var(--mt-text-2)', lineHeight: 1.6 }}>
                营业中 · 步行 8-12 分钟 · 推荐提前取号。可查看招牌菜、排队热度和导航路线。
                <div style={{ marginTop: 5, color: 'var(--mt-text)' }}>
                  {isBj ? '推荐：焦圈 / 炒肝 / 豆面丸子，适合顺路补一顿。' : '推荐：虾饺 / 红米肠 / 叉烧包，适合慢慢坐下饮茶。'}
                </div>
              </div>
            )}
          </div>
          {mode === '外卖' ? (
            <button
              onClick={() => onDelivery({ name, desc, price, seed, scene })}
              className="btn-go"
              style={{ width: 58, height: 30, fontSize: 12 }}
            >
              外卖
            </button>
          ) : (
            <button onClick={() => setExpanded(open ? null : name)} className="btn-go" style={{ width: 58, height: 30, fontSize: 12 }}>{open ? '收起' : '展开'}</button>
          )}
        </div>
      );})}
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
        <Photo seed={choice.seed} height={150} radius={0} />
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
        <div style={{ fontSize: 17, fontWeight: 900, marginTop: 4 }}>{place?.name ?? (scene === 'bj' ? '前门大街' : '尖沙咀海港城')}</div>
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
  return (
    <>
      <Photo seed={seed} height={180} radius={16} style={{ marginBottom: 12 }} />
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
  return (
    <>
      <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 4 }}>共享看板给同行人</div>
      <div className="text-tiny text-muted" style={{ marginBottom: 14, lineHeight: 1.6 }}>邀请同行人加入「{scene === 'bj' ? '北京家庭文化游' : '香港周末漫游'}」<br />扫码即可看到同一份动态看板。</div>
      <div style={{ width: 180, height: 180, borderRadius: 14, margin: '14px auto', background: 'repeating-linear-gradient(45deg,#1a1a1a 0 4px,#fff 4px 8px)', border: '6px solid #fff', boxShadow: 'var(--shadow-2)' }} />
      <button className="btn-primary" style={{ marginTop: 18 }}>复制邀请链接</button>
    </>
  );
}

function OrdersSheet({ scene }: { scene: Scene }) {
  const orders = scene === 'bj'
    ? ['天安门预约码', '护国寺小吃团券', '前门亲子酒店']
    : ['太平山顶缆车套票', '海港城海鲜午餐', '尖沙咀文华东方家庭房'];
  return <><div style={{ fontSize: 19, fontWeight: 800, marginBottom: 14 }}>订单与凭证</div>{orders.map((title, i) => <div key={title} className="card" style={{ marginBottom: 10 }}><div style={{ fontSize: 13.5, fontWeight: 800 }}>{title}</div><div className="text-tiny text-muted" style={{ marginTop: 4 }}>凭证号：GO-{2305 + i}-772{i}</div><button style={{ marginTop: 8, height: 32, width: '100%', borderRadius: 8, background: 'var(--mt-bg)', fontSize: 12, fontWeight: 700 }}>出示二维码</button></div>)}</>;
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
