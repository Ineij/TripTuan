import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileFrame } from '../components/MobileFrame';
import { StatusBar } from '../components/StatusBar';
import { NavBar } from '../components/NavBar';
import { GoMark } from '../components/Atoms';
import { Photo } from '../components/Photo';
import { StreamingStatus } from '../components/StreamingStatus';
import { useApp } from '../store';
import { rerank, getPickerItems, type Item } from '../api';

type Period = '出发' | '上午' | '中午' | '下午' | '晚餐' | '晚上' | '返程';
type Cat = '交通' | '景点' | '美食' | '酒店';

interface RankItem {
  period: Period;
  cat: Cat;
  name: string;
  rating: number;
  sub: string;
  duration: string;
  price?: string;
  badge?: string;
  photoSeed: string;
  imageUrl?: string;
  // transport-specific extra line
  trainNo?: string;
  // self-arranged meal placeholder (not a booked item)
  selfArranged?: boolean;
}

interface Day {
  label: string; // "DAY 1"
  title: string; // "主线行程"
  items: RankItem[];
}

const DAYS_BY_SCENE: Record<'sz' | 'bj', Day[]> = { sz: [], bj: [] };

const periodIcon: Record<Period, string> = {
  出发: '🚄', 上午: '☀️', 中午: '🍴', 下午: '⛅', 晚餐: '🍽️', 晚上: '🌙', 返程: '🏁',
};
const catColor: Record<Cat, string> = { 交通: '#3b82f6', 景点: '#3b82f6', 美食: '#fb923c', 酒店: '#7c3aed' };
const catChipBg: Record<Cat, { bg: string; fg: string }> = {
  交通: { bg: '#e8f0ff', fg: '#3b82f6' },
  景点: { bg: '#e8f0ff', fg: '#3b82f6' },
  美食: { bg: '#fff1e6', fg: '#fb923c' },
  酒店: { bg: '#f1ebff', fg: '#7c3aed' },
};

export default function Step4_Rerank() {
  const [phase, setPhase] = useState<'waiting' | 'done'>('waiting');
  if (phase === 'waiting') return <WaitingPage onDone={() => setPhase('done')} />;
  return <RerankResult />;
}

