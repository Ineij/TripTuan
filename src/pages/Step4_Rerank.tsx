import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileFrame } from '../components/MobileFrame';
import { StatusBar } from '../components/StatusBar';
import { NavBar } from '../components/NavBar';
import { GoMark } from '../components/Atoms';
import { Photo } from '../components/Photo';
import { useApp } from '../store';

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
  // transport-specific extra line
  trainNo?: string;
}

interface Day {
  label: string; // "DAY 1"
  title: string; // "主线行程"
  items: RankItem[];
}

const DAYS_BY_SCENE: Record<'hk' | 'bj', Day[]> = {
  hk: [
    {
      label: 'DAY 1', title: '主线行程',
      items: [
        { period: '出发', cat: '交通', name: '高铁 · 深圳北 → 香港西九龙',
          rating: 4.8, sub: 'G6501 次 · 二等座', duration: '14 分钟', price: '¥75 / 人',
          badge: '推荐', trainNo: 'G6501', photoSeed: 'hk-train' },
        { period: '上午', cat: '景点', name: '尖沙咀海港城',
          rating: 4.6, sub: '一站式购物中心', duration: '2-3 小时', badge: '购物', photoSeed: 'tst-harbour-city' },
        { period: '中午', cat: '美食', name: '港式茶餐厅（澳洲牛奶公司）',
          rating: 4.6, sub: '港式奶茶 + 菠萝包 + 蛋挞', duration: '40 分钟', price: '人均 ¥80', badge: '老字号', photoSeed: 'aussie-dairy' },
        { period: '下午', cat: '景点', name: '维多利亚港',
          rating: 4.7, sub: '维港夜景必打卡', duration: '2-3 小时', photoSeed: 'victoria-harbour' },
        { period: '晚餐', cat: '美食', name: '镛记烧鹅',
          rating: 4.8, sub: '米其林港式烧味', duration: '60 分钟', price: '人均 ¥260', badge: '米其林', photoSeed: 'yung-kee-goose' },
        { period: '晚上', cat: '景点', name: '星光大道',
          rating: 4.0, sub: '海滨长廊 + 明星掌印', duration: '2 小时', photoSeed: 'avenue-of-stars' },
        { period: '晚上', cat: '酒店', name: '香港君怡酒店',
          rating: 4.8, sub: '今晚入住 · 尖沙咀核心地段', duration: '1 晚', price: '¥1167 起 / 晚', badge: '高档型', photoSeed: 'hk-hotel-bp' },
      ],
    },
    {
      label: 'DAY 2', title: '山顶与返程',
      items: [
        { period: '上午', cat: '景点', name: '太平山顶',
          rating: 4.8, sub: '凌霄阁 360° 观景', duration: '2-3 小时', price: '¥99', photoSeed: 'victoria-peak' },
        { period: '中午', cat: '美食', name: '兰芳园中环创办店',
          rating: 4.5, sub: '丝袜奶茶 + 菠萝油', duration: '45 分钟', price: '人均 ¥65', badge: '老字号', photoSeed: 'aussie-dairy' },
        { period: '返程', cat: '交通', name: '高铁 · 香港西九龙 → 深圳北',
          rating: 4.8, sub: 'G6534 次 · 二等座', duration: '14 分钟', price: '¥75 / 人',
          badge: '已勾选', trainNo: 'G6534', photoSeed: 'hk-train' },
      ],
    },
  ],
  bj: [
    {
      label: 'DAY 1', title: '中轴线文化游',
      items: [
        { period: '出发', cat: '交通', name: '高铁 · 石家庄 → 北京南',
          rating: 4.8, sub: 'G671 次 · 二等座', duration: '1 小时 12 分钟', price: '¥128 / 人',
          badge: '推荐', trainNo: 'G671', photoSeed: 'bj-train' },
        { period: '上午', cat: '景点', name: '天安门广场',
          rating: 4.9, sub: '预约入场 · 家庭合照', duration: '1.5 小时', badge: '地标', photoSeed: 'bj-tiananmen' },
        { period: '上午', cat: '景点', name: '故宫博物院',
          rating: 4.8, sub: '午门 → 太和殿 → 御花园', duration: '3 小时', price: '¥60', photoSeed: 'bj-forbidden-city' },
        { period: '中午', cat: '美食', name: '四季民福烤鸭',
          rating: 4.7, sub: '亲子友好 · 可提前排号', duration: '70 分钟', price: '人均 ¥160', badge: '人气', photoSeed: 'bj-roast-duck' },
        { period: '下午', cat: '景点', name: '王府井步行街',
          rating: 4.5, sub: '商场休息 + 小吃', duration: '2 小时', photoSeed: 'bj-wangfujing' },
        { period: '晚上', cat: '酒店', name: '北京王府井希尔顿',
          rating: 4.8, sub: '今晚入住 · 近地铁', duration: '1 晚', price: '¥1280 起 / 晚', badge: '亲子', photoSeed: 'bj-hotel-hilton' },
      ],
    },
    {
      label: 'DAY 2', title: '慢节奏返程',
      items: [
        { period: '上午', cat: '景点', name: '颐和园泛舟',
          rating: 4.7, sub: '少走路 · 湖边慢游', duration: '2 小时', price: '¥30', photoSeed: 'bj-summer-palace' },
        { period: '中午', cat: '美食', name: '护国寺小吃',
          rating: 4.5, sub: '豆汁、焦圈、驴打滚', duration: '50 分钟', price: '人均 ¥45', photoSeed: 'bj-roast-duck' },
        { period: '下午', cat: '景点', name: '什刹海',
          rating: 4.4, sub: '胡同散步 + 家庭照片', duration: '1.5 小时', photoSeed: 'bj-shichahai' },
        { period: '返程', cat: '交通', name: '高铁 · 北京南 → 石家庄',
          rating: 4.8, sub: 'G672 次 · 二等座', duration: '1 小时 14 分钟', price: '¥128 / 人',
          badge: '已勾选', trainNo: 'G672', photoSeed: 'bj-train' },
      ],
    },
  ],
};

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
  const { scene } = useApp();
  const [variant, setVariant] = useState(0);
  const [regenerating, setRegenerating] = useState(false);
  const days = useMemoDays(scene, variant);
  const totalCount = days.reduce((a, d) => a + d.items.length, 0);
  const foodCount  = days.flatMap((d) => d.items).filter((i) => i.cat === '美食').length;
  const sightCount = days.flatMap((d) => d.items).filter((i) => i.cat === '景点').length;
  const regenerate = () => {
    setRegenerating(true);
    window.setTimeout(() => {
      setVariant((v) => (v + 1) % 2);
      setRegenerating(false);
    }, 900);
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
                  {scene === 'hk' ? '香港周末漫游' : '北京家庭文化游'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--mt-text-3)', marginTop: 2 }}>
                  {scene === 'hk' ? '深圳 → 香港 · 2 天 1 夜' : '河北 → 北京 · 2 天 1 夜'} · 共 {totalCount} 站
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
            <Pill>1 人</Pill>
          </div>
        </div>

        {/* Timeline */}
        {regenerating && (
          <div className="card fade-up" style={{ marginBottom: 12, background: '#fffbeb', border: '1px solid #facc15', fontSize: 13, fontWeight: 800 }}>
            🔄 正在按你已勾选的项目重新排序，生成方案 {variant === 0 ? 'B' : 'A'}...
          </div>
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

function useMemoDays(scene: 'hk' | 'bj', variant: number) {
  const days = DAYS_BY_SCENE[scene];
  if (variant === 0) return days;
  const day1 = days[0];
  return [
    {
      ...day1,
      title: '少绕路方案',
      items: scene === 'hk'
        ? [day1.items[0], day1.items[1], day1.items[2], day1.items[3], day1.items[5], day1.items[4], day1.items[6]]
        : [day1.items[0], day1.items[1], day1.items[2], day1.items[3], day1.items[4], day1.items[5]],
    },
    days[1],
  ];
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
        <Photo seed={item.photoSeed} width={64} height={64} radius={10} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="h-between">
            <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{item.name}</span>
            <span style={{ fontSize: 12.5, color: 'var(--mt-orange)', fontWeight: 800, marginLeft: 6 }}>
              ★ {item.rating}
            </span>
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
  const [step, setStep] = useState(0); // 0..5 — 5 means all done → trigger onDone

  const steps = [
    '正在读取你的同行人和偏好',
    '匹配最适合的景点和美食',
    '比对人流和排队情况',
    '按地理顺路重排时间轴',
    '已生成你的专属行程',
  ];

  useEffect(() => {
    const tos: number[] = [];
    [600, 1300, 2100, 2900, 3500].forEach((d, i) => {
      tos.push(window.setTimeout(() => setStep(i + 1), d));
    });
    tos.push(window.setTimeout(onDone, 4100));
    return () => tos.forEach(window.clearTimeout);
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
        <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {steps.map((s, i) => {
            const isDone = i < step;
            const isActive = i === step;
            const bg = isDone ? 'var(--mt-green-soft)' : isActive ? '#fffbeb' : '#fff';
            const border = isActive ? '2px solid var(--mt-yellow-dark)' : '2px solid transparent';
            const textColor = isDone ? 'var(--mt-text)' : isActive ? 'var(--mt-text)' : 'var(--mt-text-4)';
            const iconBg = isDone ? 'var(--mt-green)' : isActive ? 'var(--mt-yellow)' : '#e8e9ec';

            return (
              <div
                key={s}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 16px', borderRadius: 12,
                  background: bg, border,
                  transition: 'all .25s',
                  boxShadow: isActive ? '0 4px 14px rgba(245,184,0,.18)' : 'none',
                }}
              >
                <span
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: iconBg, color: '#fff',
                    fontSize: 14, fontWeight: 800,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {isDone ? '✓' : isActive
                    ? <span style={{ animation: 'spin .9s linear infinite', display: 'inline-block' }}>⟳</span>
                    : i === 4 ? <span style={{ color: '#9aa5b1' }}>✨</span> : <span style={{ color: '#9aa5b1' }}>⟳</span>}
                </span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: isActive ? 700 : 500, color: textColor }}>
                  {s}
                </span>
              </div>
            );
          })}
        </div>
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
