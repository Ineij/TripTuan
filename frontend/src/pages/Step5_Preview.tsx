import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileFrame } from '../components/MobileFrame';
import { StatusBar } from '../components/StatusBar';
import { NavBar } from '../components/NavBar';
import { GoMark } from '../components/Atoms';
import { Photo } from '../components/Photo';
import { useApp } from '../store';
import { getPreview } from '../api';

type Period = '出发' | '上午' | '中午' | '下午' | '晚餐' | '晚上' | '返程';
type Cat = '交通' | '景点' | '美食' | '酒店';
type Queue = '低' | '中' | '高';
type HotelTier = '高档型' | '豪华型' | '舒适型';

interface Item {
  period: Period;
  cat: Cat;
  name: string;
  rating: number;
  duration: string;
  price?: string;
  queue?: Queue;
  hotelTier?: HotelTier;
  note?: string;
  photoSeed: string;
  /** Pre-generated Qwen illustration URL */
  imageUrl?: string;
}

interface Day { label: string; title: string; items: Item[] }

const DAYS_BY_SCENE: Record<'sz' | 'bj', Day[]> = { sz: [], bj: [] };

const periodIcon: Record<Period, string> = { 出发: '🚄', 上午: '☀️', 中午: '🍴', 下午: '⛅', 晚餐: '🍽️', 晚上: '🌙', 返程: '🏁' };
const catChip: Record<Cat, { bg: string; fg: string }> = {
  交通: { bg: '#e8f0ff', fg: '#3b82f6' },
  景点: { bg: '#e8f0ff', fg: '#3b82f6' },
  美食: { bg: '#fff1e6', fg: '#fb923c' },
  酒店: { bg: '#f1ebff', fg: '#7c3aed' },
};
const queueChip: Record<Queue, { bg: string; fg: string; label: string }> = {
  低: { bg: 'var(--mt-green-soft)', fg: 'var(--mt-green)', label: '排队低' },
  中: { bg: '#fff5cc',               fg: '#b88500',         label: '排队中' },
  高: { bg: 'var(--mt-red-soft)',   fg: 'var(--mt-red)',   label: '排队高' },
};

