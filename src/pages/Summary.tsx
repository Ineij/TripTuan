import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileFrame } from '../components/MobileFrame';
import { StatusBar } from '../components/StatusBar';
import { GoMark } from '../components/Atoms';
import { Photo } from '../components/Photo';
import { useApp } from '../store';
import type { Scene } from '../types';

interface SummaryData {
  city: string;
  date: string;
  title: string;
  subtitle: string;
  closing: string;
  distance: string;
  coverSeed: string;
  gradient: string;
  routeStops: string[];
  places: Array<{ name: string; rating: string; cat: string; seed: string }>;
  memory: string;
}

const DATA: Record<Scene, SummaryData> = {
  hk: {
    city: '香港',
    date: '2026年5月23日',
    title: '你在香港开启了\n本次说走就走的旅程',
    subtitle: '说走就走，是这个夏天最棒的决定',
    closing: '山河辽阔\n脚步不停',
    distance: '8.4',
    coverSeed: 'victoria-harbour',
    gradient: 'linear-gradient(155deg,#ff7a1a 0%,#d91f38 52%,#3a1b63 100%)',
    routeStops: ['西九龙', '维港', '海港城', '澳牛', '太平山顶', '兰芳园', '星光大道', '镛记烧鹅', '文华东方'],
    places: [
      { name: '维多利亚港', rating: '4.7', cat: '景点', seed: 'victoria-harbour' },
      { name: '太平山顶', rating: '4.8', cat: '景点', seed: 'victoria-peak' },
      { name: '兰芳园', rating: '4.5', cat: '美食', seed: 'aussie-dairy' },
      { name: '星光大道', rating: '4.6', cat: '景点', seed: 'avenue-of-stars' },
    ],
    memory: '在维港的夜色里，把城市的喧嚣，留给了远方',
  },
  bj: {
    city: '北京',
    date: '2026年5月23日',
    title: '你在北京走进了\n一家人的文化旅程',
    subtitle: '慢一点走，回忆反而更清楚',
    closing: '胡同灯火\n一家同行',
    distance: '10.2',
    coverSeed: 'bj-tiananmen',
    gradient: 'linear-gradient(155deg,#f43f2e 0%,#f59e0b 45%,#102a43 100%)',
    routeStops: ['北京南站', '天安门', '故宫', '全聚德', '颐和园', '王府井', '什刹海', '希尔顿'],
    places: [
      { name: '天安门广场', rating: '4.9', cat: '景点', seed: 'bj-tiananmen' },
      { name: '故宫博物院', rating: '4.8', cat: '景点', seed: 'bj-forbidden-city' },
      { name: '颐和园', rating: '4.7', cat: '景点', seed: 'bj-summer-palace' },
      { name: '全聚德烤鸭', rating: '4.5', cat: '美食', seed: 'bj-roast-duck' },
    ],
    memory: '从中轴线到胡同夜色，最好的一站，是大家都还愿意多走几步',
  },
};

