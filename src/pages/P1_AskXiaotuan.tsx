import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileFrame } from '../components/MobileFrame';
import { Photo } from '../components/Photo';
import { useApp } from '../store';
import type { Scene } from '../types';

interface Hotel { name: string; rating: string; price: string; seed: string }
interface Tip { label: string; body: string }
interface Spot { name: string; rating: number; intro: string; seed: string }
interface SightDetail { icon: string; name: string; body: string }

const HOTELS: Record<Scene, Hotel[]> = {
  hk: [
    { name: '香港君怡酒店', rating: '4.8 分', price: '¥1167 起', seed: 'hk-hotel-bp' },
    { name: '香港九龙酒店', rating: '4.8 分', price: '¥1012 起', seed: 'hk-hotel-kowloon' },
    { name: '香港皇家太平洋', rating: '4.9 分', price: '¥1380 起', seed: 'hk-hotel-royal' },
  ],
  bj: [
    { name: '王府井希尔顿',   rating: '4.8 分', price: '¥1280 起', seed: 'bj-hotel-hilton' },
    { name: '北京前门建国',   rating: '4.7 分', price: '¥980 起',  seed: 'bj-hotel-qianmen' },
    { name: '北京饭店',       rating: '4.9 分', price: '¥1620 起', seed: 'bj-hotel-grand' },
  ],
};

const TIPS: Record<Scene, Tip[]> = {
  hk: [
    { label: '证件准备',   body: '从深圳前往香港需要港澳通行证和有效签注，请提前确认证件有效' },
    { label: '货币兑换',   body: '香港使用港币，建议提前兑换或在当地 ATM 取现，大部分商家支持支付宝、微信支付' },
    { label: '交通卡',     body: '建议购买八达通卡，方便乘坐地铁、巴士和轮渡' },
    { label: '天气准备',   body: '5 月香港天气炎热，建议携带防晒霜、遮阳帽和墨镜，同时准备轻便外套应对室内空调' },
    { label: '迪士尼门票', body: '建议提前在美团上预订迪士尼门票，避免现场排队' },
    { label: '购物退税',   body: '香港为免税港，购物无需退税，但请注意部分商品可能有进口限制' },
  ],
  bj: [
    { label: '门票预约', body: '故宫、天安门、国家博物馆均需要提前在官方平台或美团预约，老人小孩用身份证实名' },
    { label: '交通建议', body: '景点之间地铁最方便，二环内打车也便宜，老人多走平路少爬楼' },
    { label: '老人友好', body: '带老人优先选择有电梯 / 平路的景点，故宫推荐租用语音讲解器' },
    { label: '小孩准备', body: '带遮阳帽、补水水杯、小零食，故宫和颐和园园区较大，准备婴儿车更省力' },
    { label: '美食提示', body: '王府井、南锣鼓巷小吃多但贵，建议老北京胡同里的本地店性价比更高' },
    { label: '雨天预案', body: '周日有小雨，可改去国家博物馆 / 中国科技馆等室内景点' },
  ],
};

const USER_QUERY: Record<Scene, string> = {
  hk: '给我推荐香港周末旅行',
  bj: '一家四口想去北京玩两天',
};

const INTRO: Record<Scene, string> = {
  hk:
    '小团已经为您准备了一份精彩的香港周末漫游攻略！5 月 23–24 日 · 周六晴 29°、周日多云 33°，非常适合出游。这份行程将带您体验香港的经典地标、美食文化和购物乐趣，节奏张弛有度，既有都市繁华也有海滨悠闲。',
  bj:
    '小团为您整理了一份北京 2 天 1 夜的家庭文化游攻略！5 月 23–24 日 · 周六晴 26°、周日小雨 22°，注意带伞。这份行程兼顾老人和孩子的节奏，从天安门升旗到颐和园泛舟，慢节奏深度体验。',
};

