import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../store';
import type { Scene } from '../types';

interface SceneCard {
  key: Scene;
  badge: string;
  badgeBg: string;
  title: string;
  emoji: string;
  route: string;
  quote: string;
  tags: string[];
  feature: { emoji: string; label: string };
  accent: string;
}

const SCENES: SceneCard[] = [
  {
    key: 'hk',
    badge: '场景 A · 效率型 · 单人',
    badgeBg: 'linear-gradient(90deg,#60a5fa,#3b82f6)',
    title: '香港周末漫游',
    emoji: '🚄',
    route: '深圳 → 香港 · 2 天 1 夜',
    quote: '「给我推荐香港周末旅行」',
    tags: ['快', '省', '高效', '单人'],
    feature: { emoji: '🍵', label: '得闲饮茶啦（早茶推荐）' },
    accent: '#3b82f6',
  },
  {
    key: 'bj',
    badge: '场景 B · 协同型 · 多人',
    badgeBg: 'linear-gradient(90deg,#34d399,#10b981)',
    title: '北京家庭文化游',
    emoji: '👨‍👩‍👧',
    route: '河北 → 北京 · 2 天 1 夜',
    quote: '「一家四口（含老人小孩）想去北京玩两天」',
    tags: ['协同', '分享', '共创', '即时交互'],
    feature: { emoji: '🥢', label: '吃了嘛您！（北京老字号）' },
    accent: '#10b981',
  },
];

const MAIN_STEPS = [
  { n: 1, title: '问小团原生界面', desc: '复刻流式分析+底部「现在就出发」', path: '/p1' },
  { n: 2, title: '身份信息',       desc: '人数 / 特殊人群 / 偏好',              path: '/p2' },
  { n: 3, title: '杂乱卡片勾选',   desc: '景点 / 美食 / 酒店三类',             path: '/p3' },
  { n: 4, title: '精细化重排',     desc: 'AI 重排 + 重新生成',                  path: '/p4' },
  { n: 5, title: '行程预览（可截图）', desc: '不下单也能看，截图保存',          path: '/p5' },
  { n: 6, title: '一键下单',       desc: '人数预填 + 支付',                     path: '/p6' },
];

const POST_FEATURES = [
  {
    title: '动态看板', path: '/p7',
    desc: '地图沉浸式 + 时间轴 + 完成 check + 段间打车 + 大众点评浮窗 + 附近推荐 + 二次消费',
  },
  {
    title: '地图路线', path: '/p8',
    desc: 'SVG 路线 + 实时定位推断 + 券码核销兜底',
  },
  {
    title: '行程总结（ins 风）', path: '/summary',
    desc: '4 章节回顾 + 城市地图 + 高光时刻 + 一键分享朋友圈',
  },
];