function RerankResult() {
  const nav = useNavigate();
  const { scene, identity, selectedPOIs } = useApp();
  const [variant, setVariant] = useState(0);
  const [regenerating, setRegenerating] = useState(false);
  const [variantId, setVariantId] = useState<string | undefined>();
  const [days, setDays] = useState<Day[]>(() => DAYS_BY_SCENE[scene]);
  const [pickerItems, setPickerItems] = useState<Item[]>([]);

  useEffect(() => {
    let cancelled = false;
    setRegenerating(true);
    rerank(scene, identity, Array.from(selectedPOIs))
      .then((payload) => {
        if (cancelled) return;
        setVariantId(payload.variantId);
        setDays(toRankDays(payload.days));
      })
      .catch(() => {
        if (!cancelled) setDays(DAYS_BY_SCENE[scene]);
      })
      .finally(() => {
        if (!cancelled) setRegenerating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scene]);

  // Load picker items so the summary mirrors the user's actual Step3 picks
  // (same source of truth as Step2/Step3: getPickerItems + selectedPOIs).
  useEffect(() => {
    let cancelled = false;
    getPickerItems(scene)
      .then((items) => {
        if (!cancelled) setPickerItems(items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [scene]);

  // Counts reflect what the user picked on Step2/Step3; fall back to the
  // reranked timeline only if the selection/items aren't available yet.
  const selectedItems = pickerItems.filter((i) => selectedPOIs.has(i.id));
  const hasSelection = selectedItems.length > 0;
  const totalCount = hasSelection
    ? selectedItems.length
    : days.reduce((a, d) => a + d.items.length, 0);
  const foodCount = hasSelection
    ? selectedItems.filter((i) => i.cat === 'food').length
    : days.flatMap((d) => d.items).filter((i) => i.cat === '美食').length;
  const sightCount = hasSelection
    ? selectedItems.filter((i) => i.cat === 'sight').length
    : days.flatMap((d) => d.items).filter((i) => i.cat === '景点').length;
  const regenerate = () => {
    setRegenerating(true);
    rerank(scene, identity, Array.from(selectedPOIs), variantId)
      .then((payload) => {
        setVariantId(payload.variantId);
        setDays(toRankDays(payload.days));
      })
      .catch(() => {
        setVariant((v) => {
          const next = (v + 1) % 2;
          setDays(useMemoDays(scene, next));
          return next;
        });
      })
      .finally(() => setRegenerating(false));
  };

  return (
    <MobileFrame>
      <StatusBar bg="#fff" />
      <NavBar title="你的专属行程" />

      <div className="scroll-area" style={{ padding: '12px 14px 140px' }}>
        {/* Yellow summary card */}
        <div
          style={{
            background: 'linear-gradient(135deg,#fff8d6,#ffe7a3)',
            borderRadius: 14, padding: 14, marginBottom: 16,
          }}
        >
          <div className="h-between" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <GoMark size={26} />
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 800 }}>
                  {scene === 'sz' ? '深圳周末游' : '北京家庭文化游'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--mt-text-3)', marginTop: 2 }}>
                  {scene === 'sz' ? '广州 → 深圳 · 2 天 1 夜' : '河北 → 北京 · 2 天 1 夜'} · 共 {totalCount} 站
                </div>
              </div>
            </div>
            <span
              style={{
                padding: '3px 10px', borderRadius: 4,
                background: 'rgba(245,184,0,.3)', color: '#92400e',
                fontSize: 10.5, fontWeight: 800,
              }}
            >
              已串好顺序
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Pill>{totalCount} 个点位</Pill>
            <Pill>餐饮 {foodCount}</Pill>
            <Pill>景点 {sightCount}</Pill>
            <Pill>{identity.partySize} 人</Pill>
          </div>
        </div>

        {/* Timeline */}
        {regenerating && (
          <StreamingStatus
            title={`正在生成方案 ${variant === 0 ? 'B' : 'A'}`}
            messages={[
              '读取你已勾选的项目',
              '计算景点之间的顺路关系',
              '把午餐和晚餐插入合适位置',
              '同步最新行程时间轴',
            ]}
          />
        )}

        {days.length === 0 && regenerating && (
          <div className="card shimmer" style={{ height: 180, marginBottom: 12 }} />
        )}

        {days.map((d, di) => (
          <div key={d.label} style={{ marginBottom: 8 }}>
            <DayHeader label={d.label} title={d.title} />
            <Timeline items={d.items} continueFromPrev={di > 0} />
          </div>
        ))}

        {/* Principle */}
        <div
          style={{
            marginTop: 14, padding: 12, borderRadius: 10,
            background: 'rgba(255,209,0,.08)',
            border: '1px dashed var(--mt-yellow-dark)',
            fontSize: 12.5, color: 'var(--mt-text-2)', lineHeight: 1.7,
          }}
        >
          💡 顺序原理：按 <b>地理顺路</b> + <b>实时人流</b> + <b>打卡行</b> 偏好串联。
          觉得不满意可以「重新生成」，我换个组合方式。
        </div>
      </div>

      {/* Footer */}
      <div className="footer-bar">
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <button
            onClick={regenerate}
            className="btn-ghost"
            style={{
              flex: 1, height: 40, borderRadius: 999, border: '1px solid var(--mt-line)',
              background: '#fff',
            }}
          >
            🔄 {regenerating ? '生成中…' : `重新生成方案 ${variant === 0 ? 'B' : 'A'}`}
          </button>
          <button
            className="btn-ghost"
            style={{
              flex: 1, height: 40, borderRadius: 999, border: '1px solid var(--mt-line)',
              background: '#fff',
            }}
            onClick={() => nav('/p3')}
          >
            ✏️ 调整勾选
          </button>
        </div>
        <button className="btn-primary" onClick={() => nav('/p5')}>
          我满意 · 看看完整行程 →
        </button>
      </div>
    </MobileFrame>
  );
}

function useMemoDays(scene: 'sz' | 'bj', variant: number) {
  const days = DAYS_BY_SCENE[scene];
  if (variant === 0) return days;
  const day1 = days[0];
  return [
    {
      ...day1,
      title: '少绕路方案',
      items: scene === 'sz'
        ? [day1.items[0], day1.items[1], day1.items[2], day1.items[3], day1.items[5], day1.items[4], day1.items[6]]
        : [day1.items[0], day1.items[1], day1.items[2], day1.items[3], day1.items[4], day1.items[5]],
    },
    days[1],
  ];
}

function toRankDays(days: any[]): Day[] {
  return days.map((day) => ({
    label: day.label,
    title: day.title,
    items: day.items.map((item: Record<string, unknown>) => ({
      period: item.period as Period,
      cat: item.cat as Cat,
      name: String(item.name ?? ''),
      rating: Number(item.rating ?? 4.6),
      sub: String(item.note ?? item.price ?? item.duration ?? '后端智能编排'),
      duration: String(item.duration ?? ''),
      price: item.price ? String(item.price) : undefined,
      badge: item.hotelTier ? String(item.hotelTier) : item.queue ? `排队${item.queue}` : undefined,
      photoSeed: String(item.photoSeed ?? 'travel'),
      imageUrl: item.imageUrl ? String(item.imageUrl) : undefined,
      selfArranged: Boolean(item.selfArranged),
    })),
  }));
}

function DayHeader({ label, title }: { label: string; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 14px' }}>
      <span
        style={{
          padding: '4px 12px', borderRadius: 999,
          background: '#1a1a1a', color: '#fff',
          fontSize: 11.5, fontWeight: 800, letterSpacing: '.05em',
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 14, fontWeight: 700 }}>{title}</span>
    </div>
  );
}

function Timeline({ items, continueFromPrev }: { items: RankItem[]; continueFromPrev?: boolean }) {
  // Group by period to render the period marker once per period
  const groups: { period: Period; items: RankItem[] }[] = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && last.period === it.period) last.items.push(it);
    else groups.push({ period: it.period, items: [it] });
  }

  return (
    <div style={{ position: 'relative', paddingLeft: 0 }}>
      {/* The vertical yellow line */}
      <div
        style={{
          position: 'absolute', left: 14, top: continueFromPrev ? -10 : 16, bottom: 8, width: 2,
          background: 'repeating-linear-gradient(180deg,var(--mt-yellow-dark) 0 6px,transparent 6px 12px)',
        }}
      />
      {groups.map((g, gi) => (
        <div key={gi}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <span
              style={{
                width: 30, height: 30, borderRadius: '50%',
                background: 'linear-gradient(135deg,#ffd84a,#f5b800)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, position: 'relative', zIndex: 1,
                boxShadow: '0 4px 12px rgba(245,184,0,.4)',
              }}
            >
              {periodIcon[g.period]}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{g.period}</span>
          </div>
          <div style={{ paddingLeft: 36, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {g.items.map((it, idx) => (
              <RankCard key={idx} item={it} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RankCard({ item }: { item: RankItem }) {
  if (item.selfArranged) return <SelfArrangedCard item={item} />;
  const cc = catChipBg[item.cat];
  const borderColor = catColor[item.cat];
  return (
    <div
      className="card"
      style={{
        padding: 10, position: 'relative',
        borderLeft: `4px solid ${borderColor}`,
        borderRadius: '8px 12px 12px 8px',
      }}
    >
      <div style={{ display: 'flex', gap: 10 }}>
        <Photo seed={item.photoSeed} src={item.imageUrl} width={64} height={64} radius={10} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="h-between">
            <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{item.name}</span>
            {item.rating > 0 && (
              <span style={{ fontSize: 12.5, color: 'var(--mt-orange)', fontWeight: 800, marginLeft: 6 }}>
                ★ {item.rating}
              </span>
            )}
          </div>
          <div className="text-tiny text-muted" style={{ marginTop: 4 }}>{item.sub}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <span
              style={{
                padding: '2px 7px', borderRadius: 4,
                background: cc.bg, color: cc.fg,
                fontSize: 10.5, fontWeight: 700,
              }}
            >
              {item.cat}
            </span>
            <span className="text-tiny" style={{ color: 'var(--mt-text-2)' }}>
              ⏱ {item.duration}
            </span>
            {item.price && (
              <span className="text-tiny" style={{ color: 'var(--mt-orange)', fontWeight: 700 }}>
                {item.price}
              </span>
            )}
            {item.badge && (
              <span
                style={{
                  padding: '2px 7px', borderRadius: 4,
                  background: '#fff5cc', color: '#b88500',
                  fontSize: 10.5, fontWeight: 700,
                }}
              >
                {item.badge}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A meal slot the user hasn't booked — shown so each day still reads as a full
 *  早/午/晚, but visually distinct (dashed, no rating/price) and tappable to add. */
function SelfArrangedCard({ item }: { item: RankItem }) {
  const nav = useNavigate();
  return (
    <button
      onClick={() => nav('/p3')}
      style={{
        width: '100%', textAlign: 'left',
        padding: 10, display: 'flex', alignItems: 'center', gap: 10,
        border: '1px dashed var(--mt-line)', background: '#fafbfc',
        borderRadius: 10,
      }}
    >
      <div
        style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#fff1e6', fontSize: 18,
        }}
      >
        🍽️
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--mt-text-2)' }}>{item.name}</div>
        <div className="text-tiny text-muted" style={{ marginTop: 2 }}>{item.sub}</div>
      </div>
      <span style={{ fontSize: 12, color: 'var(--mt-orange)', fontWeight: 700, flexShrink: 0 }}>去加购 ›</span>
    </button>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        padding: '4px 10px', borderRadius: 999,
        background: 'rgba(255,255,255,.5)',
        fontSize: 11.5, fontWeight: 600, color: 'var(--mt-text-2)',
      }}
    >
      {children}
    </span>
  );
}

/* ============== Waiting page (shown before the rerank result) ============== */
function WaitingPage({ onDone }: { onDone: () => void }) {
  const nav = useNavigate();
  const { selectedPOIs, identity } = useApp();

  const steps = [
    '正在读取你的同行人和偏好',
    '匹配最适合的景点和美食',
    '比对人流和排队情况',
    '按地理顺路重排时间轴',
    '已生成你的专属行程',
  ];

  useEffect(() => {
    const timer = window.setTimeout(onDone, 4100);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    <MobileFrame>
      <StatusBar bg="#fff" />
      <div
        style={{
          height: 50, display: 'flex', alignItems: 'center', padding: '0 14px',
          background: '#fff', flexShrink: 0,
        }}
      >
        <button
          onClick={() => nav('/p3')}
          style={{
            width: 32, height: 32, borderRadius: '50%', background: '#f5f6f8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, color: '#1a1a1a',
          }}
        >
          ‹
        </button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: 700 }}>
          小go 重排中
        </div>
        <div style={{ width: 32 }} />
      </div>

      <div
        className="scroll-area"
        style={{
          background:
            'linear-gradient(180deg,#fff8d6 0%, #ffffff 40%, #ffffff 100%)',
          padding: '0 18px 30px',
        }}
      >
        {/* Cat character */}
        <CatCharacter />

        {/* Title + sub */}
        <div style={{ textAlign: 'center', marginTop: 20, marginBottom: 6 }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>小go 正在精细化重排</div>
          <div style={{ fontSize: 13, color: 'var(--mt-text-3)', marginTop: 8 }}>
            基于你勾选的 <b style={{ color: 'var(--mt-orange)' }}>{selectedPOIs.size || 10}</b> 项 +{' '}
            <b style={{ color: 'var(--mt-orange)' }}>{identity.preferences.length}</b> 个偏好
          </div>
        </div>

        {/* 5-step progress list */}
        <StreamingStatus
          title="行程重排进行中"
          messages={steps}
          style={{ marginTop: 28 }}
        />

      </div>
    </MobileFrame>
  );
}

/** Cute orange cat character (emoji + accents) */
function CatCharacter() {
  return (
    <div
      style={{
        position: 'relative',
        height: 240, marginTop: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 180, height: 180, borderRadius: '50%',
          background: 'radial-gradient(circle at 50% 40%,#fff8d6 0%, transparent 70%)',
          position: 'absolute',
        }}
      />
      <div
        style={{
          position: 'relative',
          fontSize: 120, lineHeight: 1,
          animation: 'catSway 3s ease-in-out infinite',
          transformOrigin: 'bottom center',
          filter: 'drop-shadow(0 8px 16px rgba(245,184,0,.25))',
        }}
      >
        🐱
      </div>
      <span style={{ position: 'absolute', top: '8%', right: '28%', fontSize: 22, animation: 'pulse 1.6s ease-in-out infinite' }}>✨</span>
      <span style={{ position: 'absolute', top: '22%', left: '22%', fontSize: 18, animation: 'pulse 1.8s ease-in-out infinite .3s' }}>⭐</span>
      <span style={{ position: 'absolute', top: '38%', right: '20%', fontSize: 16, animation: 'pulse 2s ease-in-out infinite .6s' }}>💡</span>
      <span style={{ position: 'absolute', bottom: '12%', left: '30%', fontSize: 20 }}>📋</span>
    </div>
  );
}
