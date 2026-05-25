import type { CSSProperties, ReactNode } from 'react';

/** Compact stat with label + value (used in preview/summary hero cards). */
export function Stat({
  label, value, highlight,
}: { label: string; value: ReactNode; highlight?: boolean }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10.5, color: 'var(--mt-text-3)', fontWeight: 600 }}>{label}</div>
      <div
        style={{
          fontSize: 14, fontWeight: 800, marginTop: 2,
          color: highlight ? 'var(--mt-orange)' : 'var(--mt-text)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

/** Stat with an emoji icon in a square chip. */
export function IconStat({
  icon, label, value,
}: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 10px', borderRadius: 10,
        background: '#fff', border: '1px solid var(--mt-line-2)',
      }}
    >
      <span
        style={{
          width: 26, height: 26, borderRadius: 8, background: '#fafbfd',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14,
        }}
      >
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10.5, color: 'var(--mt-text-3)', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 800, marginTop: 1 }}>{value}</div>
      </div>
    </div>
  );
}

/** Bullet stat with colored dot + label-value row. */
export function BulletStat({
  label, value, color = 'var(--mt-yellow-dark)', last,
}: { label: string; value: ReactNode; color?: string; last?: boolean }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 0',
        borderBottom: last ? 'none' : '1px solid var(--mt-line-2)',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 12.5, color: 'var(--mt-text-3)', minWidth: 80 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, marginLeft: 'auto' }}>{value}</span>
    </div>
  );
}

/** Hairline divider. */
export function Hairline({ style }: { style?: CSSProperties }) {
  return <div className="hairline" style={style} />;
}

/** "go" badge — small round purple gradient mark for AI agent. */
export function GoMark({ size = 28 }: { size?: number }) {
  return (
    <span
      className="go-mark"
      style={{ width: size, height: size, fontSize: size <= 22 ? 9 : 11.5 }}
    >
      go
    </span>
  );
}

/** Step number badge — round yellow. */
export function StepNum({ n }: { n: number }) {
  return <span className="step-num">{n}</span>;
}

/** "小团" conic gradient avatar. */
export function XiaotuanAvatar({ size = 28 }: { size?: number }) {
  return (
    <span
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
        background:
          'conic-gradient(from 90deg, #fbbf24, #f472b6, #a78bfa, #60a5fa, #34d399, #fbbf24)',
      }}
    />
  );
}

/** Icon mapping for POI/transport types — mirrors original Km(). */
export const typeIcon: Record<string, string> = {
  景点: '🎡', 美食: '🍜', 酒店: '🏨', 交通: '🚄',
  出发: '🚦', 返程: '🏁', 上午: '🌅', 中午: '☀️', 下午: '🌤️', 晚上: '🌙',
  休闲: '☕', 娱乐: '🎨', 住宿: '🏨', 餐饮: '🍜',
  飞机: '✈️', 高铁: '🚄', 火车: '🚂', 巴士: '🚌',
};
export const typeColor: Record<string, string> = {
  景点: '#3b82f6', 美食: '#f59e0b', 酒店: '#8b5cf6', 交通: '#10b981',
};
