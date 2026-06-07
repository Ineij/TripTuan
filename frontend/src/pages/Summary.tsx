import { useState, useEffect, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileFrame } from '../components/MobileFrame';
import { StatusBar } from '../components/StatusBar';
import { GoMark } from '../components/Atoms';
import { Photo } from '../components/Photo';
import { StreamingStatus } from '../components/StreamingStatus';
import { useApp } from '../store';
import type { Scene } from '../types';
import { getPreview } from '../api/itinerary';
import { getPickerItems } from '../api/pois';
import type { PreviewPayload } from '../api/itinerary';
import type { POIItem } from '../api/pois';

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
  places: Array<{ name: string; rating: string; cat: string; seed: string; imageUrl?: string; photo?: string }>;
  memory: string;
  keyword: string;
  keywordLine: string;
  persona: string;
  personaLine: string;
  highlightName: string;
  highlightLine: string;
  socialEnding: string;
  moodStats: Array<{ label: string; value: number; suffix: string }>;
}

/* ────────────────────────────────────────
   Scene-specific static copy
──────────────────────────────────────── */
const SCENE_COPY: Record<Scene, {
  gradient: string;
  closing: string;
  memory: string;
  coverSeed: string;
}> = {
  sz: {
    gradient: 'linear-gradient(155deg,#0d2a4a 0%,#1a5276 55%,#0a4030 100%)',
    closing: '深圳的光\n永远照耀\n我们的故事',
    memory: '穿越城市的风，把我们的足迹刻在了深圳',
    coverSeed: 'shenzhen-skyline',
  },
  bj: {
    gradient: 'linear-gradient(155deg,#1a0a2e 0%,#3d1442 55%,#2d1b00 100%)',
    closing: '北京的故事\n是我们最美的\n家庭记忆',
    memory: '在古都的街道上，我们留下了最珍贵的足迹',
    coverSeed: 'beijing-palace',
  },
};

const PREF_SUBTITLE: Record<string, string> = {
  打卡行: '拿起相机，把最美的瞬间定格',
  爱美食: '用舌尖丈量城市，吃遍每条街',
  文艺之旅: '在艺术与历史之间，感受城市温度',
  亲子友好: '和孩子一起，留下最珍贵的回忆',
  休闲度假: '放慢脚步，感受属于自己的自由',
  探索自然: '走进自然，找回最纯粹的惊喜',
};

function buildSummary(
  preview: PreviewPayload,
  ratingMap: Record<string, number>,
  poiMap: Record<string, POIItem>,
  prefs: string[],
  startDate: string,
  scene: Scene,
): SummaryData {
  const city = scene === 'bj' ? '北京' : '深圳';
  const sc = SCENE_COPY[scene] ?? SCENE_COPY.sz;

  // Collect all non-transport, non-hotel items
  const allItems: Array<{ name: string; cat: string }> = [];
  for (const day of preview.days) {
    for (const item of day.items) {
      if (item.cat !== '交通' && item.cat !== '酒店') {
        allItems.push({ name: item.name, cat: item.cat });
      }
    }
  }
  if (allItems.length === 0) {
    const fallbackPois = Object.values(poiMap)
      .filter((item) => item.cat === 'sight' || item.cat === 'food')
      .sort((a, b) => Number(Boolean(b.preselect)) - Number(Boolean(a.preselect)))
      .slice(0, 6);
    for (const item of fallbackPois) {
      allItems.push({ name: item.name, cat: item.cat === 'sight' ? '景点' : '美食' });
    }
  }

  const routeStops = allItems.map((i) => i.name);
  const places = allItems.slice(0, 6).map((i) => ({
    name: i.name,
    rating: String(ratingMap[i.name] ?? ''),
    cat: i.cat === '景点' ? '景点' : '美食',
    seed: poiMap[i.name]?.photoSeed || i.name + scene,
    imageUrl: poiMap[i.name]?.imageUrl,
    photo: poiMap[i.name]?.photo,
  }));

  // Date display
  let dateStr = '旅程 · 2天1晚';
  if (startDate) {
    const dt = new Date(startDate);
    if (!Number.isNaN(dt.getTime())) {
      dateStr = `${dt.getFullYear()}年${dt.getMonth() + 1}月 · 2天1晚`;
    }
  }

  // Title: city + top-2 pref keywords
  const prefWords = prefs.slice(0, 2);
  const title = prefWords.length > 0
    ? `${city}\n${prefWords.join(' · ')}\n之旅`
    : `${city}\n专属定制\n之旅`;

  // Subtitle: pick from prefs
  const subtitle = prefs.map((p) => PREF_SUBTITLE[p]).find(Boolean)
    ?? `和小go一起，发现${city}的美好`;

  const km = Math.round(Number(preview.totalKm));
  const distance = Number.isNaN(km) || km === 0 ? '--' : String(km);
  const story = buildTripStory(city, prefs, places, routeStops.length, distance);

  return {
    city,
    date: dateStr,
    title,
    subtitle,
    closing: sc.closing,
    distance,
    coverSeed: sc.coverSeed,
    gradient: sc.gradient,
    routeStops,
    places,
    memory: sc.memory,
    ...story,
  };
}

