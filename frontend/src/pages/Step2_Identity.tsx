import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileFrame } from '../components/MobileFrame';
import { StatusBar } from '../components/StatusBar';
import { NavBar } from '../components/NavBar';
import { GoMark } from '../components/Atoms';
import { useApp } from '../store';
import type { Identity, Scene } from '../types';
import { getPickerItems } from '../api';

// Demo scenario presets — applied on first visit if identity is still at defaults
const SCENE_PRESET: Record<Scene, Partial<Identity>> = {
  sz: {
    partySize:   2,
    hasElder:    false,
    hasKid:      false,
    hasSpecial:  false,
    preferences: ['打卡行', '爱美食'],
  },
  bj: {
    partySize:   3,
    hasElder:    false,
    hasKid:      true,
    hasSpecial:  false,
    preferences: ['文艺之旅', '亲子友好'],
  },
};

const PREFS: { key: string; emoji: string; label: string }[] = [
  { key: 'easy',    emoji: '🍃', label: '轻松行' },
  { key: 'check',   emoji: '📸', label: '打卡行' },
  { key: 'food',    emoji: '🍜', label: '爱美食' },
  { key: 'nature',  emoji: '🌄', label: '爱自然' },
  { key: 'arts',    emoji: '📖', label: '文艺之旅' },
  { key: 'family',  emoji: '👫', label: '亲子友好' },
  { key: 'night',   emoji: '🌃', label: '夜景灯光' },
  { key: 'shop',    emoji: '🛍️', label: '购物体验' },
];