export default function Overview() {
  const { scene, setScene } = useApp();
  const nav = useNavigate();
  const current = SCENES.find((s) => s.key === scene)!;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(1200px 600px at 20% 10%, #2f3540 0%, #1a1c22 60%)',
        color: '#fff',
        padding: '40px 36px 80px',
      }}
    >
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        {/* Header row */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 28, gap: 16, flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 56, height: 56, borderRadius: 16,
                background: 'var(--go-grad)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, fontWeight: 800, color: '#fff',
                boxShadow: '0 10px 28px rgba(124,58,237,.45)',
              }}
            >
              go
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 800 }}>现在就出发 · 小go</div>
              <div style={{ fontSize: 13, color: '#a8acb6', marginTop: 4, lineHeight: 1.5 }}>
                美团 App · 接续问小团 · LLM × POI × UGC × 偏好 · 双场景演示
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              { to: '/flow',   label: '📊 流程图' },
              { to: '/kevin',  label: '👤 用户画像' },
              { to: '/review', label: '📝 评审' },
            ].map((i) => (
              <Link
                key={i.to}
                to={i.to}
                style={{
                  padding: '10px 16px', borderRadius: 12,
                  background: 'rgba(255,255,255,.06)',
                  border: '1px solid rgba(255,255,255,.12)',
                  color: '#fff', fontSize: 12.5, fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                {i.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Two scene cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
            gap: 16,
            marginBottom: 22,
          }}
        >
          {SCENES.map((s) => {
            const active = scene === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setScene(s.key)}
                style={{
                  textAlign: 'left',
                  padding: 22, borderRadius: 18,
                  background: 'rgba(255,255,255,.04)',
                  border: active ? `2px solid ${s.accent}` : '2px solid rgba(255,255,255,.08)',
                  position: 'relative',
                  color: '#fff',
                  transition: 'border .2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      padding: '5px 12px', borderRadius: 8, fontSize: 11.5, fontWeight: 700,
                      background: s.badgeBg, color: '#fff',
                    }}
                  >
                    {s.badge}
                  </span>
                  {active && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#60a5fa', fontWeight: 600 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#60a5fa' }} />
                      当前
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 14, fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{s.emoji}</span>
                  <span>{s.title}</span>
                </div>
                <div style={{ fontSize: 13, color: '#a8acb6', marginTop: 4 }}>{s.route}</div>
                <div
                  style={{
                    marginTop: 12, padding: '10px 12px', borderRadius: 10,
                    background: 'rgba(255,255,255,.06)', fontSize: 13, color: '#d4d7dd',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <span style={{ fontSize: 13 }}>💬</span>
                  <span>{s.quote}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  {s.tags.map((t) => (
                    <span
                      key={t}
                      style={{
                        padding: '4px 10px', borderRadius: 4,
                        background: 'rgba(255,255,255,.08)',
                        fontSize: 11.5, fontWeight: 600, color: '#d4d7dd',
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <div style={{ marginTop: 12, fontSize: 12.5, color: '#a8acb6', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#a78bfa' }}>💎</span>
                  <span>特色 ·</span>
                  <span>{s.feature.emoji}</span>
                  <span>{s.feature.label}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Big start CTA */}
        <button
          onClick={() => nav('/p1')}
          style={{
            width: '100%',
            background: 'linear-gradient(90deg,#ffd84a,#f5b800)',
            color: '#1a1a1a',
            padding: '20px 24px', borderRadius: 16,
            fontSize: 17, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: '0 12px 32px rgba(245,184,0,.4)',
            marginBottom: 36,
          }}
        >
          <span style={{ fontSize: 14 }}>▶</span>
          开始演示当前场景：{current.title}
        </button>

        {/* Main 6 steps */}
        <SectionLabel>下单前主线（6 步）</SectionLabel>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: 10, marginBottom: 34,
          }}
        >
          {MAIN_STEPS.map((s) => (
            <Link
              key={s.n}
              to={s.path}
              style={{
                background: 'rgba(255,255,255,.04)',
                border: '1px solid rgba(255,255,255,.08)',
                borderTop: '3px solid #f5b800',
                borderRadius: '0 0 12px 12px',
                padding: '14px 12px 16px',
                color: '#fff', textDecoration: 'none',
                display: 'block',
              }}
            >
              <div style={{ fontSize: 10.5, color: '#a8acb6', fontWeight: 600 }}>Step {s.n}</div>
              <div style={{ fontSize: 14, fontWeight: 800, marginTop: 4 }}>{s.title}</div>
              <div style={{ fontSize: 11.5, color: '#a8acb6', marginTop: 6, lineHeight: 1.5 }}>{s.desc}</div>
            </Link>
          ))}
        </div>

        {/* Post-payment features */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <SectionLabel inline>下单后特色功能（V5 重点）</SectionLabel>
          <span
            style={{
              padding: '4px 10px', borderRadius: 999,
              background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.3)',
              fontSize: 11.5, color: '#34d399', fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            🔓 走完主线后解锁
          </span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 10, marginBottom: 36,
          }}
        >
          {POST_FEATURES.map((f) => (
            <Link
              key={f.path}
              to={f.path}
              style={{
                padding: 16, borderRadius: 12,
                background: 'rgba(255,255,255,.04)',
                border: '1px dashed rgba(255,255,255,.15)',
                color: '#fff', textDecoration: 'none', display: 'block',
              }}
            >
              <div style={{ fontSize: 10.5, color: '#a8acb6', fontWeight: 600 }}>下单后专享</div>
              <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>{f.title}</div>
              <div style={{ fontSize: 12, color: '#a8acb6', marginTop: 8, lineHeight: 1.65 }}>{f.desc}</div>
            </Link>
          ))}
        </div>

        {/* Full demo path */}
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>📍 完整演示路径</div>
        <div
          style={{
            padding: 16, borderRadius: 12,
            background: 'rgba(255,255,255,.03)',
            border: '1px solid rgba(255,255,255,.08)',
            fontSize: 12.5, color: '#c8ccd2', lineHeight: 1.9,
          }}
        >
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: '#f5b800', fontWeight: 700 }}>当前场景：</span>
            {current.title}
          </div>
          <div>
            <span style={{ color: '#f5b800', fontWeight: 700 }}>下单前 → </span>
            1) 问小团界面 → 2) 身份信息 → 3) 卡片勾选 → 4) 精细化重排 → 5) 行程预览（可截图）→ 6) 一键下单 → 支付成功
          </div>
          <div style={{ marginTop: 4 }}>
            <span style={{ color: '#34d399', fontWeight: 700 }}>下单后 → </span>
            7) 动态看板（带：天气 / 穿衣 / 运势 · 时间轴 + check · 段间一键打车 · 大众点评浮窗 · 附近推荐 · 得闲饮茶 二次消费）→ 8) 地图路线（实时定位 / 券码核销兜底）
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 12,
        fontSize: 12.5, color: '#a8acb6', fontWeight: 600,
        marginBottom: inline ? 0 : 12, letterSpacing: '.03em',
      }}
    >
      <span style={{ width: 28, height: 1, background: 'rgba(255,255,255,.2)' }} />
      <span>──</span>
      <span>{children}</span>
      <span>──</span>
      <span style={{ width: 28, height: 1, background: 'rgba(255,255,255,.2)' }} />
    </div>
  );
}
