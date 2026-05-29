import { useLocation, useNavigate } from 'react-router-dom';
import { useApp, type Weather } from '../store';

/** 10-step demo sequence — used by playback controls & progress dots. */
const STEPS = [
  { path: '/',          short: '总览',     icon: '🏠' },
  { path: '/p1',        short: '问小团',   icon: '💬' },
  { path: '/p2',        short: '身份',     icon: '👥' },
  { path: '/p3',        short: '勾选',     icon: '✓'  },
  { path: '/p4',        short: '重排',     icon: '🔄' },
  { path: '/p5',        short: '预览',     icon: '📋' },
  { path: '/p6',        short: '下单',     icon: '💳' },
  { path: '/p7',        short: '动态看板', icon: '🗺️' },
  { path: '/p8',        short: '地图路线', icon: '📍' },
  { path: '/summary',   short: '总结',     icon: '✨' },
];

const ALIAS_TO_STEP: Record<string, number> = {
  '/identity': 2, '/picker': 3, '/rerank': 4, '/preview': 5,
  '/order': 6, '/board': 7, '/board-map': 8,
};

/** Floating demo playback controls + progress dots. */
export function DemoOverlay() {
  const loc = useLocation();
  const nav = useNavigate();
  const { weather, setWeather } = useApp();

  // Hide on standalone meta pages
  if (['/kevin', '/flow', '/review'].includes(loc.pathname)) return null;

  let idx = STEPS.findIndex((s) => s.path === loc.pathname);
  if (idx < 0 && loc.pathname in ALIAS_TO_STEP) idx = ALIAS_TO_STEP[loc.pathname];
  if (idx < 0) return null;

  const cur = STEPS[idx];
  const prev = STEPS[Math.max(0, idx - 1)];
  const next = STEPS[Math.min(STEPS.length - 1, idx + 1)];

  return (
    <div
      style={{
        position: 'fixed',
        right: 20, bottom: 20,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
        gap: 10,
        zIndex: 1000,
        pointerEvents: 'none',
      }}
    >
      {/* Weather widget */}
      <div
        style={{
          pointerEvents: 'auto',
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', borderRadius: 999,
          background: '#fff', boxShadow: '0 8px 24px rgba(0,0,0,.18)',
          fontSize: 13, fontWeight: 600, color: '#4a4a4a',
        }}
      >
        <span>天气</span>
        {([
          ['sunny', '🎐'],
          ['rainy', '💧'],
          ['snowy', '⛄'],
        ] as Array<[Weather, string]>).map(([w, icon]) => (
          <button
            key={w}
            onClick={() => setWeather(w)}
            title={w === 'sunny' ? '晴天' : w === 'rainy' ? '雨天' : '雪天'}
            style={{
              width: 30, height: 30, borderRadius: '50%',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: weather === w ? '#dbeafe' : 'transparent',
              boxShadow: weather === w ? 'inset 0 0 0 1px rgba(59,130,246,.18)' : 'none',
              fontSize: 17,
              opacity: weather === w ? 1 : 0.55,
              transition: 'all .2s',
            }}
          >
            {icon}
          </button>
        ))}
      </div>

      {/* Step chip */}
      <button
        onClick={() => nav(next.path)}
        title={`进入下一页：${next.short}`}
        style={{
          pointerEvents: 'auto',
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '7px 14px', borderRadius: 999,
          background: '#1a1a1a', color: '#fff',
          fontSize: 13, fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,.32)',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 14 }}>{cur.icon}</span>
        <span>第 {idx + 1}/{STEPS.length} 步 · {cur.short}</span>
      </button>

      {/* Playback row */}
      <div
        style={{
          pointerEvents: 'auto',
          display: 'flex', alignItems: 'center',
          background: '#fff', borderRadius: 999,
          padding: '4px 6px',
          boxShadow: '0 10px 30px rgba(0,0,0,.18)',
          gap: 2,
        }}
      >
        <CtrlBtn label="⏮" onClick={() => nav('/')} />
        <CtrlBtn label="‹" onClick={() => nav(prev.path)} />
        <button
          onClick={() => nav(next.path)}
          style={{
            background: '#1a1a1a', color: '#fff',
            padding: '8px 18px', borderRadius: 999,
            fontSize: 13.5, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          {next.short} <span style={{ marginLeft: 2 }}>›</span>
        </button>
        <CtrlBtn label="⏭" onClick={() => nav(STEPS[STEPS.length - 1].path)} />
      </div>

      {/* Progress dots */}
      <div
        style={{
          pointerEvents: 'auto',
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 999,
          background: '#fff', boxShadow: '0 6px 18px rgba(0,0,0,.14)',
        }}
      >
        {STEPS.map((s, i) => {
          const active = i === idx;
          return (
            <button
              key={s.path}
              onClick={() => nav(s.path)}
              title={`第 ${i + 1} 步 · ${s.short}`}
              style={{
                width: active ? 18 : 7, height: 7,
                borderRadius: 999,
                background: active ? '#f5b800' : i < idx ? '#d4d7dd' : '#e8e9ec',
                transition: 'all .2s',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function CtrlBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 34, height: 34, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, color: '#4a4a4a',
      }}
    >
      {label}
    </button>
  );
}
