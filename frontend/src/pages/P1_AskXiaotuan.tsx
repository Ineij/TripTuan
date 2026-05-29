import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileFrame } from '../components/MobileFrame';
import { Photo } from '../components/Photo';
import { useApp } from '../store';
import type { Scene } from '../types';
import { getHotels, getSpots, getTips, getSightDetail, getPickerItems } from '../api';

interface Hotel { name: string; rating: string; price: string; seed: string; photo?: string }
interface Tip { label: string; body: string }
interface Spot { name: string; rating: number; intro: string; seed: string; photo?: string }
interface SightDetail { icon: string; name: string; body: string }

// Pre-set user queries — one is picked at random on each page load
const USER_QUERIES: Record<Scene, string[]> = {
  sz: [
    '帮我规划广州出发的深圳两日游，想去打卡网红景点',
    '深圳周末游怎么玩？从广州出发，想轻松一点',
    '推荐深圳两天一夜行程，喜欢自然风光和美食',
    '我想周末去深圳，从广州南站出发，帮我安排行程',
  ],
  bj: [
    '帮我规划一次北京家庭文化游，两大一小',
    '北京两天一夜行程推荐，想去故宫周边的文化景点',
    '带父母去北京旅游，想看看博物馆和古迹',
    '河北出发去北京，周末两天怎么安排比较合理？',
  ],
};

// Pre-set intro text per scene
const INTRO_TEXT: Record<Scene, string> = {
  sz: '深圳适合周末短途出游，从广州出发高铁仅需33分钟。这座年轻的城市有自然公园、主题乐园和丰富的美食，节奏舒适，适合周末放松或打卡。',
  bj: '北京是中国历史与文化的中心，故宫、颐和园、胡同巷弄……两天时间足以感受到这座千年古都的气韵。从河北出发高铁约一小时，家庭出游首选。',
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

  // Data loaded from API
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [tips, setTips] = useState<Tip[]>([]);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [sightSections, setSightSections] = useState<{ period: string; items: SightDetail[] }[]>([]);
  const [candidateCount, setCandidateCount] = useState(17);
  const [userQuery, setUserQuery] = useState('');
  const intro = INTRO_TEXT[scene];

  // Pick a random user query on mount / scene change
  useEffect(() => {
    const queries = USER_QUERIES[scene];
    setUserQuery(queries[Math.floor(Math.random() * queries.length)]);
  }, [scene]);

  // Load content from API
  useEffect(() => {
    Promise.all([
      getHotels(scene),
      getTips(scene),
      getSpots(scene),
      getSightDetail(scene),
      getPickerItems(scene),
    ]).then(([apiHotels, apiTips, apiSpots, apiSightDetail, pois]) => {
      setHotels(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (apiHotels as any[]).map((h) => ({
          name: h.name,
          rating: `${h.rating} 分`,
          price: h.price ? `¥${Math.round(h.price)}/晚` : '',
          seed: h.name,
          photo: h.photo || '',
        })),
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setTips((apiTips as any[]).map((t) => ({ label: t.title || t.label || '', body: t.body || '' })));
      setSpots(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (apiSpots as any[]).map((s) => ({
          name: s.name,
          rating: s.rating,
          intro: s.intro || s.area || '',
          seed: s.name,
          photo: s.photo || '',
        })),
      );
      setSightSections(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (apiSightDetail as any[]).slice(0, 6).map((sec) => ({
          period: sec.period,
          items: (sec.items || []).slice(0, 3),
        })),
      );
      const poiCount = pois.filter((p) => p.cat !== 'transport').length;
      setCandidateCount(poiCount > 0 ? poiCount : 17);
    }).catch(() => undefined);
  }, [scene]);

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
          {(['sz', 'bj'] as Scene[]).map((s) => {
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
                {s === 'sz' ? '🚄 场景A · 单人广州→深圳' : '✈️ 场景B · 家庭河北→北京'}
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
              {userQuery}
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
                  {['根据需求生成定制化方案', '完成行程信息收集', `正在查询${scene === 'sz' ? '深圳' : '北京'}的旅行信息`].map((t, i) => (
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
                          <Photo seed={p.seed} src={p.photo} height={86} radius={0}>
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
                    seed={scene === 'sz' ? 'sz-landmark' : 'bj-forbidden-city'}
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
                      <span>{spots[0]?.name ?? ''}</span>
                      <span style={{ color: '#fbbf24' }}>
                        ★ {spots[0]?.rating ?? ''}
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
                    <div>📍 区域：{hotels[0]?.name ?? ''}</div>
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
                        <Photo seed={h.seed} src={h.photo} height={88} radius={0}>
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
                    攻略很多但还要自己挑？我帮你把上面 {candidateCount}+ 个景点 / 美食 / 酒店整理好，按你的同行人和偏好做精细化重排，一键下单不用比来比去。
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