function buildTripStory(
  city: string,
  prefs: string[],
  places: SummaryData['places'],
  stopCount: number,
  distance: string,
) {
  const hasFood = places.some((p) => p.cat === '美食');
  const hasArt = prefs.includes('文艺之旅');
  const hasNature = prefs.includes('探索自然');
  const isFamily = prefs.includes('亲子友好');
  const isRelax = prefs.includes('休闲度假');
  const highlight = places[0]?.name || `${city}的一处小光点`;
  const second = places[1]?.name || '下一站';

  let keyword = '出发';
  let keywordLine = `这趟旅行，把你的日常从待机模式调回了生活模式。`;
  let persona = '城市慢逛型选手';
  let personaLine = '比起赶路，你更在意哪一站值得停下来。';
  let highlightLine = `${highlight} 是这趟行程里最值得停下来的那一站。`;
  let socialEnding = '下一次出发，不一定要很远，只要很像自己。';

  if (hasFood) {
    keyword = '有味';
    keywordLine = `你的路线不是从地图开始的，是从第一口心动开始的。`;
    persona = '胃先抵达型旅行者';
    personaLine = `你会为了好吃的绕一点路，也会因此记住一座城。`;
    highlightLine = `${highlight} 像今天的隐藏片尾，值得被你放进收藏夹。`;
    socialEnding = '今天不是攻略，是一份被城市认真投喂过的心情。';
  } else if (hasArt) {
    keyword = '靠近';
    keywordLine = `你没有急着打卡，而是在城市的纹理里慢慢靠近自己。`;
    persona = '审美雷达型旅人';
    personaLine = `你在意光线、空间、细节，也在意一站有没有自己的气质。`;
    highlightLine = `${highlight} 像一个安静镜头，让今天突然有了电影感。`;
    socialEnding = '这不是普通路线，是我和城市互相看见的一天。';
  } else if (hasNature) {
    keyword = '透气';
    keywordLine = `你把脚步交给风，也把脑袋里的噪音留在了路上。`;
    persona = '城市换气型选手';
    personaLine = `你需要的不是逃离，而是找到一块能重新呼吸的地方。`;
    highlightLine = `${highlight} 是今天最会让人慢下来的那一站。`;
    socialEnding = '短暂出走，也能把生活里的空气换新。';
  } else if (isFamily) {
    keyword = '同频';
    keywordLine = `这趟旅行最珍贵的，不是去了哪里，是大家一起在场。`;
    persona = '家庭回忆收藏家';
    personaLine = `你在意路线顺不顺，也在意每个人有没有被照顾到。`;
    highlightLine = `${highlight} 像今天的家庭相册封面，平凡但会被记很久。`;
    socialEnding = '有些路走完就结束，有些会变成家里的共同记忆。';
  } else if (isRelax) {
    keyword = '松弛';
    keywordLine = `你把时间放慢了一点，城市就把好看的部分递给了你。`;
    persona = '反向周末玩家';
    personaLine = `你不急着完成路线，你更想把今天过得像自己。`;
    highlightLine = `${highlight} 是今天最适合发呆，也最适合再来的地方。`;
    socialEnding = '今天不是逃离日常，是把日常重新变好看。';
  }

  const stopBoost = Math.min(12, Math.max(0, stopCount - 3) * 2);
  const kmValue = Number(distance);
  const distanceBoost = Number.isFinite(kmValue) ? Math.min(10, Math.round(kmValue / 3)) : 4;

  return {
    keyword,
    keywordLine,
    persona,
    personaLine,
    highlightName: highlight,
    highlightLine,
    socialEnding,
    moodStats: [
      { label: hasFood ? '含糖量' : '松弛指数', value: Math.min(99, 82 + stopBoost), suffix: '%' },
      { label: '出片概率', value: Math.min(99, 78 + distanceBoost), suffix: '%' },
      { label: '再来一次', value: Math.min(99, second.length * 7 + 42), suffix: '%' },
    ],
  };
}

function tripPointCount(data: Pick<SummaryData, 'routeStops' | 'places'>) {
  return data.routeStops.length || data.places.length || 3;
}

function foodTastedCount(data: Pick<SummaryData, 'routeStops' | 'places'>) {
  return data.places.filter((p) => p.cat === '美食').length;
}

function scenicCount(data: Pick<SummaryData, 'places'>) {
  return data.places.filter((p) => p.cat === '景点').length;
}

function citySummaryTheme(city: string) {
  const isShenzhen = city === '深圳';
  return isShenzhen
    ? {
        cityType: '海岸城市',
        placeLabel: '海岸足迹',
        placeLine: '海岸气息里真实停留过的一站。',
        bg: '/summary-bg/shenzhen.jpg',
        literaryBg: '/summary-bg/literary-sz.jpg',
        title: '海风吹过的深圳',
        titleSoft: '把海风和日落\n收进行程里',
        label: 'SEA ROUTE',
        intro: '这一次，路线从海风里展开。桥、港口、草地和海边天光，都变成你短暂离开日常的证据。',
        background: 'linear-gradient(180deg,#f8efe2 0%,#f0d7bd 18%,#c77745 54%,#1d5f70 82%,#0c2e3d 100%)',
        ink: '#21454a',
        text: '#263d3f',
        muted: '#6c7d78',
        accent: '#2f8892',
        accent2: '#d99050',
        light: '#fff7ed',
        paper: 'rgba(255,249,237,.94)',
        paper2: 'rgba(238,224,205,.82)',
        darkWash: 'rgba(16,55,64,.84)',
        stamp: '#d9a15f',
      }
    : {
        cityType: '古都建筑',
        placeLabel: '北京足迹',
        placeLine: '古都光影里真实停留过的一站。',
        bg: '/summary-bg/beijing.jpg',
        literaryBg: '/summary-bg/literary-bj.jpg',
        title: '古城光影里的北京',
        titleSoft: '把宫墙和天光\n收进行程里',
        label: 'PALACE ROUTE',
        intro: '这一次，路线从古建筑的屋檐下开始。蓝天、宫墙、石阶和城市的暖光，替这趟旅行留下了很北京的注脚。',
        background: 'linear-gradient(180deg,#eef4f7 0%,#e8d6bf 25%,#bd7747 58%,#733a29 82%,#251414 100%)',
        ink: '#4b2a22',
        text: '#4c2e24',
        muted: '#80695d',
        accent: '#9d4e32',
        accent2: '#c28a43',
        light: '#fff5e8',
        paper: 'rgba(252,243,226,.94)',
        paper2: 'rgba(238,220,196,.82)',
        darkWash: 'rgba(79,43,32,.84)',
        stamp: '#c98b48',
      };
}

const EMPTY_SUMMARY: SummaryData = {
  city: '', date: '', title: '', subtitle: '', closing: '',
  distance: '--', coverSeed: '', gradient: '#070912', routeStops: [], places: [], memory: '',
  keyword: '出发',
  keywordLine: '这趟旅行，把日常重新调亮了一点。',
  persona: '城市慢逛型选手',
  personaLine: '比起赶路，你更在意哪一站值得停下来。',
  highlightName: '值得停留的一站',
  highlightLine: '这趟旅行，把值得停下来的地方都替你标了出来。',
  socialEnding: '下一次出发，不一定要很远，只要很像自己。',
  moodStats: [
    { label: '松弛指数', value: 91, suffix: '%' },
    { label: '出片概率', value: 88, suffix: '%' },
    { label: '含糖量', value: 76, suffix: '%' },
  ],
};

