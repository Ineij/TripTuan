import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';

interface FlowNode {
  id: number;
  icon: string;
  title: string;
  desc: string;
  page: string;
  pageLabel: string;
  detail: string;
  sources: string[];
}

const NODES: FlowNode[] = [
  {
    id: 1, icon: '💬', title: '用户输入目标',
    desc: '在「问小团」里用自然语言描述出行需求',
    page: '/p1', pageLabel: 'P0-01',
    detail: '「下周和爸妈、女儿想去香港玩两天，老人腿脚一般，预算 1 万出头」',
    sources: ['🤖 LLM 意图理解', '👤 用户偏好匹配'],
  },
  {
    id: 2, icon: '🔍', title: '多数据源融合检索',
    desc: 'LLM × POI × UGC × 偏好 四维驱动',
    page: '/p3', pageLabel: 'P0-02',
    detail: '从 50+ POI 中筛 12 个候选，综合人流 / 排队 / 距离 / 口碑',
    sources: ['📍 POI 实时数据', '📝 UGC 口碑', '🤖 LLM 推理'],
  },
  {
    id: 3, icon: '✅', title: '勾选确认 + 精细化重排',
    desc: '景点 / 美食 / 酒店 分组勾选 → AI 重排',
    page: '/p4', pageLabel: 'P0-03',
    detail: '按 8 种偏好（亲子/老人友好 / 慢节奏 / 高性价比 …）打分排序',
    sources: ['👤 偏好确认', '🤖 多目标打分'],
  },
  {
    id: 4, icon: '📋', title: '行程预览 + 一键下单',
    desc: '时间轴预览 → 门票/酒店/餐饮/交通 打包付款',
    page: '/p5', pageLabel: 'P0-04',
    detail: '24h 内可免费取消，统一发票，凭证短信下发',
    sources: ['🎫 美团门票', '🏨 美团酒店', '🚄 高铁/打车'],
  },
  {
    id: 5, icon: '📊', title: '动态看板自动生成',
    desc: '出发后自动从订单串联成可执行方案',
    page: '/p7', pageLabel: 'P0-05',
    detail: '时间轴 + check + 段间打车 + 大众点评浮窗 + 备忘录',
    sources: ['📍 POI 串联', '🤖 路线推理', '⏱️ 实时时序'],
  },
  {
    id: 6, icon: '🗺️', title: '时间轴 & 地图路线',
    desc: '多 POI 串联可视化，时空双维度查看',
    page: '/p8', pageLabel: 'P0-06',
    detail: 'SVG 路线 + 实时定位推断 + 券码核销兜底',
    sources: ['📍 地理数据', '📝 实时人流', '🎟️ 核销事件'],
  },
  {
    id: 7, icon: '✏️', title: '自然语言动态调整',
    desc: '旅中约束变化时实时重排',
    page: '/p7', pageLabel: 'P0-07',
    detail: '「换一个不用排队的」「我有点累」→ AI 自动重排',
    sources: ['🤖 LLM 调整', '📍 POI 备选', '📝 UGC 避坑'],
  },
  {
    id: 8, icon: '🎁', title: '总结回顾 + 二次消费',
    desc: '行程后自动生成长图 + 朋友圈分享 + 同行推荐',
    page: '/summary', pageLabel: 'P0-08',
    detail: '4 章节 + 高光时刻 + 城市地图 + 朋友圈一键分享',
    sources: ['📸 自动剪辑', '🤖 文案生成'],
  },
];