export default function Summary() {
  const nav = useNavigate();
  const { scene } = useApp();
  const data = DATA[scene];
  const [page, setPage] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const pages = [
    <CoverSlide data={data} />,
    <RouteSlide data={data} />,
    <PlacesSlide data={data} />,
    <FinalSlide data={data} />,
  ];
  const isLast = page === pages.length - 1;

  return (
    <MobileFrame>
      <div style={{ height: '100%', background: '#070912', color: '#fff', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
        <StatusBar bg="#070912" color="#fff" />
        <div style={{ height: 58, display: 'flex', alignItems: 'center', padding: '0 22px', gap: 10, flexShrink: 0 }}>
          <button onClick={() => nav('/p8')} style={topCircleStyle}>‹</button>
          <div style={{ flex: 1 }} />
          <button onClick={() => setShareOpen(true)} style={topCircleStyle}>♡</button>
          <button onClick={() => setShareOpen(true)} style={topCircleStyle}>↗</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {pages[page]}
        </div>

        <div style={{ flexShrink: 0, padding: '10px 24px 22px', background: 'linear-gradient(180deg,rgba(7,9,18,0),#070912 22%)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginBottom: 12 }}>
            {pages.map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                style={{
                  width: i === page ? 24 : 8,
                  height: 5,
                  borderRadius: 999,
                  background: i === page ? '#fff' : 'rgba(255,255,255,.35)',
                  transition: 'all .2s',
                }}
              />
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 10 }}>
            <button
              disabled={page === 0}
              onClick={() => setPage((v) => Math.max(0, v - 1))}
              style={{ ...footerBtnStyle, opacity: page === 0 ? 0.45 : 1, background: 'rgba(255,255,255,.1)', color: '#fff', border: '1px solid rgba(255,255,255,.18)' }}
            >
              ‹ 上一章
            </button>
            <button
              onClick={() => (isLast ? setShareOpen(true) : setPage((v) => Math.min(pages.length - 1, v + 1)))}
              style={{ ...footerBtnStyle, background: 'linear-gradient(135deg,#ffd84a,#f5a800)', color: '#111' }}
            >
              {isLast ? '📸 保存 / 分享' : '下一章 ›'}
            </button>
          </div>
        </div>

        {shareOpen && <ShareModal data={data} onClose={() => setShareOpen(false)} />}
      </div>
    </MobileFrame>
  );
}

function CoverSlide({ data }: { data: SummaryData }) {
  return (
    <section style={{ height: '100%', padding: '58px 36px 24px', background: data.gradient }}>
      <div style={chapterStyle}>——— CHAPTER 01 ———</div>
      <div style={{ marginTop: 26, fontSize: 20, fontWeight: 700 }}>{data.date}</div>
      <h1 style={{ whiteSpace: 'pre-line', margin: '28px 0 0', fontSize: 34, lineHeight: 1.26, letterSpacing: 0, fontWeight: 950 }}>
        {data.title}
      </h1>
      <div style={{ display: 'flex', gap: 28, alignItems: 'baseline', marginTop: 40 }}>
        <Metric value="2" label="天" />
        <Metric value={String(data.routeStops.length)} label="个目的地" />
        <Metric value="100%" label="完成度" />
      </div>
      <div style={{ marginTop: 42, fontSize: 19, lineHeight: 1.9, fontWeight: 800 }}>
        {data.subtitle}
      </div>
    </section>
  );
}

function RouteSlide({ data }: { data: SummaryData }) {
  const points = data.routeStops.map((name, i) => ({
    name,
    x: 16 + (i % 4) * 23,
    y: 36 + Math.floor(i / 4) * 19 + (i % 2) * 3,
  }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <section style={{ height: '100%', padding: '34px 28px 22px', background: 'linear-gradient(180deg,#0b3550,#081024)' }}>
      <div style={chapterStyle}>——— CHAPTER 02 ———</div>
      <h1 style={{ margin: '24px 0 22px', fontSize: 31, lineHeight: 1.28, fontWeight: 950 }}>
        你的足迹覆盖了<br />
        <span style={{ color: '#7dd3fc' }}>{data.places.length}</span> 个景点 · <span style={{ color: '#ffd84a' }}>{Math.max(3, data.routeStops.length - data.places.length)}</span> 家美食
      </h1>
      <div style={{ borderRadius: 18, padding: 16, background: 'rgba(78,169,217,.22)', border: '1px solid rgba(125,211,252,.22)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.04)' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, background: 'rgba(255,255,255,.14)', fontWeight: 800, fontSize: 13 }}>📍 {data.city}</div>
        <svg viewBox="0 0 100 100" width="100%" height="270" style={{ marginTop: 8 }}>
          <path d="M 12 28 L 28 18 L 42 22 L 57 14 L 76 26 L 88 42 L 92 61 L 83 82 L 62 92 L 39 88 L 18 74 L 10 58 Z" fill="rgba(125,211,252,.22)" stroke="#7dd3fc" strokeWidth="1" strokeDasharray="1.4 1.6" />
          <path d={path} fill="none" stroke="#ffd84a" strokeWidth="1.4" strokeDasharray="2 2" />
          {points.map((p, i) => (
            <g key={p.name}>
              <circle cx={p.x} cy={p.y} r="4.7" fill="rgba(255,255,255,.25)" />
              <circle cx={p.x} cy={p.y} r="2.5" fill="#ffd84a" stroke="#fff" strokeWidth="1" />
              <text x={p.x} y={p.y + 9} fontSize="3.2" textAnchor="middle" fill="#fff" fontWeight="700">{p.name}</text>
              {i === points.length - 1 && <text x={p.x + 8} y={p.y + 16} fontSize="5" fill="#ffd84a" fontWeight="900">{data.distance} km</text>}
            </g>
          ))}
        </svg>
      </div>
      <div style={{ marginTop: 26, fontSize: 20, lineHeight: 1.8, fontWeight: 850 }}>
        脚下的路<br />就是你最值得收藏的回忆
      </div>
    </section>
  );
}

function PlacesSlide({ data }: { data: SummaryData }) {
  return (
    <section style={{ height: '100%', padding: '34px 28px 22px', background: 'linear-gradient(155deg,#4c1d95,#7e1f86 58%,#35216c)' }}>
      <div style={chapterStyle}>——— CHAPTER 03 ———</div>
      <h1 style={{ margin: '24px 0 24px', fontSize: 30, lineHeight: 1.32, fontWeight: 950 }}>
        这些点位<br />构成了你的<span style={{ color: '#ffd84a' }}>专属时刻</span>
      </h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {data.places.map((place, i) => (
          <Photo key={place.name} seed={place.seed} height={142} radius={12}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.72))' }} />
            <div style={{ position: 'absolute', top: 12, left: 12, fontSize: 24, fontWeight: 950 }}>{String(i + 1).padStart(2, '0')}</div>
            <div style={{ position: 'absolute', left: 12, right: 10, bottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 900 }}>{place.name}</div>
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.86 }}>★ {place.rating} · {place.cat}</div>
            </div>
          </Photo>
        ))}
      </div>
      <div style={{ marginTop: 24, padding: 18, borderRadius: 16, border: '1px solid rgba(255,216,74,.32)', background: 'rgba(255,255,255,.08)', fontSize: 17, lineHeight: 1.85, fontWeight: 800 }}>
        <span style={{ display: 'block', fontSize: 18, marginBottom: 8 }}>🌃</span>
        {data.memory.split('，')[0]}，<br />
        <span style={{ color: '#ffd84a' }}>{data.memory.split('，')[1] ?? '也把今天留给了自己'}</span>
      </div>
    </section>
  );
}