/* ────────────────────────────────────────
   Main component
──────────────────────────────────────── */
export default function Summary() {
  const nav = useNavigate();
  const { scene, identity } = useApp();
  const [data, setData] = useState<SummaryData>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getPreview(scene), getPickerItems(scene)])
      .then(([preview, items]) => {
        if (cancelled) return;
        // Build rating map: name → rating
        const ratingMap: Record<string, number> = {};
        const poiMap: Record<string, POIItem> = {};
        for (const it of items) {
          if (it.cat === 'sight' || it.cat === 'food') {
            const poi = it as POIItem;
            ratingMap[poi.name] = poi.rating;
            poiMap[poi.name] = poi;
          }
        }
        const summary = buildSummary(
          preview,
          ratingMap,
          poiMap,
          identity.preferences,
          identity.startDate,
          scene,
        );
        setData(summary);
      })
      .catch((err) => {
        console.warn('[Summary] failed to load trip data', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [scene, identity.preferences, identity.startDate]);

  const displayData: SummaryData = data.city ? data : {
    ...data,
    city: scene === 'bj' ? '北京' : '深圳',
    coverSeed: scene === 'bj' ? 'beijing-palace' : 'shenzhen-skyline',
  };
  const pages = [
    <CoverSlide key="cover" data={displayData} loading={loading} />,
    <PersonaSlide key="persona" data={displayData} />,
    <FootprintMapSlide key="map" data={displayData} />,
    <PlacesSlide key="places" data={displayData} />,
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

        {shareOpen && <ShareModal data={displayData} onClose={() => setShareOpen(false)} />}
      </div>
    </MobileFrame>
  );
}

/* ────────────────────────────────────────
   Slides
──────────────────────────────────────── */
function CoverSlide({ data, loading }: { data: SummaryData; loading: boolean }) {
  const litCount = tripPointCount(data);
  const tripTitle = data.city ? `${data.city}之行` : '我的旅程';
  return (
    <section style={{ ...slideBaseStyle, padding: '42px 30px 24px', background: 'radial-gradient(circle at 78% 28%,#ff8fdb 0%,rgba(255,143,219,.38) 20%,transparent 39%), radial-gradient(circle at 20% 68%,#ffb05c 0%,rgba(255,176,92,.36) 22%,transparent 43%), radial-gradient(circle at 62% 72%,#7bdcff 0%,rgba(123,220,255,.28) 18%,transparent 40%), linear-gradient(150deg,#050819 0%,#241447 48%,#070713 100%)' }}>
      {loading && (
        <div style={{ position: 'absolute', top: 18, left: 22, right: 22 }}>
          <StreamingStatus
            title="正在生成旅程总结"
            tone="dark"
            compact
            messages={[
              '读取最终行程',
              '整理路线足迹',
              '提炼高光地点',
              '生成回顾章节',
            ]}
          />
        </div>
      )}
      <div style={auroraLineStyle} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,.82)', fontSize: 19, fontWeight: 950 }}>{data.date || '旅程回顾'}</div>
        <h1 style={{ margin: '22px 0 0', fontSize: 62, lineHeight: 1.02, fontWeight: 950, color: '#fff', textShadow: '0 0 28px rgba(255,255,255,.48), 0 10px 45px rgba(255,160,230,.5)' }}>
          {tripTitle}
        </h1>
        <div style={{ marginTop: 14, width: 128, height: 2, background: 'rgba(255,255,255,.64)' }} />
        <p style={{ margin: '34px 0 0', maxWidth: 278, fontSize: 19, lineHeight: 1.72, color: 'rgba(255,255,255,.94)', fontWeight: 900 }}>
          {loading ? '' : `你用 ${litCount} 个行程点，把${data.city || '这座城市'}重新走亮了一遍。`}
        </p>
        <div style={{ position: 'absolute', left: 146, top: 168, width: 16, height: 56, borderRadius: 999, background: 'linear-gradient(180deg,#fff,rgba(255,255,255,.15))', boxShadow: '0 0 36px rgba(255,255,255,.72)' }} />
        <div style={{ marginTop: 42, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          <CoverStat value={litCount} label="行程点" />
          <CoverStat value={data.distance} label="公里" />
          <CoverStat value="2" label="天 1 晚" />
        </div>
        <div style={{ marginTop: 34, fontSize: 16, lineHeight: 1.85, color: 'rgba(255,255,255,.78)', fontWeight: 760 }}>
          {data.keywordLine}
        </div>
      </div>
    </section>
  );
}

function PersonaSlide({ data }: { data: SummaryData }) {
  const bg = data.city === '北京' ? '/summary-bg/beijing.jpg' : '/summary-bg/shenzhen.jpg';
  const litCount = tripPointCount(data);
  return (
    <section style={{ ...slideBaseStyle, padding: '0', background: `url(${bg}) center / cover no-repeat`, color: '#fff' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(0,0,0,.16),rgba(0,0,0,.38) 42%,rgba(0,0,0,.76))' }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ minHeight: 250 }} />
        <div style={{ padding: '0 28px 24px' }}>
          <div style={{ fontSize: 15, fontWeight: 950, color: 'rgba(255,255,255,.72)' }}>TRAVEL TYPE</div>
          <h1 style={{ margin: '12px 0 0', fontSize: 35, lineHeight: 1.15, fontWeight: 950 }}>
            {data.persona}
          </h1>
          <p style={{ marginTop: 14, maxWidth: 286, fontSize: 18, lineHeight: 1.65, color: 'rgba(255,255,255,.9)', fontWeight: 820 }}>
            {data.personaLine}
          </p>
          <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9 }}>
            <GlassStat value={litCount} label="点亮" />
            <GlassStat value={data.moodStats[0]?.value || 91} label={data.moodStats[0]?.label || '松弛'} suffix="%" />
            <GlassStat value={data.moodStats[1]?.value || 88} label="出片" suffix="%" />
          </div>
          <div style={{ marginTop: 18, padding: '12px 13px', borderRadius: 16, background: 'rgba(255,255,255,.14)', backdropFilter: 'blur(10px)', fontSize: 14, lineHeight: 1.65, fontWeight: 800 }}>
            今天最重要的不是去了多远，而是你把哪一段路走成了自己的记忆。
          </div>
        </div>
      </div>
    </section>
  );
}

function FootprintMapSlide({ data }: { data: SummaryData }) {
  const bg = data.city === '北京' ? '/summary-bg/beijing.jpg' : '/summary-bg/shenzhen.jpg';
  const points = data.routeStops.map((name, i) => ({
    name,
    x: [18, 34, 54, 70, 82, 62, 42, 24, 36, 58][i % 10],
    y: [28, 18, 25, 42, 62, 75, 66, 52, 39, 50][i % 10],
  }));
  const sightCount = data.places.filter((p) => p.cat === '景点').length;
  const foodCount = data.places.filter((p) => p.cat === '美食').length;
  const litCount = tripPointCount(data);
  const visiblePoints = points.length > 0 ? points : [
    { name: '起点', x: 20, y: 35 },
    { name: '城市', x: 45, y: 24 },
    { name: '终点', x: 72, y: 58 },
  ];
  const highlighted = data.routeStops.length > 0
    ? data.routeStops.slice(0, 5)
    : (data.places.map((p) => p.name).slice(0, 5).length > 0 ? data.places.map((p) => p.name).slice(0, 5) : ['第一站', '第二站', '第三站']);

  return (
    <section style={{ ...slideBaseStyle, padding: '28px 25px 22px', background: `url(${bg}) center / cover no-repeat`, color: '#fff' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(5,8,18,.24),rgba(5,8,18,.66) 46%,rgba(5,8,18,.86))' }} />
      <div style={grainStyle} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 16, color: 'rgba(255,255,255,.68)', fontWeight: 950 }}>YEARLY ROUTE · FOOTPRINT</div>
        <h1 style={{ margin: '14px 0 16px', fontSize: 32, lineHeight: 1.15, fontWeight: 950, textShadow: '0 8px 26px rgba(0,0,0,.36)' }}>
          你的足迹<br />点亮了 <span style={{ color: '#0097b2' }}>{litCount}</span> 个行程点
        </h1>
        <div style={{ position: 'relative', height: 250, borderRadius: 24, background: 'rgba(255,255,255,.14)', backdropFilter: 'blur(16px)', boxShadow: '0 22px 46px rgba(0,0,0,.24), inset 0 0 0 1px rgba(255,255,255,.18)', overflow: 'hidden' }}>
          <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: 'block' }}>
            <path d="M 4 16 C 24 7 35 19 48 12 C 70 2 92 18 96 40 C 103 67 76 88 54 83 C 34 80 27 99 11 82 C -3 67 8 48 4 16 Z" fill="rgba(125,211,252,.2)" />
            <path d="M 12 8 C 20 28 6 39 18 56 C 31 75 55 63 71 78 C 81 88 91 78 94 62" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="9" strokeLinecap="round" />
            {visiblePoints.length > 1 && <path d={visiblePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')} fill="none" stroke="#ffd84a" strokeWidth="1.8" strokeDasharray="3 2" />}
            {visiblePoints.slice(0, 6).map((p, i) => (
              <g key={p.name + i}>
                <circle cx={p.x} cy={p.y} r="5.4" fill="#fff" opacity=".82" />
                <circle cx={p.x} cy={p.y} r="3" fill={i === visiblePoints.length - 1 ? '#ff5ca8' : '#0097b2'} stroke="#fff" strokeWidth="1" />
                <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize="4" fill="#fff" fontWeight="900">{i + 1}</text>
                <text x={p.x} y={p.y + 11} textAnchor="middle" fontSize="3.1" fill="#fff" fontWeight="800">{p.name.slice(0, 4)}</text>
              </g>
            ))}
          </svg>
        </div>
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <GlassStat value={sightCount} label="景点" />
          <GlassStat value={foodCount} label="美食" />
          <GlassStat value={data.distance} label="km" />
        </div>
        <div style={{ marginTop: 13, display: 'grid', gap: 7 }}>
          {highlighted.slice(0, 3).map((name, i) => (
            <div key={name + i} style={{ display: 'grid', gridTemplateColumns: '24px 1fr', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 13, background: 'rgba(255,255,255,.14)', backdropFilter: 'blur(10px)', fontWeight: 900 }}>
              <span style={{ display: 'grid', placeItems: 'center', width: 24, height: 24, borderRadius: '50%', background: i === 0 ? '#ff5ca8' : '#0097b2', color: '#fff', fontSize: 12 }}>{i + 1}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PlacesSlide({ data }: { data: SummaryData }) {
  const theme = citySummaryTheme(data.city);
  const shown = data.places.length > 0 ? data.places : [
    { name: '精彩行程', rating: '', cat: '景点', seed: 'placeholder1' },
    { name: '美味美食', rating: '', cat: '美食', seed: 'placeholder2' },
  ];
  const litCount = tripPointCount(data);
  const foodCount = foodTastedCount(data);
  const viewCount = Math.max(1, scenicCount(data) || shown.filter((p) => p.cat === '景点').length);
  const firstStop = shown[0]?.name || data.highlightName || '第一站';
  const secondStop = shown[1]?.name || '下一站';
  const flavourLine = foodCount > 0
    ? `你品尝了 ${foodCount} 种城市风味。`
    : `你收藏了 ${viewCount} 处城市风景。`;
  const flavourSub = foodCount > 0
    ? `从 ${secondStop} 开始，今天的记忆有了具体的味道。`
    : `从 ${secondStop} 开始，今天的记忆有了具体的光线。`;

  return (
    <section style={{ ...slideBaseStyle, padding: '24px 26px 22px', background: theme.background, color: '#080808' }}>
      <div style={annualMemoryWashStyle} />
      <div style={{ position: 'absolute', left: -54, bottom: 92, fontSize: 116, fontWeight: 950, color: 'rgba(255,255,255,.18)' }}>去</div>
      <div style={{ position: 'absolute', right: -48, bottom: 92, fontSize: 116, fontWeight: 950, color: 'rgba(255,255,255,.18)' }}>今</div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ padding: '5px 12px', borderRadius: 999, background: 'rgba(255,255,255,.86)', color: '#1f8b63', fontSize: 13, fontWeight: 950, boxShadow: '0 8px 20px rgba(0,0,0,.1)' }}>小go 旅行回顾</div>
        </div>
        <div style={{ marginTop: 28, textAlign: 'center', fontSize: 24, lineHeight: 1.7, fontWeight: 900 }}>
          Hi，旅行家
        </div>
        <div style={{ marginTop: 20, display: 'grid', gap: 28, textAlign: 'center' }}>
          <MemoryChapter
            title="「启程」"
            body={`${data.date || '这一天'}，你开启了这趟${data.city || '城市'}旅行。`}
            sub={`第一站 ${firstStop}，不是坐标，是今天开始有光的地方。`}
          />
          <MemoryChapter
            title={foodCount > 0 ? '「风味」' : '「光影」'}
            body={flavourLine}
            sub={flavourSub}
          />
          <MemoryChapter
            title="「足迹」"
            body={`你点亮了 ${litCount} 个行程点，收藏了 ${viewCount} 处风景。`}
            sub={`经过 ${firstStop}，也把这条路线放进了回忆里。`}
          />
        </div>
        <div style={{ marginTop: 34, color: '#fff', textAlign: 'center', fontSize: 18, lineHeight: 1.95, fontWeight: 900, textShadow: '0 2px 14px rgba(0,0,0,.28)' }}>
          相遇是瞬间的礼物，<br />陪伴是漫长的馈赠。<br />
          {data.socialEnding}
        </div>
        <div style={{ margin: '18px auto 0', width: 34, color: '#fff', fontSize: 26, lineHeight: 1 }}>⌃</div>
      </div>
    </section>
  );
}

function FinalSlide({ data }: { data: SummaryData }) {
  const ranked = data.places.length > 0 ? data.places.slice(0, 7) : [
    { name: '精彩旅程', rating: '', cat: '景点', seed: 'rank1' },
    { name: '城市美食', rating: '', cat: '美食', seed: 'rank2' },
    { name: '小团路线', rating: '', cat: '路线', seed: 'rank3' },
  ];
  return (
    <section style={{ ...slideBaseStyle, padding: '36px 24px 22px', background: 'radial-gradient(circle at 70% 18%,rgba(255,255,255,.3),transparent 24%), linear-gradient(180deg,#2e33ff 0%,#7d35ff 64%,#f58be2 100%)', color: '#fff' }}>
      <div style={rankGlowStyle} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <h1 style={{ margin: '0 0 24px', fontSize: 34, lineHeight: 1.16, fontWeight: 950 }}>
          你的年度<br />路线榜单
        </h1>
        <div style={{ display: 'grid', gap: 12, perspective: 900 }}>
          {ranked.map((place, i) => (
            <div key={place.name + i} style={{ height: 46, display: 'grid', gridTemplateColumns: '42px 42px 1fr 44px', alignItems: 'center', gap: 10, padding: '0 12px', background: rankColors[i % rankColors.length], transform: `translateX(${i % 2 ? 10 : 0}px) rotateX(${i % 2 ? -5 : 5}deg)`, boxShadow: '0 12px 24px rgba(15,10,80,.24)' }}>
              <div style={{ fontSize: 19, fontWeight: 950 }}>#{i + 1}</div>
              <Photo seed={place.seed} height={30} radius={3} />
              <div style={{ minWidth: 0 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 16, fontWeight: 950 }}>{place.name}</div>
                <div style={{ marginTop: 2, fontSize: 11, color: 'rgba(255,255,255,.74)', fontWeight: 800 }}>{place.cat}</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 15, fontWeight: 950 }}>{Math.max(7, 17 - i)}次</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 950 }}>
          <span style={{ maxWidth: 230, lineHeight: 1.55 }}>{data.socialEnding}</span>
          <span style={{ padding: '7px 12px', borderRadius: 999, background: 'rgba(0,0,0,.25)' }}>{data.distance} km</span>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────
   Shared sub-components
──────────────────────────────────────── */
function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <span style={{ fontSize: 36, fontWeight: 950 }}>{value}</span>
      <span style={{ marginLeft: 5, fontSize: 15, fontWeight: 800 }}>{label}</span>
    </div>
  );
}

function TicketMetric({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ minHeight: 86, padding: '13px 9px', borderRadius: 14, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)' }}>
      <div style={{ fontSize: 30, lineHeight: 1, fontWeight: 950 }}>{value}</div>
      <div style={{ marginTop: 8, fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,.62)', letterSpacing: 1 }}>{label.toUpperCase()}</div>
    </div>
  );
}

function ReceiptMetric({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div style={{ fontSize: 25, fontWeight: 950, fontFamily: 'monospace' }}>{value}</div>
      <div style={{ marginTop: 2, fontSize: 10, fontWeight: 900, color: '#777', letterSpacing: 1 }}>{label.toUpperCase()}</div>
    </div>
  );
}

function GlowStat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ padding: '14px 15px', borderRadius: 18, background: 'rgba(255,255,255,.14)', boxShadow: `inset 0 0 0 1px rgba(255,255,255,.18), 0 0 34px ${color}44` }}>
      <div style={{ fontSize: 30, fontWeight: 950, color }}>{value}</div>
      <div style={{ marginTop: 4, fontSize: 13, fontWeight: 900, color: 'rgba(255,255,255,.72)' }}>{label}</div>
    </div>
  );
}