const SPOTS: Record<Scene, Spot[]> = {
  hk: [
    { name: '维多利亚港',     rating: 4.7, intro: '世界级天然良港，白天碧海蓝天与摩登楼群同框，夜景璀璨迷人', seed: 'victoria-harbour' },
    { name: '太平山顶',       rating: 4.8, intro: '俯瞰维港全景，山顶缆车独特，凌霄阁摩天台 360° 无遮挡', seed: 'victoria-peak' },
    { name: '香港迪士尼乐园', rating: 4.9, intro: '全球唯二「迷离庄园」就在这里，城堡翻新后更梦幻', seed: 'hk-disneyland' },
    { name: '西九艺术公园',   rating: 4.3, intro: '海滨草坪 + 艺术装置随手拍，都市绿洲', seed: 'west-kowloon-park' },
    { name: '星光大道',       rating: 4.0, intro: '夜幕下漫步海滨长廊，灯光秀倒映水面，电影感十足', seed: 'avenue-of-stars' },
  ],
  bj: [
    { name: '天安门广场',   rating: 4.9, intro: '看升旗仪式，国家地标，孩子开眼界', seed: 'bj-tiananmen' },
    { name: '故宫博物院',   rating: 4.8, intro: '中轴线游览，午门→太和殿→御花园', seed: 'bj-forbidden-city' },
    { name: '颐和园',       rating: 4.7, intro: '皇家园林，可坐船赏景，老人友好', seed: 'bj-summer-palace' },
    { name: '王府井步行街', rating: 4.5, intro: '小吃 + 大商场，老人买茶叶孩子买冰淘儿', seed: 'bj-wangfujing' },
    { name: '什刹海',       rating: 4.4, intro: '胡同 + 酒吧，傍晚漫步最有北京味', seed: 'bj-shichahai' },
  ],
};

const SIGHTS_DETAIL: Record<Scene, { period: string; items: SightDetail[] }[]> = {
  hk: [
    { period: '下午', items: [
      { icon: '⛺', name: '天星小轮码头', body: '复古绿白渡轮穿梭维港，二层露天座位吹海风超 chill！码头旁钟楼打卡超有港味。开放时间 18:30-20:30。' },
      { icon: '🏕', name: '太平山顶',     body: '俯瞰维港全景的绝佳观景台，山顶缆车体验独特，凌霄阁摩天台 360° 无遮挡。山顶广场 3 楼平台为免费观景点。建议 2-3 小时，缆车 7:00-24:00。' },
    ] },
    { period: '晚上', items: [
      { icon: '🏕', name: '星光大道', body: '夜幕下漫步海滨长廊，指尖划过明星掌印，维港灯光秀倒映水面，随手拍都是电影感大片！记得找李小龙铜像合影。建议 2-3 小时。' },
    ] },
    { period: '晚餐', items: [
      { icon: '🍴', name: '避风塘炒蟹', body: '香港经典海鲜美食，蒜香浓郁，蟹肉鲜美，搭配啤酒风味更佳' },
      { icon: '🍴', name: '港式烧味',   body: '推荐烧鹅、叉烧等经典港式烧味，皮脆肉嫩，回味无穷' },
    ] },
  ],
  bj: [
    { period: '上午', items: [
      { icon: '🏕', name: '天安门广场', body: '提前 1 小时到达观看升旗仪式，老人小孩一起感受庄严气氛。建议 1-2 小时。' },
      { icon: '🏕', name: '故宫博物院', body: '中轴线游览，午门→太和殿→御花园，全程平路推车友好。建议 2-3 小时，提前预约门票。' },
    ] },
    { period: '下午', items: [
      { icon: '🏕', name: '颐和园',     body: '皇家园林，可坐船赏景，老人友好。万寿山看夕阳特别美。' },
    ] },
    { period: '晚餐', items: [
      { icon: '🍴', name: '全聚德烤鸭', body: '北京全聚德老字号，烤鸭+鸭三吃+小菜套餐，孩子也喜欢' },
    ] },
  ],
};

/* ============ phase machine ============
 * 0  user msg
 * 1  thinking section + 3 checks animating in
 * 2  intro paragraph streaming
 * 3  行程概览 header + content
 * 4  必玩景点 list (5 items streaming in)
 * 5  景点详情 sections (period + items animating in)
 * 6  photo card
 * 7  住宿方案 section
 * 8  hotel cards row
 * 9  小贴士 (6 items)
 * 10 go bot card + floating CTA
 */
type Phase = number;