export default function Step2_Identity() {
  const nav = useNavigate();
  const { identity, setIdentity, scene } = useApp();
  const sceneTitle = scene === 'sz' ? '深圳周末游' : '北京家庭文化游';
  const sceneRoute = scene === 'sz' ? '广州 → 深圳 · 2 天 1 夜' : '河北 → 北京 · 2 天 1 夜';
  const [candidateCount, setCandidateCount] = useState(17);
  // Track whether we've already applied the preset for the current scene
  const presetApplied = useRef<Record<Scene, boolean>>({ sz: false, bj: false });

  // Apply demo scenario preset on first load (if partySize is still at default=1)
  useEffect(() => {
    if (!presetApplied.current[scene] && identity.partySize === 1) {
      const preset = SCENE_PRESET[scene];
      if (preset) {
        setIdentity({ ...identity, ...preset });
        presetApplied.current[scene] = true;
      }
    }
  }, [scene]);

  useEffect(() => {
    getPickerItems(scene).then((items) => {
      const count = items.filter((it) => it.cat !== 'transport').length;
      if (count > 0) setCandidateCount(count);
    }).catch(() => undefined);
  }, [scene]);

  const togglePref = (k: string) =>
    setIdentity({
      ...identity,
      preferences: identity.preferences.includes(k)
        ? identity.preferences.filter((x) => x !== k)
        : [...identity.preferences, k],
    });

  const specialRows = [
    {
      icon: '👴', bg: '#fff5cc',
      title: '同行老人', sub: '推荐少爬楼、可坐车的景点',
      get: identity.hasElder, set: (v: boolean) => setIdentity({ ...identity, hasElder: v }),
    },
    {
      icon: '👶', bg: '#ffe1cc',
      title: '同行小孩', sub: '推荐亲子友好、互动性强的项目',
      get: identity.hasKid, set: (v: boolean) => setIdentity({ ...identity, hasKid: v }),
    },
    {
      icon: '♿', bg: '#e8f0ff',
      title: '孕妇 / 残疾人 / 其他', sub: '优先推荐无障碍设施和平缓路线',
      get: identity.hasSpecial, set: (v: boolean) => setIdentity({ ...identity, hasSpecial: v }),
    },
  ];

  const prefLabels = identity.preferences
    .map((k) => {
      const p = PREFS.find((x) => x.label === k) ?? PREFS.find((x) => x.key === k);
      return p?.label ?? k;
    })
    .join('·') || '无';

  return (
    <MobileFrame>
      <StatusBar bg="#fff" />
      <NavBar title="先告诉我们你的同行人" />
      <div className="scroll-area" style={{ padding: '12px 14px 100px' }}>
        {/* Intro yellow card */}
        <div
          style={{
            background: 'linear-gradient(135deg,#fff8d6,#ffe7a3)',
            border: '1px solid #ffd84a',
            borderRadius: 14, padding: 14, marginBottom: 16,
          }}
        >
          <div className="h-between" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <GoMark size={26} />
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 800 }}>{sceneTitle}</div>
                <div style={{ fontSize: 11.5, color: 'var(--mt-text-3)', marginTop: 2 }}>
                  {sceneRoute}
                </div>
              </div>
            </div>
            <span
              style={{
                padding: '3px 8px', borderRadius: 4,
                background: 'rgba(245,184,0,.25)', color: '#b88500',
                fontSize: 10.5, fontWeight: 700,
              }}
            >
              已读完攻略
            </span>
          </div>
          <div
            style={{
              background: 'rgba(255,255,255,.6)', borderRadius: 10, padding: 10,
              fontSize: 12.5, color: 'var(--mt-text-2)', lineHeight: 1.65,
            }}
          >
            💬 小go 已经从问小团那里拿到了 <b>{candidateCount} 个</b> 候选项（景点 / 美食 / 酒店）。
            先告诉我同行人和偏好，我帮你筛出最合适的，再让你勾选。
          </div>
        </div>

        {/* Section 1: party size */}
        <SectionHeader n={1} title="出行人数" required hint="必填，用于匹配房型和团购份数" />
        <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>共有多少人</div>
            <div className="text-tiny text-muted" style={{ marginTop: 4 }}>
              包含老人、小孩在内的所有人
            </div>
          </div>
          <Counter
            value={identity.partySize}
            onChange={(v) => setIdentity({ ...identity, partySize: Math.max(1, v) })}
          />
        </div>

        {/* Section 2: special people */}
        <SectionHeader n={2} title="是否含特殊人群" hint="选填，帮我们推荐更友好的路线（无障碍 / 慢节奏）" />
        <div className="card" style={{ padding: 0, marginBottom: 16 }}>
          {specialRows.map((r, i) => (
            <div
              key={r.title}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 14px',
                borderBottom: i < specialRows.length - 1 ? '1px solid var(--mt-line-2)' : 'none',
              }}
            >
              <div
                style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: r.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, flexShrink: 0,
                }}
              >
                {r.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{r.title}</div>
                <div className="text-tiny text-muted" style={{ marginTop: 2 }}>{r.sub}</div>
              </div>
              <IosToggle on={r.get} onChange={r.set} />
            </div>
          ))}
        </div>

        {/* Section 3: preferences */}
        <SectionHeader n={3} title="出行偏好" hint="选填，多选，按你勾的来推荐风格" />
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {PREFS.map((p) => {
              const v = identity.preferences.includes(p.label);
              return (
                <button
                  key={p.key}
                  onClick={() => togglePref(p.label)}
                  style={{
                    padding: '9px 14px', borderRadius: 999,
                    background: v ? '#fff8d6' : '#fff',
                    color: v ? '#1a1a1a' : 'var(--mt-text-2)',
                    fontSize: 12.5, fontWeight: 600,
                    border: '1.5px solid ' + (v ? 'var(--mt-yellow-dark)' : 'var(--mt-line)'),
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <span>{p.emoji}</span>
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>
          <div className="hairline" style={{ marginTop: 14, marginBottom: 10 }} />
          <div className="text-small text-muted">
            💡 已选 <b style={{ color: 'var(--go-purple)' }}>{identity.preferences.length}</b> 个偏好。后续小go会按这些偏好打分排序。
          </div>
        </div>

        {/* Summary */}
        <div style={{ fontSize: 13, fontWeight: 700, margin: '8px 4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
          📋 信息摘要
        </div>
        <div className="card" style={{ padding: 0 }}>
          <SummaryRow label="出行人数" value={`${identity.partySize} 人`} />
          <SummaryRow
            label="特殊同行"
            value={
              identity.hasElder || identity.hasKid || identity.hasSpecial
                ? [
                    identity.hasElder && '老人',
                    identity.hasKid && '小孩',
                    identity.hasSpecial && '孕妇/残疾',
                  ].filter(Boolean).join('、')
                : '无'
            }
          />
          <SummaryRow label="偏好" value={prefLabels} last />
        </div>
      </div>

      {/* Footer */}
      <div className="footer-bar">
        <button className="btn-primary" onClick={() => nav('/p3')}>
          下一步 · 挑选你想去的项目 →
        </button>
        <div className="text-tiny text-muted" style={{ textAlign: 'center', marginTop: 8 }}>
          选填项可跳过，下一步还能再调整
        </div>
      </div>
    </MobileFrame>
  );
}

function SectionHeader({
  n, title, hint, required,
}: { n: number; title: string; hint: string; required?: boolean }) {
  return (
    <div style={{ margin: '4px 4px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            width: 22, height: 22, borderRadius: '50%',
            background: 'linear-gradient(135deg,#ffd84a,#f5b800)',
            color: '#1a1a1a', fontSize: 12, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {n}
        </span>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{title}</span>
        {required && (
          <span style={{ padding: '2px 6px', borderRadius: 4, background: 'var(--mt-red-soft)', color: 'var(--mt-red)', fontSize: 10, fontWeight: 700 }}>
            必填
          </span>
        )}
        {!required && (
          <span style={{ padding: '2px 6px', borderRadius: 4, background: '#f0f1f3', color: 'var(--mt-text-3)', fontSize: 10, fontWeight: 700 }}>
            选填
          </span>
        )}
      </div>
      <div className="text-tiny text-muted" style={{ marginTop: 6, paddingLeft: 30 }}>
        {hint}
      </div>
    </div>
  );
}

function Counter({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <button
        onClick={() => onChange(value - 1)}
        style={{
          width: 32, height: 32, borderRadius: '50%', background: '#f5f6f8',
          fontSize: 16, fontWeight: 700, color: 'var(--mt-text-2)',
        }}
      >
        −
      </button>
      <div style={{ fontSize: 18, fontWeight: 800, minWidth: 24, textAlign: 'center' }}>{value}</div>
      <button
        onClick={() => onChange(value + 1)}
        style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'linear-gradient(135deg,#ffd84a,#f5b800)',
          fontSize: 16, fontWeight: 800, color: '#1a1a1a',
        }}
      >
        +
      </button>
    </div>
  );
}

function IosToggle({ on, onChange }: { on: boolean; onChange: (b: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        width: 44, height: 26, borderRadius: 999,
        background: on ? 'var(--mt-yellow-dark)' : '#d4d7dd',
        position: 'relative', transition: 'background .2s',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute', top: 2,
          left: on ? 20 : 2,
          width: 22, height: 22, borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 2px 4px rgba(0,0,0,.18)',
          transition: 'left .2s',
        }}
      />
    </button>
  );
}

function SummaryRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center',
        padding: '12px 14px',
        borderBottom: last ? 'none' : '1px solid var(--mt-line-2)',
      }}
    >
      <span style={{ fontSize: 12.5, color: 'var(--mt-text-3)', minWidth: 70 }}>{label}</span>
      <span style={{ flex: 1, textAlign: 'right', fontSize: 13.5, fontWeight: 700 }}>{value}</span>
    </div>
  );
}