function MapStat({ value, label }: { value: number | string; label: string }) {
  return (
    <div style={{ minHeight: 64, borderRadius: 16, padding: '10px 8px', background: 'rgba(255,255,255,.56)', textAlign: 'center', boxShadow: 'inset 0 0 0 1px rgba(0,151,178,.12)' }}>
      <div style={{ fontSize: 23, lineHeight: 1.1, fontWeight: 950, color: '#0097b2' }}>{value}</div>
      <div style={{ marginTop: 5, fontSize: 12, fontWeight: 900, color: 'rgba(7,34,43,.58)' }}>{label}</div>
    </div>
  );
}

function CoverStat({ value, label }: { value: number | string; label: string }) {
  return (
    <div style={{ minHeight: 72, borderRadius: 15, padding: '12px 8px', background: 'rgba(255,255,255,.12)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.18)' }}>
      <div style={{ fontSize: 25, fontWeight: 950 }}>{value}</div>
      <div style={{ marginTop: 5, fontSize: 12, color: 'rgba(255,255,255,.72)', fontWeight: 900 }}>{label}</div>
    </div>
  );
}

function GlassStat({ value, label, suffix = '' }: { value: number | string; label: string; suffix?: string }) {
  return (
    <div style={{ minHeight: 72, padding: '11px 8px', borderRadius: 15, background: 'rgba(255,255,255,.16)', backdropFilter: 'blur(10px)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.22)' }}>
      <div style={{ fontSize: 23, fontWeight: 950 }}>{value}{suffix}</div>
      <div style={{ marginTop: 5, fontSize: 12, color: 'rgba(255,255,255,.75)', fontWeight: 900 }}>{label}</div>
    </div>
  );
}