export default function Flow() {
  const nav = useNavigate();
  const [active, setActive] = useState<number | null>(null);
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(1000px 500px at 20% 10%, #2f3540 0%, #1a1c22 60%)',
        color: '#fff',
        padding: '50px 32px 80px',
      }}
    >
      <div style={{ maxWidth: 1320, margin: '0 auto' }}>
        <Link
          to="/"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            color: '#a8acb6', textDecoration: 'none', fontSize: 13, marginBottom: 20,
          }}
        >
          ‹ 返回总览
        </Link>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 8 }}>
          <div style={{ fontSize: 28, fontWeight: 800 }}>📊 产品流程图</div>
          <div style={{ fontSize: 12, color: '#6c707a' }}>问小团 → 小go · 全链路 8 节点</div>
        </div>
        <div style={{ fontSize: 13, color: '#a8acb6', marginBottom: 28, maxWidth: 800, lineHeight: 1.7 }}>
          从「自然语言对话」到「动态看板 + 二次消费」的完整产品闭环。
          每个节点都标注了数据源 / 对应页面 / 一个真实案例。点击节点跳到对应原型。
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          {[
            { c: '#7c3aed', l: '🤖 LLM 推理' },
            { c: '#3b82f6', l: '📍 POI 数据' },
            { c: '#f59e0b', l: '📝 UGC 口碑' },
            { c: '#10b981', l: '👤 用户偏好' },
            { c: '#ef4444', l: '🎟️ 核销事件' },
          ].map((g) => (
            <span
              key={g.l}
              style={{
                fontSize: 12, fontWeight: 600, color: '#d4d7dd',
                padding: '4px 10px', borderRadius: 999,
                background: 'rgba(255,255,255,.06)',
                border: `1px solid ${g.c}55`,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', background: g.c, marginRight: 6 }} />
              {g.l}
            </span>
          ))}
        </div>

        {/* Flow diagram */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {NODES.map((n) => {
            const isActive = active === n.id;
            return (
              <div
                key={n.id}
                onClick={() => setActive(isActive ? null : n.id)}
                onDoubleClick={() => nav(n.page)}
                style={{
                  position: 'relative',
                  padding: 18, borderRadius: 16,
                  background: isActive ? 'rgba(124,58,237,.15)' : 'rgba(255,255,255,.04)',
                  border: '1px solid ' + (isActive ? '#7c3aed' : 'rgba(255,255,255,.08)'),
                  cursor: 'pointer',
                  transition: 'all .2s',
                }}
              >
                {/* arrow to next */}
                {n.id < NODES.length && (
                  <span
                    style={{
                      position: 'absolute', right: -10, top: 30,
                      fontSize: 22, color: 'rgba(124,58,237,.4)', fontWeight: 800,
                      display: 'none',
                    }}
                  >
                    →
                  </span>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div
                    style={{
                      width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                      background: 'linear-gradient(135deg,#ffd84a,#f5b800)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 22,
                      boxShadow: '0 4px 12px rgba(245,184,0,.3)',
                    }}
                  >
                    {n.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, color: '#a8acb6', fontWeight: 600 }}>
                      Step {n.id} · {n.pageLabel}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{n.title}</div>
                  </div>
                </div>

                <div style={{ fontSize: 13, color: '#c8ccd2', lineHeight: 1.6, marginBottom: 10 }}>
                  {n.desc}
                </div>

                <div
                  style={{
                    padding: '8px 10px', borderRadius: 8,
                    background: 'rgba(0,0,0,.2)', borderLeft: '2px solid #7c3aed',
                    fontSize: 12, color: '#d4d7dd', fontStyle: 'italic',
                    lineHeight: 1.55, marginBottom: 10,
                  }}
                >
                  e.g. {n.detail}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {n.sources.map((s) => (
                    <span
                      key={s}
                      style={{
                        padding: '3px 8px', borderRadius: 4, fontSize: 10.5, fontWeight: 600,
                        background: 'rgba(124,58,237,.18)', color: '#a78bfa',
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>

                {isActive && (
                  <button
                    onClick={(e) => { e.stopPropagation(); nav(n.page); }}
                    style={{
                      marginTop: 12, width: '100%', padding: '8px 0', borderRadius: 8,
                      background: 'var(--go-grad)', color: '#fff', fontSize: 12.5, fontWeight: 700,
                    }}
                  >
                    打开 {n.page} →
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Data architecture footer */}
        <div
          style={{
            marginTop: 36, padding: 24, borderRadius: 16,
            background: 'rgba(255,255,255,.03)',
            border: '1px solid rgba(255,255,255,.08)',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>🏗️ 数据架构</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {[
              { icon: '🤖', t: 'LLM 层', sub: 'GPT-4 / Claude / 自研', desc: '意图理解 + 重排 + 调整指令' },
              { icon: '📍', t: 'POI 层', sub: '美团 50w+ POI', desc: '景点 / 美食 / 酒店 / 实时人流' },
              { icon: '📝', t: 'UGC 层', sub: '大众点评亿级评价', desc: '口碑 / 避坑 / 隐藏菜单' },
              { icon: '👤', t: '偏好层', sub: '美团账号画像', desc: '消费记录 / 点击偏好 / 同行属性' },
            ].map((b) => (
              <div key={b.t} style={{ padding: 14, borderRadius: 12, background: 'rgba(0,0,0,.2)' }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{b.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{b.t}</div>
                <div className="text-tiny" style={{ color: '#a8acb6', marginTop: 2 }}>{b.sub}</div>
                <div style={{ fontSize: 12, color: '#c8ccd2', marginTop: 8, lineHeight: 1.6 }}>{b.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