export default function Step5_Preview() {
  const nav = useNavigate();
  const { scene, identity } = useApp();
  const [preview, setPreview] = useState({
    title: scene === 'sz' ? '深圳周末游' : '北京家庭文化游',
    route: scene === 'sz' ? '广州 → 深圳 · 2 天 1 夜' : '河北 → 北京 · 2 天 1 夜',
    totalKm: scene === 'sz' ? '8.4' : '12.6',
    days: DAYS_BY_SCENE[scene],
  });

  useEffect(() => {
    let cancelled = false;
    setPreview({
      title: scene === 'sz' ? '深圳周末游' : '北京家庭文化游',
      route: scene === 'sz' ? '广州 → 深圳 · 2 天 1 夜' : '河北 → 北京 · 2 天 1 夜',
      totalKm: scene === 'sz' ? '8.4' : '12.6',
      days: DAYS_BY_SCENE[scene],
    });
    getPreview(scene)
      .then((payload) => {
        if (!cancelled) {
          setPreview({
            title: payload.title,
            route: payload.route,
            totalKm: payload.totalKm,
            days: payload.days as Day[],
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [scene]);

  const days = preview.days;
  const totalSights = days.flatMap((d) => d.items).filter((i) => i.cat === '景点').length;

  return (
    <MobileFrame>
      <StatusBar bg="#fff" />
      <NavBar title="行程预览" />

      <div className="scroll-area" style={{ padding: '14px 14px 140px' }}>
        {/* Blue hero card */}
        <div
          style={{
            background: 'linear-gradient(135deg,#3b82f6 0%,#2563eb 100%)',
            color: '#fff',
            borderRadius: 14, padding: '18px 16px', marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 800 }}>{preview.title}</div>
          <div style={{ fontSize: 12.5, opacity: 0.9, marginTop: 4 }}>{preview.route}</div>
          <div
            style={{
              marginTop: 14,
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
            }}
          >
            {[
              { v: '2',  l: '天' },
              { v: String(totalSights), l: '个景点' },
              { v: preview.totalKm, l: 'km' },
              { v: `${identity.partySize}`, l: '人' },
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  background: 'rgba(255,255,255,.18)',
                  borderRadius: 10, padding: '10px 0',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 800 }}>{s.v}</div>
                <div style={{ fontSize: 10.5, opacity: 0.85, marginTop: 2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tag row */}
        <div
          style={{
            background: '#fff', borderRadius: 12, padding: '10px 12px',
            display: 'flex', gap: 8, marginBottom: 14,
          }}
        >
          <Tag>👥 {identity.partySize} 人</Tag>
          {identity.preferences.slice(0, 2).map((p) => (
            <Tag key={p}>
              {p === '打卡行' ? '🎒' : p === '爱美食' ? '🍜' : '✨'} {p}
            </Tag>
          ))}
        </div>

        {/* Days */}
        {days.map((d) => (
          <div key={d.label} style={{ marginBottom: 18 }}>
            <div className="h-between" style={{ margin: '0 4px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    padding: '4px 12px', borderRadius: 999,
                    background: '#1a1a1a', color: '#fff',
                    fontSize: 11.5, fontWeight: 800, letterSpacing: '.05em',
                  }}
                >
                  {d.label}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{d.title}</span>
              </div>
              <span className="text-tiny text-muted">{d.items.length} 站</span>
            </div>

            {/* Group by period */}
            <PeriodSections items={d.items} />
          </div>
        ))}

        {/* Footer brand */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            margin: '14px 0 4px', color: 'var(--mt-text-3)', fontSize: 11.5,
          }}
        >
          <GoMark size={20} />
          <span>小go · 现在就出发 · 美团 App</span>
        </div>
      </div>

      {/* Footer */}
      <div className="footer-bar" style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => nav('/p3')}
          className="btn-ghost"
          style={{ flex: 1, height: 50, borderRadius: 14, background: 'var(--mt-bg)' }}
        >
          ‹ 返回调整
        </button>
        <button
          className="btn-primary"
          style={{ flex: 1.6 }}
          onClick={() => nav('/p6')}
        >
          我满意 · 一键下单 →
        </button>
      </div>
    </MobileFrame>
  );
}

function PeriodSections({ items }: { items: Item[] }) {
  const groups: { period: Period; items: Item[] }[] = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && last.period === it.period) last.items.push(it);
    else groups.push({ period: it.period, items: [it] });
  }
  return (
    <div className="card" style={{ padding: 0 }}>
      {groups.map((g, gi) => (
        <div key={gi}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '12px 14px 8px',
              fontSize: 13, fontWeight: 700,
              borderTop: gi > 0 ? '1px solid var(--mt-line-2)' : 'none',
            }}
          >
            <span style={{ fontSize: 14 }}>{periodIcon[g.period]}</span>
            <span>{g.period}</span>
          </div>
          {g.items.map((it, ii) => (
            <PreviewCard
              key={ii}
              item={it}
              last={ii === g.items.length - 1 && gi === groups.length - 1}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function PreviewCard({ item, last }: { item: Item; last?: boolean }) {
  const cc = catChip[item.cat];
  const qc = item.queue ? queueChip[item.queue] : null;

  return (
    <div
      style={{
        display: 'flex', gap: 12,
        padding: '10px 14px 14px',
        borderBottom: last ? 'none' : '1px dashed var(--mt-line-2)',
      }}
    >
      <Photo seed={item.photoSeed} src={item.imageUrl} width={50} height={50} radius={8} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 700, flex: 1, minWidth: 0 }}>{item.name}</span>
          <span style={{ fontSize: 12, color: 'var(--mt-orange)', fontWeight: 800 }}>
            ★ {item.rating}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          <span
            style={{
              padding: '2px 6px', borderRadius: 3,
              background: cc.bg, color: cc.fg,
              fontSize: 10.5, fontWeight: 700,
            }}
          >
            {item.cat}
          </span>
          <span className="text-tiny" style={{ color: 'var(--mt-text-2)' }}>{item.duration}</span>
          {item.price && (
            <span className="text-tiny" style={{ color: 'var(--mt-orange)', fontWeight: 700 }}>
              · {item.price}
            </span>
          )}
          {qc && (
            <span
              style={{
                padding: '2px 6px', borderRadius: 3,
                background: qc.bg, color: qc.fg,
                fontSize: 10.5, fontWeight: 700,
              }}
            >
              · {qc.label}
            </span>
          )}
          {item.hotelTier && (
            <span style={{ padding: '2px 6px', borderRadius: 3, background: '#f1ebff', color: '#7c3aed', fontSize: 10.5, fontWeight: 700 }}>
              · {item.hotelTier}
            </span>
          )}
          {item.note && (
            <div className="text-tiny" style={{ width: '100%', color: 'var(--mt-text-2)', marginTop: 2 }}>
              {item.note}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        padding: '5px 12px', borderRadius: 999,
        background: 'var(--mt-bg)',
        fontSize: 11.5, fontWeight: 600, color: 'var(--mt-text-2)',
      }}
    >
      {children}
    </span>
  );
}