function MemoryBlock({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 950, letterSpacing: 2 }}>{title}</div>
      <div style={{ marginTop: 12, fontSize: 18, lineHeight: 1.75, fontWeight: 850 }}>{body}</div>
    </div>
  );
}

function MemoryChapter({ title, body, sub }: { title: string; body: string; sub: string }) {
  return (
    <div>
      <div style={{ fontSize: 25, fontWeight: 950, letterSpacing: 3 }}>{title}</div>
      <div style={{ marginTop: 10, fontSize: 20, lineHeight: 1.65, fontWeight: 900 }}>{body}</div>
      <div style={{ marginTop: 2, fontSize: 17, lineHeight: 1.7, fontWeight: 800, color: 'rgba(0,0,0,.78)' }}>{sub}</div>
    </div>
  );
}

function PosterMiniStat({ value, label }: { value: number | string; label: string }) {
  return (
    <div style={{ padding: '12px 8px', borderRadius: 14, background: 'rgba(255,255,255,.28)', backdropFilter: 'blur(10px)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.22)' }}>
      <div style={{ fontSize: 22, fontWeight: 950 }}>{value}</div>
      <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(0,0,0,.58)', fontWeight: 900 }}>{label}</div>
    </div>
  );
}

function PosterLongMetric({ value, label }: { value: number | string; label: string }) {
  return (
    <div style={{ minHeight: 88, borderRadius: 16, padding: '15px 12px', background: '#fffdf5', border: '1px solid rgba(93,111,58,.24)', boxShadow: '0 10px 24px rgba(72,82,42,.08)' }}>
      <div style={{ fontSize: 34, lineHeight: 1, fontWeight: 950, color: 'currentColor', fontFamily: 'Georgia, serif' }}>{value}</div>
      <div style={{ marginTop: 9, color: 'rgba(0,0,0,.58)', fontSize: 13, fontWeight: 900 }}>{label}</div>
    </div>
  );
}

function PosterStory({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ padding: '16px 0', borderTop: '1px solid rgba(255,255,255,.28)' }}>
      <div style={{ fontSize: 20, fontWeight: 950 }}>{title}</div>
      <div style={{ marginTop: 8, fontSize: 16, lineHeight: 1.72, color: 'rgba(0,0,0,.72)', fontWeight: 820 }}>{body}</div>
    </div>
  );
}