export default function P1_AskXiaotuan() {
  const nav = useNavigate();
  const { scene, setScene } = useApp();
  const [phase, setPhase] = useState<Phase>(0);
  const [thinkOpen, setThinkOpen] = useState(true);
  const [checks, setChecks] = useState(0);
  const [introChars, setIntroChars] = useState(0);
  const [spotsRevealed, setSpotsRevealed] = useState(0);
  const [sightSectionsRevealed, setSightSectionsRevealed] = useState(0);
  const [tipsRevealed, setTipsRevealed] = useState(0);
  const [showCTA, setShowCTA] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);

  const hotels = HOTELS[scene];
  const tips = TIPS[scene];
  const intro = INTRO[scene];
  const spots = SPOTS[scene];
  const sightSections = SIGHTS_DETAIL[scene];

  /* sequencer */
  useEffect(() => {
    // reset on scene switch
    setPhase(0); setChecks(0); setIntroChars(0);
    setSpotsRevealed(0); setSightSectionsRevealed(0); setTipsRevealed(0); setShowCTA(false);

    const tos: number[] = [];
    // P0 → P1 (thinking)
    tos.push(window.setTimeout(() => setPhase(1), 350));
    // 3 checks in sequence
    tos.push(window.setTimeout(() => setChecks(1), 800));
    tos.push(window.setTimeout(() => setChecks(2), 1500));
    tos.push(window.setTimeout(() => setChecks(3), 2300));
    // P1 → P2 (intro streaming starts)
    tos.push(window.setTimeout(() => setPhase(2), 2900));
    return () => tos.forEach(window.clearTimeout);
  }, [scene]);

  /* stream intro char-by-char, slowly with longer pauses on punctuation */
  useEffect(() => {
    if (phase !== 2) return;
    let i = 0;
    let active = true;
    const tick = () => {
      if (!active) return;
      i += 1;
      setIntroChars(i);
      if (i >= intro.length) {
        // finished — advance to phase 3 after a beat
        window.setTimeout(() => setPhase(3), 700);
        return;
      }
      const ch = intro[i - 1];
      const isPunct = /[，。！？；：、]/.test(ch);
      const delay = isPunct ? 240 : 55;
      window.setTimeout(tick, delay);
    };
    window.setTimeout(tick, 0);
    return () => { active = false; };
  }, [phase, intro]);

  /* phase 3+ — section appears with delays */
  useEffect(() => {
    if (phase < 3) return;
    const tos: number[] = [];
    // 必玩景点 list reveals 5 items one by one
    if (phase === 3) {
      [400, 900, 1450, 2050, 2700, 3400].forEach((d, i) => {
        tos.push(window.setTimeout(() => setSpotsRevealed(i + 1), d));
      });
      tos.push(window.setTimeout(() => setPhase(4), 4400));
    } else if (phase === 4) {
      // sight detail sections reveal one by one
      sightSections.forEach((_, i) => {
        tos.push(window.setTimeout(() => setSightSectionsRevealed(i + 1), 700 * (i + 1)));
      });
      tos.push(window.setTimeout(() => setPhase(5), 700 * (sightSections.length + 1)));
    } else if (phase === 5) {
      tos.push(window.setTimeout(() => setPhase(6), 700));
    } else if (phase === 6) {
      tos.push(window.setTimeout(() => setPhase(7), 900));
    } else if (phase === 7) {
      // tips animate in one by one
      tips.forEach((_, i) => {
        tos.push(window.setTimeout(() => setTipsRevealed(i + 1), 250 * (i + 1)));
      });
      tos.push(window.setTimeout(() => setPhase(8), 250 * tips.length + 600));
    } else if (phase === 8) {
      tos.push(window.setTimeout(() => setShowCTA(true), 500));
    }
    return () => tos.forEach(window.clearTimeout);
  }, [phase, sightSections.length, tips.length]);

  /* smooth auto-scroll on content growth */
  useEffect(() => {
    if (!scroller.current) return;
    requestAnimationFrame(() => {
      scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
    });
  }, [phase, checks, introChars, spotsRevealed, sightSectionsRevealed, tipsRevealed, showCTA]);

  return (
    <MobileFrame>
      <div style={{ background: '#fff', display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
        {/* status bar */}
        <div className="status-bar" style={{ background: '#fff' }}>
          <span>15:09</span>
          <span className="right">
            <span className="signal" />
            <span style={{ fontSize: 11, fontWeight: 600 }}>5G</span>
            <span className="battery" />
          </span>
        </div>

        {/* header */}
        <div
          style={{
            height: 50, display: 'flex', alignItems: 'center', padding: '0 14px',
            background: '#fff', flexShrink: 0,
          }}
        >
          <button
            onClick={() => nav('/')}
            style={{
              width: 36, height: 36, borderRadius: '50%', background: '#f5f6f8',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, color: '#1a1a1a',
            }}
          >
            ‹
          </button>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 22, height: 22, borderRadius: '50%',
                background: 'conic-gradient(from 90deg,#fbbf24,#f472b6,#a78bfa,#60a5fa,#34d399,#fbbf24)',
              }}
            />
            <span style={{ fontSize: 17, fontWeight: 600 }}>小团</span>
          </div>
          <button
            style={{
              width: 36, height: 36, borderRadius: '50%', background: '#f5f6f8',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, color: '#1a1a1a',
            }}
          >
            ≡
          </button>
        </div>

        {/* scene tabs */}
        <div style={{ padding: '6px 14px 12px', display: 'flex', gap: 8, background: '#fff', flexShrink: 0 }}>
          {(['hk', 'bj'] as Scene[]).map((s) => {
            const active = scene === s;
            return (
              <button
                key={s}
                onClick={() => setScene(s)}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 999,
                  background: active ? 'var(--go-grad)' : '#f5f6f8',
                  color: active ? '#fff' : '#4a4a4a',
                  fontSize: 11.5, fontWeight: 600,
                  border: active ? 'none' : '1px solid #ececec',
                  boxShadow: active ? '0 2px 8px rgba(124,58,237,.25)' : 'none',
                }}
              >
                {s === 'hk' ? '🚄 场景A · 单人深圳→香港' : '✈️ 场景B · 家庭河北→北京'}
              </button>
            );
          })}
        </div>

        {/* scroll area */}
        <div ref={scroller} className="scroll-area" style={{ background: '#fff', padding: '0 14px 110px' }}>
          {/* user message */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <div
              className="fade-up"
              style={{
                maxWidth: '78%',
                padding: '10px 14px',
                background: '#e8f0ff',
                color: '#1a1a1a',
                borderRadius: '16px 4px 16px 16px',
                fontSize: 14, lineHeight: 1.5,
              }}
            >
              {USER_QUERY[scene]}
            </div>
          </div>

          {/* thinking section */}
          {phase >= 1 && (
            <div className="fade-up" style={{ marginBottom: 14 }}>
              <button
                onClick={() => setThinkOpen((v) => !v)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 13, color: 'var(--mt-text-3)', fontWeight: 600,
                }}
              >
                {phase === 1 ? (
                  <>
                    <Spinner /> 分析中…
                  </>
                ) : (
                  <>
                    ✓ 已完成分析 <span style={{ fontSize: 10 }}>{thinkOpen ? '∧' : '∨'}</span>
                  </>
                )}
              </button>
              {thinkOpen && (
                <div
                  style={{
                    marginTop: 8, padding: 12, borderRadius: 12,
                    background: 'rgba(124,58,237,.06)',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--mt-text-2)', marginBottom: 8 }}>
                    {phase === 1 ? '正在完成酒旅相关信息查询' : '已完成酒旅相关信息查询'}{' '}
                    <span style={{ fontSize: 10, fontWeight: 500 }}>∨</span>
                  </div>
                  {['根据需求生成定制化方案', '完成行程信息收集', `正在查询${scene === 'hk' ? '香港' : '北京'}的旅行信息`].map((t, i) => (
                    <ThinkRow key={i} text={t} done={checks > i} active={checks === i && phase === 1} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* intro streaming + everything below */}
          {phase >= 2 && (
            <>
              <div
                style={{
                  fontSize: 14, lineHeight: 1.9, color: 'var(--mt-text)',
                  marginBottom: 18, whiteSpace: 'pre-wrap',
                }}
              >
                {intro.slice(0, introChars)}
                {phase === 2 && (
                  <span
                    style={{
                      display: 'inline-block', width: 8, height: 16,
                      background: 'var(--mt-text)', marginLeft: 2,
                      verticalAlign: 'middle',
                      animation: 'pulse 1s infinite',
                    }}
                  />
                )}
              </div>

              {/* 行程概览 + 必玩景点 */}
              {phase >= 3 && (
                <>
                  <SectionTitle emoji="📋">行程概览</SectionTitle>
                  <div className="fade-up" style={{ fontSize: 14, lineHeight: 1.85, color: 'var(--mt-text-2)', marginBottom: 12 }}>
                    建议游玩时间：2 天 1 夜周末游
                  </div>
                  <div className="fade-up" style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
                    必玩景点：
                  </div>
                  <ol style={{ paddingLeft: 0, listStyle: 'none', margin: 0, marginBottom: 12 }}>
                    {spots.slice(0, spotsRevealed).map((p, i) => (
                      <li
                        key={p.name}
                        className="fade-up"
                        style={{
                          fontSize: 13.5, lineHeight: 1.85, color: 'var(--mt-text-2)',
                          marginBottom: 4,
                        }}
                      >
                        {i + 1}、<b style={{ color: 'var(--mt-text)' }}>{p.name}</b>{' '}
                        <span style={{ color: 'var(--mt-orange)', fontWeight: 700 }}>{p.rating}</span> — {p.intro}
                      </li>
                    ))}
                  </ol>

                  {/* horizontal photo scroll for visible spots */}
                  {spotsRevealed > 0 && (
                    <div
                      className="fade-up"
                      style={{
                        display: 'flex', gap: 10, overflowX: 'auto',
                        margin: '0 -14px 14px', padding: '4px 14px 12px',
                      }}
                    >
                      {spots.slice(0, spotsRevealed).map((p, i) => (
                        <div
                          key={p.name}
                          style={{
                            flexShrink: 0, width: 130,
                            background: '#fff', borderRadius: 12,
                            boxShadow: 'var(--shadow-1)',
                            overflow: 'hidden',
                            animationDelay: `${i * 50}ms`,
                          }}
                          className="fade-up"
                        >
                          <Photo seed={p.seed} height={86} radius={0}>
                            <div
                              style={{
                                position: 'absolute', top: 6, left: 6,
                                padding: '2px 7px', borderRadius: 4,
                                background: 'rgba(0,0,0,.55)', color: '#fff',
                                fontSize: 9.5, fontWeight: 700,
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                              }}
                            >
                              📷 实拍
                            </div>
                            <div
                              style={{
                                position: 'absolute', top: 6, right: 6,
                                padding: '2px 7px', borderRadius: 4,
                                background: 'rgba(0,0,0,.55)', color: '#fbbf24',
                                fontSize: 10, fontWeight: 800,
                              }}
                            >
                              ★ {p.rating}
                            </div>
                            <div
                              style={{
                                position: 'absolute', left: 0, right: 0, bottom: 0,
                                padding: '4px 8px 6px',
                                background: 'linear-gradient(180deg,transparent,rgba(0,0,0,.65))',
                                color: '#fff',
                                fontSize: 12, fontWeight: 700,
                              }}
                            >
                              {p.name}
                            </div>
                          </Photo>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* 景点详情按时段 */}
              {phase >= 4 &&
                sightSections.slice(0, sightSectionsRevealed).map((sec) => (
                  <div key={sec.period} className="fade-up" style={{ marginTop: 16 }}>
                    {sec.period !== sightSections[0]?.period && (
                      <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>{sec.period}</div>
                    )}
                    {sec.items.map((it) => (
                      <div key={it.name} style={{ marginBottom: 12 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 14.5, fontWeight: 700 }}>
                          <span>{it.icon}</span>
                          <span>{it.name}</span>
                          <span style={{ color: 'var(--mt-text-3)', fontSize: 13, marginLeft: 2 }}>›</span>
                        </div>
                        <div style={{ fontSize: 13.5, color: 'var(--mt-text-2)', lineHeight: 1.85, marginTop: 4 }}>
                          {it.body}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}

              {/* spotlight photo card */}
              {phase >= 5 && (
                <div className="fade-up" style={{ margin: '14px 0' }}>
                  <Photo
                    seed={scene === 'hk' ? 'hk-disneyland' : 'bj-forbidden-city'}
                    height={150}
                    radius={14}
                  >
                    <div
                      style={{
                        position: 'absolute', top: 8, left: 8,
                        padding: '4px 10px', borderRadius: 6,
                        background: 'rgba(0,0,0,.55)', color: '#fff',
                        fontSize: 11, fontWeight: 700,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      📷 高清实拍
                    </div>
                    <div
                      style={{
                        position: 'absolute', left: 10, bottom: 10,
                        padding: '5px 12px', borderRadius: 8,
                        background: 'rgba(0,0,0,.6)', color: '#fff',
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        fontSize: 13, fontWeight: 700,
                      }}
                    >
                      <span>{scene === 'hk' ? '香港迪士尼乐园' : '故宫博物院'}</span>
                      <span style={{ color: '#fbbf24' }}>
                        ★ {scene === 'hk' ? '4.9' : '4.8'}
                      </span>
                    </div>
                  </Photo>
                </div>
              )}

              {/* 住宿方案 */}
              {phase >= 6 && (
                <div className="fade-up">
                  <SectionTitle emoji="🏠">住宿方案</SectionTitle>
                  <div style={{ fontSize: 13.5, color: 'var(--mt-text-2)', lineHeight: 1.95, marginBottom: 12 }}>
                    <div>⏰ 时间：2026-05-23 入住，2026-05-24 离店</div>
                    <div>📍 区域：{scene === 'hk' ? '香港 · 尖沙咀' : '北京 · 王府井'}</div>
                    <div style={{ marginTop: 6 }}>
                      <b>推荐理由：</b>
                      {scene === 'hk'
                        ? '购物天堂，海港城、DFS 环球免税店汇聚全球知名品牌；维港美景，星光大道、维多利亚港夜景璀璨；交通便利，地铁尖沙咀站连接荃湾线，轻松前往主要区域。'
                        : '紫禁城脚下，地铁 1/5 号线交汇，去故宫天安门步行可达；周边餐饮丰富，对带老人小孩家庭非常友好。'}
                    </div>
                  </div>
                </div>
              )}

              {/* hotel cards */}
              {phase >= 7 && (
                <div className="fade-up">
                  <div className="h-between" style={{ marginBottom: 10 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700 }}>
                      此区域为你推荐了 <b style={{ color: 'var(--mt-orange)' }}>{hotels.length}</b> 个酒店
                    </span>
                    <span style={{ fontSize: 12.5, color: 'var(--go-purple)', fontWeight: 600 }}>
                      更多酒店 ›
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, margin: '0 -14px 18px', padding: '0 14px 8px' }}>
                    {hotels.map((h) => (
                      <div
                        key={h.name}
                        style={{
                          flexShrink: 0, width: 140,
                          background: '#fff', borderRadius: 12,
                          boxShadow: 'var(--shadow-1)',
                          overflow: 'hidden',
                        }}
                      >
                        <Photo seed={h.seed} height={88} radius={0}>
                          <div
                            style={{
                              position: 'absolute', top: 6, left: 6,
                              padding: '2px 7px', borderRadius: 4,
                              background: 'rgba(0,0,0,.55)', color: '#fff',
                              fontSize: 9.5, fontWeight: 700,
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                            }}
                          >
                            📷 实拍
                          </div>
                          <div
                            style={{
                              position: 'absolute', top: 6, right: 6,
                              padding: '2px 7px', borderRadius: 4,
                              background: 'rgba(0,0,0,.55)', color: '#fbbf24',
                              fontSize: 10, fontWeight: 800,
                            }}
                          >
                            ★ {h.rating.split(' ')[0]}
                          </div>
                        </Photo>
                        <div style={{ padding: '8px 10px 10px' }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700 }}>{h.name}</div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                            <span style={{ fontSize: 11, color: 'var(--mt-orange)', fontWeight: 700 }}>{h.rating}</span>
                            <span style={{ fontSize: 11, color: 'var(--mt-orange)', fontWeight: 700 }}>{h.price}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* tips */}
              {phase >= 8 && (
                <>
                  <SectionTitle emoji="🛎️">小贴士</SectionTitle>
                  <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {tips.slice(0, tipsRevealed).map((t, i) => (
                      <li
                        key={i}
                        className="fade-up"
                        style={{
                          fontSize: 13.5, lineHeight: 1.75, color: 'var(--mt-text-2)',
                        }}
                      >
                        <b style={{ color: 'var(--mt-text)' }}>{i + 1}、{t.label}：</b>
                        {t.body}
                      </li>
                    ))}
                  </ol>
                </>
              )}

              {/* go bot card */}
              {showCTA && (
                <div
                  className="fade-up"
                  style={{
                    marginTop: 18,
                    background: 'linear-gradient(135deg,#fff8d6 0%, #f1ebff 100%)',
                    border: '1px solid rgba(124,58,237,.15)',
                    borderRadius: 16,
                    padding: 14,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span className="go-mark">go</span>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>👋 我是小go，接管下一步</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--mt-text-2)', lineHeight: 1.7 }}>
                    攻略很多但还要自己挑？我帮你把上面 17+ 个景点 / 美食 / 酒店整理好，按你的同行人和偏好做精细化重排，一键下单不用比来比去。
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Floating CTA bubble — bouncy */}
        {showCTA && (
          <button
            ref={ctaRef}
            onClick={() => {
              // press-feedback: ripple + scale down briefly, then navigate
              ctaRef.current?.animate(
                [{ transform: 'scale(.94)' }, { transform: 'scale(1)' }],
                { duration: 200, easing: 'ease-out' },
              );
              window.setTimeout(() => nav('/p2'), 160);
            }}
            style={{
              position: 'absolute', right: 14, bottom: 70,
              padding: '12px 18px', borderRadius: 999,
              background: 'linear-gradient(90deg,#ffd84a,#f5b800)',
              color: '#1a1a1a',
              fontSize: 14, fontWeight: 800,
              display: 'inline-flex', alignItems: 'center', gap: 8,
              boxShadow: '0 8px 24px rgba(245,184,0,.45)',
              zIndex: 20,
              animation: 'ctaBounce .7s cubic-bezier(.34,1.56,.64,1)',
            }}
          >
            <span
              style={{
                width: 22, height: 22, borderRadius: '50%',
                background: 'var(--go-grad)', color: '#fff',
                fontSize: 10, fontWeight: 800,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              go
            </span>
            现在就出发 →
          </button>
        )}

        {/* Input bar */}
        <div
          className="footer-bar"
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff' }}
        >
          <button
            style={{
              padding: '7px 12px', borderRadius: 999,
              background: 'rgba(124,58,237,.12)', color: 'var(--go-purple)',
              fontSize: 12, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: 4,
              flexShrink: 0,
            }}
          >
            ✨ 深度思考
          </button>
          <div
            style={{
              flex: 1, background: 'var(--mt-bg)', borderRadius: 22,
              height: 36, display: 'flex', alignItems: 'center',
              padding: '0 14px', fontSize: 13, color: 'var(--mt-text-3)',
            }}
          >
            发消息或按住说话
          </div>
          <button
            style={{
              width: 36, height: 36, borderRadius: '50%', background: 'var(--mt-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, color: 'var(--mt-text-2)',
              flexShrink: 0,
            }}
          >
            ✏️
          </button>
        </div>
      </div>
    </MobileFrame>
  );
}

function SectionTitle({ emoji, children }: { emoji: string; children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 16, fontWeight: 800, margin: '14px 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
      <span>{emoji}</span>
      <span>{children}</span>
    </div>
  );
}

function ThinkRow({ text, done, active }: { text: string; done: boolean; active: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
      <span
        style={{
          width: 16, height: 16, borderRadius: '50%',
          background: done ? 'var(--mt-green)' : 'transparent',
          color: '#fff', fontSize: 11, fontWeight: 800,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: done ? 'none' : '1.5px solid var(--mt-text-4)',
          flexShrink: 0,
        }}
      >
        {done ? '✓' : active ? <Spinner small /> : ''}
      </span>
      <span style={{ color: done ? 'var(--mt-text-2)' : 'var(--mt-text-3)' }}>{text}</span>
    </div>
  );
}

function Spinner({ small }: { small?: boolean }) {
  const size = small ? 10 : 12;
  return (
    <span
      style={{
        display: 'inline-block',
        width: size, height: size, borderRadius: '50%',
        border: '2px solid rgba(124,58,237,.25)',
        borderTopColor: 'var(--go-purple)',
        animation: 'spin .8s linear infinite',
      }}
    />
  );
}