function FinalSlide({ data }: { data: SummaryData }) {
  return (
    <section style={{ height: '100%', padding: '34px 28px 22px', background: 'linear-gradient(160deg,#4b2440,#a54e22 58%,#f5a800)' }}>
      <div style={chapterStyle}>——— 完美收官 ———</div>
      <h1 style={{ whiteSpace: 'pre-line', margin: '28px 0 28px', fontSize: 34, lineHeight: 1.22, fontWeight: 950 }}>
        {data.closing}
      </h1>
      <div style={{ borderRadius: 18, padding: 18, border: '1px solid rgba(255,255,255,.28)', background: 'rgba(255,255,255,.09)' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <GoMark size={54} />
          <div>
            <div style={{ fontSize: 19, fontWeight: 950 }}>现在就出发 · 小go</div>
            <div style={{ marginTop: 5, opacity: 0.8, fontSize: 13 }}>为你智能定制的 2 天 1 晚</div>
          </div>
        </div>
        <div style={{ height: 1, background: 'rgba(255,255,255,.2)', margin: '18px 0' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', textAlign: 'center' }}>
          <Metric value="2" label="天" />
          <Metric value={String(data.routeStops.length)} label="站" />
          <Metric value={data.distance} label="km" />
        </div>
        <div style={{ margin: '22px auto 0', width: 118, height: 118, borderRadius: 14, background: 'repeating-linear-gradient(90deg,#111 0 3px,#fff 3px 6px)', border: '8px solid #fff', boxShadow: '0 14px 30px rgba(0,0,0,.28)' }} />
      </div>
      <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 13, fontWeight: 900 }}>
        <span style={{ padding: '8px 16px', borderRadius: 8, background: '#ffd84a', color: '#111' }}>美团</span>
        <span>×</span>
        <span style={{ padding: '8px 16px', borderRadius: 8, background: '#8b5cf6' }}>小go</span>
        <span>· 现在就出发</span>
      </div>
    </section>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <span style={{ fontSize: 36, fontWeight: 950 }}>{value}</span>
      <span style={{ marginLeft: 5, fontSize: 15, fontWeight: 800 }}>{label}</span>
    </div>
  );
}

function ShareModal({ data, onClose }: { data: SummaryData; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.58)', backdropFilter: 'blur(8px)', zIndex: 40, display: 'flex', alignItems: 'flex-end', animation: 'overlayFade .2s ease' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', background: '#fff', color: '#111', borderRadius: '24px 24px 0 0', padding: '24px 18px 24px', animation: 'sheetUp .24s ease' }}>
        <div style={{ textAlign: 'center', fontSize: 20, fontWeight: 950 }}>分享我的旅程</div>
        <div style={{ textAlign: 'center', color: '#8b8f99', marginTop: 8, fontSize: 13 }}>选择保存到相册 · 或一键转发</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginTop: 24 }}>
          {[
            ['📷', '保存到相册', `高清 ${data.places.length} 张图`],
            ['🟢', '朋友圈', '微信转发'],
            ['💬', '微信好友', '发给朋友'],
            ['🔗', '复制链接', '生成专属链接'],
          ].map(([icon, title, sub]) => (
            <button key={title} style={{ minHeight: 96, borderRadius: 14, background: '#f7f8fa', border: '1px solid #eceef2', padding: 8 }}>
              <span style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, margin: '0 auto 8px', borderRadius: 12, background: '#fff', fontSize: 22 }}>{icon}</span>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 900 }}>{title}</span>
              <span style={{ display: 'block', marginTop: 5, color: '#9aa0aa', fontSize: 11 }}>{sub}</span>
            </button>
          ))}
        </div>
        <button onClick={onClose} style={{ marginTop: 18, height: 48, width: '100%', borderRadius: 14, background: '#f0f1f4', fontWeight: 900 }}>取消</button>
      </div>
    </div>
  );
}

const chapterStyle = {
  textAlign: 'center' as const,
  letterSpacing: '8px',
  fontSize: 15,
  fontWeight: 900,
  color: 'rgba(255,255,255,.68)',
};

const topCircleStyle = {
  width: 36,
  height: 36,
  borderRadius: '50%',
  background: 'rgba(0,0,0,.25)',
  border: '1px solid rgba(255,255,255,.18)',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 22,
  fontWeight: 900,
};

const footerBtnStyle = {
  height: 54,
  borderRadius: 15,
  fontSize: 16,
  fontWeight: 950,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