function PosterPhoneCard({
  seed,
  bg,
  title,
  stats,
  footer,
  offsetTop = 0,
}: {
  seed?: string;
  bg?: string;
  title: string;
  stats: Array<[string, string]>;
  footer: string;
  offsetTop?: number;
}) {
  return (
    <div style={{ marginTop: offsetTop, height: 368, borderRadius: 24, overflow: 'hidden', position: 'relative', background: bg ? `url(${bg}) center / cover no-repeat` : '#111', boxShadow: '0 18px 36px rgba(19,77,118,.22)' }}>
      {!bg && <Photo seed={seed || 'poster'} height={368} radius={0} />}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(0,0,0,.1),rgba(0,0,0,.24) 42%,rgba(0,0,0,.74))' }} />
      <div style={{ position: 'absolute', top: 15, left: 15, width: 30, height: 30, borderRadius: '50%', background: 'rgba(0,0,0,.28)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 24 }}>‹</div>
      <div style={{ position: 'absolute', top: 17, right: 15, display: 'flex', gap: 9, color: '#fff', opacity: 0.9, fontSize: 16 }}>
        <span>●</span><span>♪</span><span>↗</span>
      </div>
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 18, color: '#fff' }}>
        <div style={{ whiteSpace: 'pre-line', fontSize: 18, lineHeight: 1.5, fontWeight: 900 }}>{title}</div>
        <div style={{ marginTop: 17, display: 'grid', gridTemplateColumns: `repeat(${stats.length},1fr)`, gap: 7 }}>
          {stats.map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: 13, opacity: 0.82, fontWeight: 800 }}>{label}</div>
              <div style={{ marginTop: 4, color: '#fff65a', fontSize: 18, fontWeight: 950 }}>{value}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, fontSize: 14, lineHeight: 1.5, fontWeight: 850, opacity: 0.92 }}>{footer}</div>
      </div>
    </div>
  );
}

function PosterGlassPill({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,.18)', backdropFilter: 'blur(8px)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.18)' }}>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,.72)', fontWeight: 850 }}>{label}</div>
      <div style={{ marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 15, color: '#fff', fontWeight: 950 }}>{value}</div>
    </div>
  );
}

const polaroidColors = ['#ffcf33', '#1976ff', '#8b35d1', '#12a86b'];
const rankColors = ['#c68b32', '#08a8dd', '#7a55ff', '#b64bd0', '#05a19a', '#638f26', '#9b6458'];

function polaroidPlacement(index: number): CSSProperties {
  const base: CSSProperties = {
    position: 'absolute',
    width: 126,
    padding: 8,
    borderRadius: 4,
    boxShadow: '0 14px 28px rgba(0,0,0,.35)',
  };
  const positions: CSSProperties[] = [
    { left: 8, top: 28, transform: 'rotate(-8deg)' },
    { right: 4, top: 58, transform: 'rotate(7deg)' },
    { left: 28, bottom: 22, transform: 'rotate(8deg)' },
    { right: 20, bottom: 2, transform: 'rotate(-6deg)' },
  ];
  return { ...base, ...positions[index % positions.length] };
}

function ShareModal({ data, onClose }: { data: SummaryData; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.58)', backdropFilter: 'blur(8px)', zIndex: 40, display: 'flex', alignItems: 'flex-end', animation: 'overlayFade .2s ease' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxHeight: '88%', overflowY: 'auto', background: '#fff', color: '#111', borderRadius: '24px 24px 0 0', padding: '18px 16px 24px', animation: 'sheetUp .24s ease' }}>
        <div style={{ textAlign: 'center', fontSize: 20, fontWeight: 950 }}>生成朋友圈长图</div>
        <div style={{ textAlign: 'center', color: '#8b8f99', marginTop: 7, fontSize: 13 }}>把这趟旅行浓缩成一张可转发总结</div>
        <LongPoster data={data} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginTop: 18 }}>
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

