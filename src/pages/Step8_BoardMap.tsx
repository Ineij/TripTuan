import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileFrame } from '../components/MobileFrame';
import { StatusBar } from '../components/StatusBar';
import { GoMark } from '../components/Atoms';
import { useApp } from '../store';
import type { Scene } from '../types';

interface Station {
  id: string;
  name: string;
  cat: '景点' | '美食' | '酒店' | '交通';
  rating: number;
  walk: string;
  // Position on 100x100 viewBox
  x: number; y: number;
  done?: boolean;
}

const STATIONS_BY_SCENE: Record<Scene, Record<'总览' | 'Day 1' | 'Day 2', Station[]>> = {
  hk: {
    'Day 1': [
      { id: 'hk1', name: '西九龙站', cat: '交通', rating: 4.8, walk: '已到达', x: 24, y: 54, done: true },
      { id: 'hk2', name: '尖沙咀海港城', cat: '景点', rating: 4.6, walk: '步行 450m', x: 36, y: 56 },
      { id: 'hk3', name: '澳洲牛奶公司', cat: '美食', rating: 4.6, walk: '佐敦方向', x: 34, y: 67 },
      { id: 'hk4', name: '维多利亚港', cat: '景点', rating: 4.7, walk: '我在这里', x: 48, y: 54 },
      { id: 'hk5', name: '星光大道', cat: '景点', rating: 4.6, walk: '沿海边走', x: 58, y: 52 },
      { id: 'hk6', name: '香港君怡酒店', cat: '酒店', rating: 4.8, walk: '今晚入住', x: 39, y: 70 },
    ],
    'Day 2': [
      { id: 'hk7', name: '香港君怡酒店', cat: '酒店', rating: 4.8, walk: '出发点', x: 39, y: 70, done: true },
      { id: 'hk8', name: '太平山顶', cat: '景点', rating: 4.8, walk: '打车 22min', x: 70, y: 38 },
      { id: 'hk9', name: '兰芳园中环', cat: '美食', rating: 4.5, walk: '下山顺路', x: 66, y: 56 },
      { id: 'hk10', name: '西九龙返程', cat: '交通', rating: 4.8, walk: 'G6534', x: 24, y: 54 },
    ],
    '总览': [],
  },
  bj: {
    'Day 1': [
      { id: 'bj1', name: '北京南站', cat: '交通', rating: 4.8, walk: '已到达', x: 50, y: 86, done: true },
      { id: 'bj2', name: '天安门广场', cat: '景点', rating: 4.9, walk: '打车 18min', x: 49, y: 56 },
      { id: 'bj3', name: '故宫博物院', cat: '景点', rating: 4.8, walk: '步行 600m', x: 49, y: 45 },
      { id: 'bj4', name: '四季民福烤鸭', cat: '美食', rating: 4.7, walk: '王府井店', x: 60, y: 54 },
      { id: 'bj5', name: '王府井步行街', cat: '景点', rating: 4.5, walk: '步行 300m', x: 64, y: 58 },
      { id: 'bj6', name: '王府井希尔顿', cat: '酒店', rating: 4.8, walk: '今晚入住', x: 66, y: 63 },
    ],
    'Day 2': [
      { id: 'bj7', name: '王府井希尔顿', cat: '酒店', rating: 4.8, walk: '出发点', x: 66, y: 63, done: true },
      { id: 'bj8', name: '颐和园泛舟', cat: '景点', rating: 4.7, walk: '打车 36min', x: 26, y: 28 },
      { id: 'bj9', name: '护国寺小吃', cat: '美食', rating: 4.5, walk: '顺路午餐', x: 43, y: 43 },
      { id: 'bj10', name: '什刹海', cat: '景点', rating: 4.4, walk: '步行 900m', x: 47, y: 39 },
      { id: 'bj11', name: '北京南返程', cat: '交通', rating: 4.8, walk: 'G672', x: 50, y: 86 },
    ],
    '总览': [],
  },
};
STATIONS_BY_SCENE.hk['总览'] = [...STATIONS_BY_SCENE.hk['Day 1'], ...STATIONS_BY_SCENE.hk['Day 2'].slice(1)];
STATIONS_BY_SCENE.bj['总览'] = [...STATIONS_BY_SCENE.bj['Day 1'], ...STATIONS_BY_SCENE.bj['Day 2'].slice(1)];

const catColor: Record<Station['cat'], string> = {
  景点: '#3b82f6', 美食: '#fb923c', 酒店: '#8b5cf6', 交通: '#10b981',
};
const catEmoji: Record<Station['cat'], string> = {
  景点: '📍', 美食: '🍜', 酒店: '🏨', 交通: '🚄',
};