function LongPoster({ data }: { data: SummaryData }) {
  const theme = citySummaryTheme(data.city);
  const litCount = tripPointCount(data);
  const foodCount = foodTastedCount(data);
  const viewCount = Math.max(1, scenicCount(data));
  const stops = data.routeStops.length > 0 ? data.routeStops : data.places.map((p) => p.name);
  const stopNames = stops.slice(0, 6);
  const realPlaces = data.places.filter((place) => place.imageUrl || place.photo);
  const highlightCards = (realPlaces.length > 0 ? realPlaces : data.places.length > 0 ? data.places : [
    { name: '城市风景', rating: '', cat: '景点', seed: 'poster-scenery' },
    { name: '在地美食', rating: '', cat: '美食', seed: 'poster-food' },
    { name: '路线记忆', rating: '', cat: '景点', seed: 'poster-route' },
    { name: '下一次再来', rating: '', cat: '美食', seed: 'poster-return' },
  ]).slice(0, 4);
  const primary = highlightCards[0];
  const secondary = highlightCards[1] || highlightCards[0];
  const metricLabel = foodCount > 0 ? '品尝城市风味' : '收藏城市风景';
  const metricValue = foodCount > 0 ? foodCount : viewCount;
  const metricCopy = foodCount > 0
    ? `也品尝了 ${foodCount} 种真实出现在行程里的城市风味。`
    : `也收藏了 ${viewCount} 处真实出现在行程里的城市风景。`;
  const routeLine = stopNames.length > 0 ? stopNames.join(' → ') : '每一站都在替今天发光';

  return (
    <div style={{ marginTop: 18, borderRadius: 22, overflow: 'hidden', boxShadow: '0 18px 44px rgba(0,0,0,.16)', background: theme.light, color: theme.text }}>
      <div style={{ minHeight: 1630, position: 'relative', background: theme.background }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.26, background: `url(${theme.bg}) center top / 145% auto repeat-y` }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(255,255,255,.02),rgba(255,246,230,.76) 28%,rgba(255,246,230,.92) 58%,rgba(42,28,22,.72) 100%)' }} />
        <div style={{ position: 'absolute', left: -26, right: -26, top: 466, height: 132, background: theme.paper, clipPath: 'polygon(0 28%,8% 18%,18% 31%,28% 15%,39% 28%,50% 17%,61% 30%,73% 16%,86% 29%,100% 20%,100% 100%,0 100%)', filter: 'drop-shadow(0 -16px 18px rgba(64,46,32,.16))' }} />
        <div style={{ position: 'absolute', left: 20, right: 20, top: 32, height: 340, borderRadius: 26, overflow: 'hidden', boxShadow: '0 20px 44px rgba(24,24,24,.22)' }}>
          <div style={{ position: 'absolute', inset: 0, background: `url(${theme.bg}) center / cover no-repeat` }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(0,0,0,.04),rgba(0,0,0,.24) 55%,rgba(0,0,0,.62))' }} />
          <div style={{ position: 'absolute', left: 20, top: 20, padding: '7px 12px', borderRadius: 999, background: 'rgba(0,0,0,.24)', color: 'rgba(255,255,255,.9)', fontSize: 11, fontWeight: 900, letterSpacing: 2, backdropFilter: 'blur(10px)' }}>
            {theme.label} · {data.date || '旅程回顾'}
          </div>
          <div style={{ position: 'absolute', left: 22, right: 22, bottom: 24 }}>
            <div style={{ color: 'rgba(255,255,255,.72)', fontSize: 12, fontWeight: 900, letterSpacing: 2 }}>TRIP MEMORY</div>
            <div style={{ marginTop: 9, whiteSpace: 'pre-line', color: '#fff', fontSize: 40, lineHeight: 1.08, fontWeight: 950, textShadow: '0 3px 18px rgba(0,0,0,.35)' }}>
              {theme.titleSoft}
            </div>
          </div>
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ height: 380 }} />

          <div style={{ margin: '0 18px', padding: '30px 18px 24px', position: 'relative', background: theme.paper, clipPath: 'polygon(0 18px,8% 8px,17% 20px,27% 6px,38% 18px,50% 5px,62% 17px,75% 7px,87% 19px,100% 9px,100% calc(100% - 12px),90% 100%,78% calc(100% - 10px),65% 100%,52% calc(100% - 8px),38% 100%,24% calc(100% - 10px),12% 100%,0 calc(100% - 8px))', boxShadow: '0 18px 36px rgba(63,76,42,.14)' }}>
            <div style={{ position: 'absolute', left: 44, top: 5, width: 58, height: 14, background: 'rgba(255,255,255,.7)', transform: 'rotate(-2deg)', boxShadow: '0 3px 10px rgba(0,0,0,.08)' }} />
            <div style={{ position: 'absolute', right: 36, top: 7, width: 48, height: 13, background: 'rgba(255,255,255,.58)', transform: 'rotate(3deg)', boxShadow: '0 3px 10px rgba(0,0,0,.08)' }} />
            <div style={{ color: theme.accent, fontFamily: 'Georgia, serif', fontSize: 17, fontWeight: 900, letterSpacing: 1 }}>About This Trip</div>
            <div style={{ marginTop: 8, fontSize: 26, lineHeight: 1.22, fontWeight: 950 }}>{theme.title}</div>
            <div style={{ marginTop: 12, color: theme.muted, fontSize: 15, lineHeight: 1.8, fontWeight: 820 }}>{theme.intro}</div>
            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <PosterLongMetric value={litCount} label="点亮行程点" />
              <PosterLongMetric value={metricValue} label={metricLabel} />
            </div>
          </div>

          <div style={{ margin: '20px 18px 0', position: 'relative' }}>
            <div style={{ color: theme.accent, textAlign: 'center', fontFamily: 'Georgia, serif', fontSize: 19, fontWeight: 950 }}>Don&apos;t Miss Highlights</div>
            <div style={{ textAlign: 'center', marginTop: 3, color: theme.muted, fontSize: 13, fontWeight: 850 }}>真实行程亮点</div>
            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {highlightCards.map((place, i) => (
                <div key={place.name + i} style={{ minHeight: 178, borderRadius: 14, background: '#fffdf6', border: `1px solid ${theme.accent}44`, overflow: 'hidden', boxShadow: '0 10px 22px rgba(72,82,42,.1)' }}>
                  <Photo seed={place.seed} src={place.imageUrl || place.photo} height={92} radius={0} />
                  <div style={{ padding: '10px 10px 12px' }}>
                    <div style={{ fontSize: 14, lineHeight: 1.25, fontWeight: 950, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{place.name}</div>
                    <div style={{ marginTop: 5, fontSize: 11, lineHeight: 1.45, fontWeight: 760, color: theme.muted }}>
                      {place.cat === '美食' ? '行程里真实出现过的城市味道。' : theme.placeLine}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ margin: '20px 18px 0', borderRadius: 24, overflow: 'hidden', background: theme.darkWash, color: '#fff', boxShadow: '0 18px 36px rgba(32,22,16,.16)' }}>
            <div style={{ height: 185, position: 'relative' }}>
              <Photo seed={primary?.seed || 'route'} src={primary?.imageUrl || primary?.photo} height={185} radius={0} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(0,0,0,.06),rgba(0,0,0,.56))' }} />
              <div style={{ position: 'absolute', left: 18, right: 18, bottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: 'rgba(255,255,255,.7)', letterSpacing: 2 }}>BEST STOP</div>
                <div style={{ marginTop: 5, fontSize: 24, lineHeight: 1.2, fontWeight: 950 }}>{primary?.name || data.highlightName}</div>
              </div>
            </div>
            <div style={{ padding: '18px 18px 20px' }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: 18, fontWeight: 950 }}>Scenery · Route · Memory</div>
              <div style={{ marginTop: 10, fontSize: 15, lineHeight: 1.85, fontWeight: 830, color: 'rgba(255,255,255,.86)' }}>
                这趟旅行点亮了 {litCount} 个行程点，{metricCopy}<br />
                最值得留下来的，不是一个抽象标签，是路上真的发生过的停留。
              </div>
            </div>
          </div>

          <div style={{ margin: '22px 18px 0', padding: '28px 18px 34px', position: 'relative', background: theme.paper2, clipPath: 'polygon(0 0,12% 8px,24% 1px,36% 10px,49% 0,62% 9px,75% 2px,88% 10px,100% 1px,100% 100%,0 100%)', boxShadow: '0 18px 36px rgba(63,76,42,.12)' }}>
            <div style={{ position: 'absolute', right: -18, bottom: -14, width: 120, height: 78, background: theme.stamp, transform: 'rotate(-10deg)', clipPath: 'polygon(8% 18%,88% 0,100% 72%,14% 100%)', opacity: 0.9 }} />
            <div style={{ position: 'absolute', right: 18, bottom: 22, color: '#fffce5', transform: 'rotate(-10deg)', fontFamily: 'Georgia, serif', fontSize: 13, fontWeight: 900 }}>From<br />Xiaogo</div>
            <div style={{ textAlign: 'center', color: theme.accent, fontFamily: 'Georgia, serif', fontSize: 19, fontWeight: 950 }}>Trip Summary</div>
            <div style={{ marginTop: 6, textAlign: 'center', color: theme.muted, fontSize: 13, fontWeight: 850 }}>行程一览</div>
            <div style={{ marginTop: 18, display: 'grid', gap: 11 }}>
              {(data.places.length > 0 ? data.places.slice(0, 5) : highlightCards).map((place, i) => (
                <div key={place.name + i} style={{ minHeight: 58, display: 'grid', gridTemplateColumns: '44px 1fr auto', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 15, background: 'rgba(255,255,255,.5)', border: `1px solid ${theme.accent}33` }}>
                  <Photo seed={place.seed} src={place.imageUrl || place.photo} width={44} height={44} radius={10} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: theme.text, fontSize: 13, fontWeight: 950, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{place.name}</div>
                    <div style={{ marginTop: 3, color: theme.muted, fontSize: 11, fontWeight: 820 }}>{place.cat === '美食' ? '城市风味' : theme.placeLabel}</div>
                  </div>
                  <div style={{ color: theme.accent, fontSize: 12, fontWeight: 950 }}>0{i + 1}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 22, padding: '16px 14px', borderRadius: 18, background: 'rgba(255,255,255,.42)', border: `1px dashed ${theme.accent}77` }}>
              <div style={{ color: theme.accent, fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 950 }}>Route Line</div>
              <div style={{ marginTop: 8, color: theme.text, fontSize: 14, lineHeight: 1.7, fontWeight: 850 }}>{routeLine}</div>
            </div>
            <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
              {stopNames.length > 0 ? stopNames.map((name, i) => (
                <div key={name + i} style={{ display: 'grid', gridTemplateColumns: '36px 1fr', alignItems: 'center', gap: 10, color: theme.ink, fontSize: 13, fontWeight: 850 }}>
                  <span style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: '50%', background: theme.accent, color: '#fff', fontSize: 11, fontWeight: 950 }}>S{i + 1}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                </div>
              )) : (
                <div style={{ color: theme.ink, fontSize: 13, fontWeight: 850 }}>每一站都在替今天发光。</div>
              )}
            </div>
            <div style={{ marginTop: 26, padding: '16px 18px', borderTop: `1px solid ${theme.accent}33`, color: theme.text, fontSize: 16, lineHeight: 1.85, fontWeight: 850, textAlign: 'center' }}>
              {data.socialEnding}
            </div>
            <div style={{ marginTop: 12, textAlign: 'center', color: theme.muted, fontSize: 10, fontWeight: 900, letterSpacing: '1px' }}>ASK XIAOTUAN · LOCAL ROUTE INTELLIGENCE</div>
          </div>

          <div style={{ margin: '22px 18px 0', height: 220, position: 'relative', borderRadius: '24px 24px 0 0', overflow: 'hidden', boxShadow: '0 -2px 22px rgba(33,24,18,.12)' }}>
            <Photo seed={secondary?.seed || 'ending'} src={secondary?.imageUrl || secondary?.photo} height={220} radius={0} />
            <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg,rgba(0,0,0,.02),${theme.darkWash})` }} />
            <div style={{ position: 'absolute', left: 18, right: 18, bottom: 18, color: '#fff' }}>
              <div style={{ fontSize: 27, lineHeight: 1.18, fontWeight: 950 }}>{data.city || '这座城市'}，下次再见</div>
              <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6, fontWeight: 820, color: 'rgba(255,255,255,.82)' }}>一张长图，留给这趟真实发生过的行程。</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────
   Styles
──────────────────────────────────────── */
const chapterStyle = {
  textAlign: 'center' as const,
  letterSpacing: '8px',
  fontSize: 15,
  fontWeight: 900,
  color: 'rgba(255,255,255,.68)',
};

const slideBaseStyle: CSSProperties = {
  height: '100%',
  position: 'relative',
  overflow: 'hidden',
};

const grainStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  opacity: 0.18,
  backgroundImage:
    'radial-gradient(circle at 20% 18%,rgba(255,216,74,.2),transparent 24%), radial-gradient(circle at 78% 22%,rgba(125,211,252,.18),transparent 20%), linear-gradient(115deg,transparent 0 47%,rgba(255,255,255,.08) 48% 50%,transparent 51% 100%)',
};

const auroraLineStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  opacity: 0.9,
  backgroundImage:
    'repeating-radial-gradient(ellipse at 45% 42%,rgba(255,255,255,.26) 0 1px,transparent 2px 11px), linear-gradient(105deg,transparent 0 40%,rgba(255,255,255,.25) 42%,transparent 46% 100%)',
  maskImage: 'linear-gradient(180deg,rgba(0,0,0,.95),rgba(0,0,0,.78),rgba(0,0,0,.3))',
};

const purpleMistStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  backgroundImage:
    'radial-gradient(circle at 64% 34%,rgba(255,255,255,.42),transparent 17%), radial-gradient(circle at 35% 48%,rgba(146,255,255,.22),transparent 22%), linear-gradient(180deg,transparent 0 33%,rgba(255,255,255,.24) 42%,transparent 58% 100%)',
};

const orbRowStyle: CSSProperties = {
  position: 'absolute',
  top: 26,
  left: -6,
  right: -6,
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 18,
  opacity: 0.78,
};

const orbStyle: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  justifySelf: 'center',
  color: '#fff',
  fontSize: 13,
  fontWeight: 950,
  boxShadow: '0 14px 32px rgba(20,12,80,.32), inset 0 0 0 1px rgba(255,255,255,.3)',
};

const springBrushStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  backgroundImage:
    'repeating-linear-gradient(152deg,rgba(255,255,255,.48) 0 3px,transparent 4px 27px), radial-gradient(circle at 26% 17%,rgba(255,220,0,.72) 0 8px,transparent 10px), radial-gradient(circle at 58% 23%,rgba(255,157,220,.58) 0 7px,transparent 9px), radial-gradient(circle at 74% 9%,rgba(255,189,0,.78) 0 6px,transparent 8px)',
  filter: 'blur(.2px)',
};

const rankGlowStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  backgroundImage:
    'linear-gradient(90deg,rgba(255,255,255,.18) 0 1px,transparent 1px), radial-gradient(circle at 48% 62%,rgba(255,255,255,.22),transparent 24%)',
  backgroundSize: '28px 100%, auto',
};

const mapMistStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  backgroundImage:
    'linear-gradient(90deg,rgba(0,151,178,.08) 1px,transparent 1px), linear-gradient(0deg,rgba(0,151,178,.06) 1px,transparent 1px), radial-gradient(circle at 20% 24%,rgba(255,255,255,.72),transparent 22%), radial-gradient(circle at 82% 70%,rgba(112,255,218,.46),transparent 24%)',
  backgroundSize: '36px 36px, 36px 36px, auto, auto',
};

const memoryGlowStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  backgroundImage:
    'radial-gradient(circle at 16% 12%,rgba(255,255,255,.7),transparent 18%), radial-gradient(circle at 82% 12%,rgba(252,120,74,.48),transparent 22%), radial-gradient(circle at 32% 58%,rgba(255,255,255,.36),transparent 20%), linear-gradient(180deg,rgba(255,255,255,.12),transparent 42%,rgba(0,0,0,.24))',
};

const annualMemoryWashStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  backgroundImage:
    'radial-gradient(circle at 20% 14%,rgba(255,255,255,.58),transparent 20%), radial-gradient(circle at 78% 18%,rgba(255,255,255,.38),transparent 18%), radial-gradient(circle at 55% 43%,rgba(255,255,255,.22),transparent 20%), linear-gradient(180deg,rgba(255,255,255,.1),transparent 48%,rgba(0,0,0,.2) 100%)',
};

const posterPaperStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  backgroundImage:
    'linear-gradient(90deg,rgba(0,0,0,.035) 1px,transparent 1px), linear-gradient(0deg,rgba(0,0,0,.025) 1px,transparent 1px), radial-gradient(circle at 82% 10%,rgba(255,216,74,.3),transparent 18%)',
  backgroundSize: '18px 18px, 18px 18px, auto',
};

const paperFiberStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  backgroundImage:
    'linear-gradient(90deg,rgba(255,255,255,.28) 1px,transparent 1px), linear-gradient(0deg,rgba(0,0,0,.04) 1px,transparent 1px)',
  backgroundSize: '18px 18px, 22px 22px',
};

const handNoteStyle: CSSProperties = {
  fontSize: 17,
  fontWeight: 950,
  color: '#fff',
  letterSpacing: 0,
  transform: 'rotate(-3deg)',
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