export default function Step8_BoardMap() {
  const nav = useNavigate();
  const { scene } = useApp();
  const [tab, setTab] = useState<'总览' | 'Day 1' | 'Day 2'>('总览');
  const stations = STATIONS_BY_SCENE[scene][tab];
  const [active, setActive] = useState<string>(stations[2]?.id ?? stations[0].id);
  const cur = stations.find((s) => s.id === active) ?? stations[0];

  // Route path connecting stations in order
  const pathD = stations.map((s, i) => `${i === 0 ? 'M' : 'L'} ${s.x} ${s.y}`).join(' ');
  const doneIdx = Math.max(0, stations.findIndex((s) => s.id === active));
  const doneD = stations.slice(0, doneIdx + 1).map((s, i) => `${i === 0 ? 'M' : 'L'} ${s.x} ${s.y}`).join(' ');

  return (
    <MobileFrame>
      <StatusBar bg="#fff" />
      {/* Header */}
      <div
        style={{
          height: 50, display: 'flex', alignItems: 'center', padding: '0 14px',
          background: '#fff', flexShrink: 0, borderBottom: '1px solid var(--mt-line)', gap: 8,
        }}
      >
        <button
          onClick={() => nav('/p7')}
          style={{
            width: 32, height: 32, borderRadius: '50%', background: '#f5f6f8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, color: '#1a1a1a',
          }}
        >
          ‹
        </button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 700 }}>
          🗺️ {scene === 'bj' ? '北京' : '香港'}地图路线
        </div>
        <button
          style={{
            width: 32, height: 32, borderRadius: '50%', background: '#f5f6f8',
            fontSize: 14,
          }}
        >
          ⤢
        </button>
      </div>

      <div className="scroll-area" style={{ padding: 0, background: '#fff' }}>
        {/* Full-screen map */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 14px', background: '#fff', borderBottom: '1px solid var(--mt-line-2)' }}>
          {(['总览', 'Day 1', 'Day 2'] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setActive(STATIONS_BY_SCENE[scene][t][0].id);
              }}
              style={{ flex: 1, height: 34, borderRadius: 999, background: tab === t ? '#1a1a1a' : 'var(--mt-bg)', color: tab === t ? '#fff' : 'var(--mt-text-2)', fontSize: 12.5, fontWeight: 800 }}
            >
              {t}
            </button>
          ))}
        </div>
        <div
          style={{
            position: 'relative',
            height: 480,
            background: 'linear-gradient(180deg,#f5f9fc 0%,#e8f0f5 100%)',
            overflow: 'hidden',
          }}
        >
          <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="none">
            <defs>
              <pattern id="map-grid" width="6" height="6" patternUnits="userSpaceOnUse">
                <path d="M 6 0 L 0 0 0 6" fill="none" stroke="#fff" strokeWidth="0.3" />
              </pattern>
              <linearGradient id="route" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#7c3aed" />
                <stop offset="100%" stopColor="#60a5fa" />
              </linearGradient>
            </defs>
            <rect width="100" height="100" fill="url(#map-grid)" />

            {/* Faux roads */}
            <path d="M 0 60 Q 50 50 100 50" stroke="#fff" strokeWidth="1.2" opacity="0.9" />
            <path d="M 25 0 L 30 100" stroke="#fff" strokeWidth="0.9" opacity="0.9" />
            <path d="M 60 0 L 65 100" stroke="#fff" strokeWidth="0.9" opacity="0.9" />
            <path d="M 0 30 L 100 25" stroke="#fff" strokeWidth="0.6" opacity="0.8" />

            {/* Full route — dashed */}
            <path d={pathD} stroke="rgba(124,58,237,.3)" strokeWidth="0.8" strokeDasharray="1.2 1.2" fill="none" />
            {/* Completed route — solid */}
            <path d={doneD} stroke="url(#route)" strokeWidth="1.4" strokeLinecap="round" fill="none" />

            {/* District labels */}
            <text x="14" y="68" fontSize="3" fill="#9aa5b1" fontWeight="600">上环</text>
            <text x="46" y="76" fontSize="3" fill="#9aa5b1" fontWeight="600">湾仔</text>
            <text x="78" y="60" fontSize="3" fill="#9aa5b1" fontWeight="600">铜锣湾</text>

            {/* Station points */}
            {stations.map((s, i) => {
              const done = i < doneIdx;
              const isActive = s.id === active;
              return (
                <g key={s.id}>
                  {isActive && (
                    <circle cx={s.x} cy={s.y} r="4" fill={catColor[s.cat]} opacity="0.25">
                      <animate attributeName="r" values="3;6;3" dur="1.6s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.4;0;0.4" dur="1.6s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle
                    cx={s.x} cy={s.y} r={isActive ? 2.6 : 2}
                    fill={done ? '#10b981' : isActive ? catColor[s.cat] : '#fff'}
                    stroke={done ? '#10b981' : catColor[s.cat]}
                    strokeWidth="0.7"
                    onClick={() => setActive(s.id)}
                    style={{ cursor: 'pointer' }}
                  />
                </g>
              );
            })}
          </svg>

          {/* Top-left mini legend */}
          <div
            style={{
              position: 'absolute', top: 12, left: 12,
              padding: '7px 12px', borderRadius: 999,
              background: 'rgba(255,255,255,.94)',
              fontSize: 11, fontWeight: 600,
              boxShadow: 'var(--shadow-1)',
              display: 'flex', gap: 12,
            }}
          >
            <LegendItem color="#10b981" label="已完成" />
            <LegendItem color={catColor[cur.cat]} label="当前" />
            <LegendItem color="#fff" border="#3b82f6" label="待访" />
          </div>

          {/* "我在" current bubble — positioned at active station */}
          <div
            style={{
              position: 'absolute',
              left: `${cur.x}%`, top: `${cur.y}%`,
              transform: 'translate(-50%, -120%)',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                padding: '5px 10px', borderRadius: 8,
                background: '#1a1a1a', color: '#fff',
                fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
                boxShadow: '0 4px 12px rgba(0,0,0,.3)',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399' }} />
              我在 · {cur.name}
            </div>
          </div>

          {/* Bottom-right zoom controls */}
          <div
            style={{
              position: 'absolute', right: 12, bottom: 80,
              background: '#fff', borderRadius: 8,
              boxShadow: 'var(--shadow-2)', overflow: 'hidden',
            }}
          >
            <button style={{ width: 32, height: 32, fontSize: 18, fontWeight: 700, color: '#1a1a1a', display: 'block', borderBottom: '1px solid var(--mt-line)' }}>+</button>
            <button style={{ width: 32, height: 32, fontSize: 18, fontWeight: 700, color: '#1a1a1a', display: 'block' }}>−</button>
          </div>
          <button
            style={{
              position: 'absolute', right: 12, bottom: 12,
              width: 36, height: 36, borderRadius: '50%',
              background: '#fff', boxShadow: 'var(--shadow-2)',
              fontSize: 14,
            }}
          >
            📍
          </button>
        </div>

        {/* Active station card */}
        <div style={{ padding: 14 }}>
          <div className="card fade-up" style={{ marginBottom: 12 }}>
            <div className="h-between">
              <div>
                <div className="text-tiny text-muted">实时定位 · 你正在</div>
                <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>{cur.name}</div>
              </div>
              <span
                style={{
                  padding: '4px 10px', borderRadius: 4,
                  background: catColor[cur.cat] + '22',
                  color: catColor[cur.cat], fontSize: 11.5, fontWeight: 800,
                }}
              >
                第 {doneIdx + 1} / {stations.length} 站
              </span>
            </div>
            <div className="hairline" />
            <div className="text-small" style={{ color: 'var(--mt-text-2)', lineHeight: 1.7 }}>
              当前站点已同步到行程看板，可在下方切换站点查看完整路线。
            </div>
          </div>

          {/* Next segment */}
          {stations[doneIdx + 1] && (
            <div
              className="card"
              style={{ background: 'linear-gradient(135deg,#fff8d6,#ffe7a3)', marginBottom: 12 }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>🚕 下一段建议</div>
              <div className="text-small text-muted" style={{ marginBottom: 10, lineHeight: 1.6 }}>
                {cur.name} → {stations[doneIdx + 1].name}，约 {scene === 'bj' ? '4.2' : '1.8'} km，打车约 ¥{scene === 'bj' ? '42' : '28'}
              </div>
              <button
                className="btn-go"
                style={{ width: '100%', height: 36 }}
                onClick={() => setActive(stations[doneIdx + 1].id)}
              >
                🚕 一键打车
              </button>
            </div>
          )}

          {/* Stations list */}
          <div className="section-title">
            <span>📋 所有站点</span>
            <span className="text-tiny text-muted" style={{ marginLeft: 'auto', fontWeight: 400 }}>
              点击可在地图上定位
            </span>
          </div>
          <div className="card" style={{ padding: 0 }}>
            {stations.map((s, i) => {
              const done = i < doneIdx;
              const isActive = s.id === active;
              return (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  style={{
                    display: 'flex', width: '100%', alignItems: 'center', gap: 12,
                    padding: '12px 14px', textAlign: 'left',
                    background: isActive ? 'var(--mt-yellow-soft)' : '#fff',
                    borderBottom: i < stations.length - 1 ? '1px solid var(--mt-line-2)' : 'none',
                  }}
                >
                  <div
                    style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: done ? 'var(--mt-green)' : isActive ? catColor[s.cat] : '#fff',
                      border: '2px solid ' + (done ? 'var(--mt-green)' : catColor[s.cat]),
                      color: done || isActive ? '#fff' : catColor[s.cat],
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 800,
                    }}
                  >
                    {done ? '✓' : catEmoji[s.cat]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{s.name}</div>
                    <div className="text-tiny text-muted" style={{ marginTop: 2 }}>
                      {s.cat} · ★ {s.rating} · {s.walk}
                    </div>
                  </div>
                  {isActive && <GoMark size={20} />}
                </button>
              );
            })}
          </div>

          <button
            className="btn-ghost"
            style={{ width: '100%', marginTop: 14 }}
            onClick={() => nav('/summary')}
          >
            🎉 行程结束 · 查看总结
          </button>
        </div>
      </div>
    </MobileFrame>
  );
}

function LegendItem({ color, border, label }: { color: string; border?: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span
        style={{
          width: 8, height: 8, borderRadius: '50%',
          background: color, border: border ? `1.5px solid ${border}` : 'none',
        }}
      />
      {label}
    </span>
  );
}
