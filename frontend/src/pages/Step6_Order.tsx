import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileFrame } from '../components/MobileFrame';
import { StatusBar } from '../components/StatusBar';
import { NavBar } from '../components/NavBar';
import { GoMark } from '../components/Atoms';
import { Photo } from '../components/Photo';
import { StreamingStatus } from '../components/StreamingStatus';
import { useApp } from '../store';
import { getOrderDraft, patchOrder, payOrder, getPickerItems, type Item as PickerItem } from '../api';

type ItemType = '交通' | '景点' | '美食' | '酒店';

interface OrderItem {
  id: string;
  type: ItemType;
  name: string;
  qty: string;
  amount: string;
  photoSeed: string;
}

const ITEMS_BY_SCENE: Record<'sz' | 'bj', OrderItem[]> = { sz: [], bj: [] };

// Pre-set demo traveler pool — combinations of Jenny / Tracy / Kevin
const PRESET_TRAVELERS: { name: string; idNo: string }[] = [
  { name: 'Jenny',  idNo: '44010119900315****' },
  { name: 'Tracy',  idNo: '11010219921028****' },
  { name: 'Kevin',  idNo: '31010319881204****' },
];

function buildTravelers(partySize: number): { name: string; idNo: string }[] {
  const base = Array.from({ length: Math.min(partySize, 3) }, (_, i) => PRESET_TRAVELERS[i]);
  const extra = Array.from({ length: Math.max(0, partySize - 3) }, (_, i) => ({
    name: `同行人 ${i + 4}`,
    idNo: '请补充证件号',
  }));
  return [...base, ...extra];
}

// Empty quick-swap options for food/hotel items shown in OrderRow. Populated
// from the order draft (or a future /api/orders/options endpoint) once wired.
const foodPackages: [label: string, amount: string][] = [];
const hotelOptions: [name: string, qty: string, amount: string, seed: string][] = [];

const typeChip: Record<ItemType, { bg: string; fg: string }> = {
  交通: { bg: '#e8f0ff', fg: '#3b82f6' },
  景点: { bg: '#e8f0ff', fg: '#3b82f6' },
  美食: { bg: '#fff1e6', fg: '#fb923c' },
  酒店: { bg: '#f1ebff', fg: '#8b5cf6' },
};
const typeBg: Record<ItemType, string> = {
  交通: 'linear-gradient(135deg,#60a5fa,#3b82f6)',
  景点: 'linear-gradient(135deg,#fbbf24,#fb923c)',
  美食: 'linear-gradient(135deg,#fb923c,#fbbf24)',
  酒店: 'linear-gradient(135deg,#a78bfa,#60a5fa)',
};

function toOrderItem(item: Record<string, unknown>): OrderItem {
  const amount = item.amountText ?? item.amount;
  const qty = item.qtyText ?? item.qty;
  return {
    id: String(item.id ?? item.name ?? Date.now()),
    type: (item.type as ItemType | undefined) ?? '景点',
    name: String(item.name ?? ''),
    qty: String(qty ?? ''),
    amount: typeof amount === 'number' ? `¥${amount}` : String(amount ?? '免费'),
    photoSeed: String(item.photoSeed ?? 'travel'),
  };
}

function toOrderPatchItem(item: OrderItem) {
  return {
    ...item,
    amountText: item.amount,
    qtyText: item.qty,
  };
}

export default function Step6_Order() {
  const nav = useNavigate();
  const { scene, identity, selectedPOIs, setPaid, setOrderId: setStoreOrderId } = useApp();
  const [paying, setPaying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [items, setItems] = useState<OrderItem[]>(() => ITEMS_BY_SCENE[scene]);
  const [pickerItems, setPickerItems] = useState<PickerItem[]>([]);
  const [travelers, setTravelers] = useState<{ name: string; idNo: string }[]>(() =>
    buildTravelers(identity.partySize),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const picksKey = Array.from(selectedPOIs).sort().join('|');

  const total = items.reduce((acc, it) => {
    const m = it.amount.match(/¥(\d+)/);
    return acc + (m ? +m[1] : 0);
  }, 0);
  // Summary pills mirror the user's Step3 picks (same source as Step4/Step5:
  // getPickerItems + selectedPOIs); fall back to the order draft items only
  // if the selection/items aren't available yet.
  const selectedPicks = pickerItems.filter((i) => selectedPOIs.has(i.id));
  const hasSelection = selectedPicks.length > 0;
  const sightCount = hasSelection
    ? selectedPicks.filter((i) => i.cat === 'sight').length
    : items.filter((i) => i.type === '景点').length;
  const foodCount = hasSelection
    ? selectedPicks.filter((i) => i.cat === 'food').length
    : items.filter((i) => i.type === '美食').length;
  const hotelCount = hasSelection
    ? selectedPicks.filter((i) => i.cat === 'hotel').length
    : items.filter((i) => i.type === '酒店').length;
  const totalStr = '¥' + total;
  const displayTotalStr = loadingDraft && items.length === 0 ? '计算中' : totalStr;

  useEffect(() => {
    let cancelled = false;
    setItems(ITEMS_BY_SCENE[scene]);
    setOrderId(null);
    setEditingId(null);
    setLoadingDraft(true);
    getOrderDraft({
      scene,
      picks: Array.from(selectedPOIs),
      travelers,
      contactPhone: '138****0023',
    })
      .then((draft) => {
        if (cancelled) return;
        setOrderId(draft.orderId);
        setStoreOrderId(draft.orderId);
        setItems(draft.items.map(toOrderItem));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingDraft(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scene, picksKey]);

  // Load picker items so the summary pills can mirror the actual Step3 picks.
  useEffect(() => {
    let cancelled = false;
    getPickerItems(scene)
      .then((its) => { if (!cancelled) setPickerItems(its); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [scene]);

  const handlePay = async () => {
    setPaying(true);
    try {
      let id = orderId;
      if (!id) {
        const draft = await getOrderDraft({
          scene,
          picks: Array.from(selectedPOIs),
          travelers,
          contactPhone: '138****0023',
        });
        id = draft.orderId;
        setOrderId(id);
        setStoreOrderId(id);
      }
      await patchOrder(id, { items: items.map(toOrderPatchItem), travelers, contactPhone: '138****0023' });
      await payOrder(id, 'wechat');
      setSuccess(true);
      setPaid(true);
    } catch {
      window.setTimeout(() => {
        setSuccess(true);
        setPaid(true);
      }, 800);
    } finally {
      setPaying(false);
    }
  };

  if (success) return <PaymentSuccess scene={scene} total={totalStr} count={items.length} onNext={() => nav('/p7')} onHome={() => nav('/')} />;

  return (
    <MobileFrame>
      <StatusBar bg="#fff" />
      <NavBar title="确认订单" />

      <div className="scroll-area" style={{ padding: '14px 14px 130px' }}>
        {/* Yellow summary card */}
        <div
          style={{
            background: 'linear-gradient(135deg,#fff8d6,#ffe7a3)',
            borderRadius: 14, padding: 14, marginBottom: 14,
          }}
        >
          <div className="h-between">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <GoMark size={28} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 800 }}>
                  {scene === 'sz' ? '深圳周末游' : '北京家庭文化游'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--mt-text-3)', marginTop: 2 }}>
                  {scene === 'sz' ? '广州 → 深圳 · 2 天 1 夜' : '河北 → 北京 · 2 天 1 夜'}
                </div>
              </div>
            </div>
            <span style={{ fontSize: 11, color: '#b88500', fontWeight: 800 }}>行程套餐</span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            <Stat label={`景点 ${sightCount}`} />
            <Stat label={`餐饮 ${foodCount}`} />
            <Stat label={`酒店 ${hotelCount}`} />
            <Stat label={`${identity.partySize} 人份`} />
          </div>
        </div>

        {/* Adjust prompt */}
        <button
          onClick={() => nav('/p3')}
          style={{
            display: 'block', width: '100%',
            background: 'rgba(255,209,0,.06)',
            border: '1px dashed var(--mt-yellow-dark)',
            borderRadius: 12, padding: 12, marginBottom: 16,
            textAlign: 'left',
          }}
        >
          <div className="h-between">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>🔄</span>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>反悔了？还可以再调整</div>
                <div className="text-tiny text-muted" style={{ marginTop: 2 }}>
                  返回挑选页增删项目，订单内容会同步更新
                </div>
              </div>
            </div>
            <span style={{ fontSize: 12.5, color: '#b88500', fontWeight: 700 }}>去调整 ›</span>
          </div>
        </button>

        {/* Travelers */}
        <div className="h-between" style={{ marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>👥 出行人</div>
            <div className="text-tiny text-muted" style={{ marginTop: 4 }}>
              已按你之前填的「{identity.partySize} 人」预填
            </div>
          </div>
          <button
            onClick={() => setTravelers((prev) => [...prev, { name: `同行人 ${prev.length + 1}`, idNo: '请补充证件号' }])}
            style={{
              padding: '8px 14px', borderRadius: 999,
              background: 'linear-gradient(135deg,#ffd84a,#f5b800)',
              fontSize: 13, fontWeight: 800, color: '#1a1a1a',
              boxShadow: '0 4px 12px rgba(245,184,0,.3)',
            }}
          >
            + 添加
          </button>
        </div>
        <div className="card" style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {travelers.map((traveler, i) => (
            <div key={`${traveler.name}-${i}`}>
              <span
                style={{
                  padding: '3px 8px', borderRadius: 4,
                  background: i === 0 ? 'var(--mt-green-soft)' : '#e8f0ff',
                  color: i === 0 ? 'var(--mt-green)' : '#3b82f6',
                  fontSize: 10.5, fontWeight: 800,
                }}
              >
                同行人 {i + 1}
              </span>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <input
                  value={traveler.name}
                  onChange={(e) => setTravelers((prev) => prev.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))}
                  style={{ flex: 1, minWidth: 0, padding: '8px 10px', background: 'var(--mt-bg)', borderRadius: 8, fontSize: 13 }}
                />
                <input
                  value={traveler.idNo}
                  onChange={(e) => setTravelers((prev) => prev.map((x, idx) => idx === i ? { ...x, idNo: e.target.value } : x))}
                  style={{ flex: 1, minWidth: 0, padding: '8px 10px', background: 'var(--mt-bg)', borderRadius: 8, fontSize: 13, color: 'var(--mt-text-3)' }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Phone */}
        <div style={{ fontSize: 13, fontWeight: 700, margin: '8px 4px 8px' }}>📞 联系电话</div>
        <div
          style={{
            padding: '12px 14px', borderRadius: 12,
            background: '#fff', boxShadow: 'var(--shadow-1)',
            fontSize: 14, marginBottom: 16,
          }}
        >
          138****0023
        </div>

        {/* Order detail */}
        <div className="h-between" style={{ margin: '8px 4px 8px' }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>📋 订单明细</div>
          <span className="text-tiny text-muted">点每项编辑</span>
        </div>
        <div className="card" style={{ padding: 0, marginBottom: 14 }}>
          {loadingDraft && items.length === 0 ? (
            <StreamingStatus
              title="正在生成订单草稿"
              compact
              style={{ margin: 12 }}
              messages={[
                '读取最终行程 POI',
                '生成可下单明细',
                '同步出行人和联系电话',
                '计算订单合计',
              ]}
            />
          ) : (
            items.map((it, i) => (
              <OrderRow
                key={it.id}
                item={it}
                last={i === items.length - 1}
                editing={editingId === it.id}
                onEdit={() => setEditingId(editingId === it.id ? null : it.id)}
                onDelete={() => setItems((prev) => prev.filter((x) => x.id !== it.id))}
                onChangePackage={(label, amount) => setItems((prev) => prev.map((x) => x.id === it.id ? { ...x, qty: label, amount } : x))}
                onChangeHotel={(name, qty, amount, seed) => setItems((prev) => prev.map((x) => x.id === it.id ? { ...x, name, qty, amount, photoSeed: seed } : x))}
              />
            ))
          )}
          <div
            style={{
              padding: '12px 14px',
              borderTop: '1px solid var(--mt-line-2)',
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            }}
          >
            <span className="text-small" style={{ color: 'var(--mt-text-2)' }}>
              合计（{identity.partySize} 人）
            </span>
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--mt-orange)' }}>{displayTotalStr}</span>
          </div>
        </div>

        {/* Guarantee */}
        <div
          style={{
            padding: 12, borderRadius: 12,
            background: 'rgba(255,209,0,.06)',
            border: '1px dashed var(--mt-yellow-dark)',
            fontSize: 12.5, color: 'var(--mt-text-2)', lineHeight: 1.7,
          }}
        >
          🛡️ 行程包内全部可独立退改 · 入园门票电子凭证发短信 · 酒店免费取消政策详见详情
        </div>
      </div>

      {/* Sticky footer */}
      <div className="footer-bar" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flexShrink: 0 }}>
          <div className="text-tiny text-muted">合计</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--mt-orange)' }}>{displayTotalStr}</div>
        </div>
        <button
          className="btn-primary"
          style={{ flex: 1, marginLeft: 4 }}
          disabled={loadingDraft || paying || items.length === 0}
          onClick={handlePay}
        >
          {loadingDraft ? '订单生成中…' : paying ? '支付中…' : `提交订单 · 支付 ${totalStr}`}
        </button>
      </div>
    </MobileFrame>
  );
}

function OrderRow({
  item, last, editing, onEdit, onDelete, onChangePackage, onChangeHotel,
}: {
  item: OrderItem;
  last?: boolean;
  editing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onChangePackage: (label: string, amount: string) => void;
  onChangeHotel: (name: string, qty: string, amount: string, seed: string) => void;
}) {
  const tc = typeChip[item.type];
  return (
    <div style={{ borderBottom: last ? 'none' : '1px solid var(--mt-line-2)' }}>
      <button
        onClick={onEdit}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 14px',
          textAlign: 'left',
        }}
      >
        <Photo seed={item.photoSeed} width={36} height={36} radius={8} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{item.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span
              style={{
                padding: '1px 6px', borderRadius: 3,
                background: tc.bg, color: tc.fg,
                fontSize: 10, fontWeight: 700,
              }}
            >
              {item.type}
            </span>
            <span className="text-tiny text-muted">{item.qty}</span>
          </div>
        </div>
        <div
          style={{
            fontSize: 14, fontWeight: 800,
            color: item.amount === '免费' ? 'var(--mt-text-3)' : 'var(--mt-orange)',
          }}
        >
          {item.amount}
        </div>
      </button>
      {editing && (
        <div style={{ padding: '0 14px 12px 62px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={onDelete} style={{ alignSelf: 'flex-start', padding: '6px 10px', borderRadius: 999, background: 'var(--mt-red-soft)', color: 'var(--mt-red)', fontSize: 12, fontWeight: 800 }}>
            删除该行程
          </button>
          {item.type === '美食' && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {foodPackages.map(([label, amount]) => (
                <button key={label} onClick={() => onChangePackage(label, amount)} style={{ padding: '6px 9px', borderRadius: 999, background: '#fff7d6', fontSize: 11.5, fontWeight: 800 }}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {item.type === '酒店' && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {hotelOptions.map(([name, qty, amount, seed]) => (
                <button key={name} onClick={() => onChangeHotel(name, qty, amount, seed)} style={{ padding: '6px 9px', borderRadius: 999, background: '#f1ebff', color: '#7c3aed', fontSize: 11.5, fontWeight: 800 }}>
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label }: { label: string }) {
  return (
    <span
      style={{
        padding: '4px 12px', borderRadius: 999,
        background: 'rgba(255,255,255,.6)',
        fontSize: 11.5, fontWeight: 700, color: 'var(--mt-text-2)',
      }}
    >
      {label}
    </span>
  );
}

/* ============== Payment success page ============== */
function PaymentSuccess({
  scene, total, count, onNext, onHome,
}: { scene: 'sz' | 'bj'; total: string; count: number; onNext: () => void; onHome: () => void }) {
  const firstStop = scene === 'bj' ? '北京南站' : '广州南站';
  const chips = scene === 'bj'
    ? [
      { icon: '✓', label: '完成 check', color: '#10b981' },
      { icon: '🚗', label: '一键打车', color: '#3b82f6' },
      { icon: '📍', label: '附近推荐', color: '#ef4444' },
      { icon: '🥖', label: '吃了嘛您', color: '#fb923c' },
    ]
    : [
      { icon: '✓', label: '完成 check', color: '#10b981' },
      { icon: '🚗', label: '一键打车', color: '#3b82f6' },
      { icon: '📍', label: '附近推荐', color: '#ef4444' },
      { icon: '🍵', label: '得闲饮茶', color: '#fb923c' },
    ];
  return (
    <MobileFrame>
      <StatusBar bg="#fff" />
      <div
        style={{
          height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#fff', flexShrink: 0, fontSize: 17, fontWeight: 700,
        }}
      >
        支付成功
      </div>
      <div
        className="scroll-area"
        style={{
          background: 'linear-gradient(180deg,#e8faf2 0%,#fff 30%)',
          padding: '20px 18px 100px',
        }}
      >
        {/* Big check */}
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <div
            style={{
              width: 88, height: 88, borderRadius: '50%',
              background: 'linear-gradient(135deg,#10b981,#059669)',
              color: '#fff', fontSize: 44, fontWeight: 800,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 12px 32px rgba(16,185,129,.35)',
              animation: 'fadeUp .45s ease',
            }}
          >
            ✓
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 16 }}>支付成功</div>
          <div className="text-small" style={{ color: 'var(--mt-text-3)', marginTop: 8 }}>
            共 {count} 项 · 合计 <b style={{ color: 'var(--mt-orange)' }}>{total}</b> · 凭证已发短信
          </div>
        </div>

        {/* Live board preview — entire card clickable to /p7 */}
        <div
          onClick={onNext}
          style={{
            marginTop: 22, borderRadius: 14, padding: 14,
            background: '#fff', boxShadow: 'var(--shadow-2)',
            cursor: 'pointer',
          }}
        >
          <div className="h-between" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <Chip>☀️ 29° 晴</Chip>
              <Chip>👕 短袖</Chip>
            </div>
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 999,
                background: 'var(--mt-red)', color: '#fff',
                fontSize: 10.5, fontWeight: 800,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
              LIVE
            </span>
          </div>

          {/* mini chart */}
          <div
            style={{
              height: 100, borderRadius: 10,
              background:
                'linear-gradient(180deg,#e0f2fe 0%,#fff 80%)',
              position: 'relative', overflow: 'hidden', marginBottom: 12,
            }}
          >
            <svg viewBox="0 0 300 100" width="100%" height="100%">
              <defs>
                <linearGradient id="psLine" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#ef4444" />
                </linearGradient>
              </defs>
              <path d="M 15 80 Q 60 78 100 70 T 180 50 T 270 32"
                stroke="url(#psLine)" strokeWidth="3" fill="none" strokeLinecap="round" />
              <circle cx="60" cy="78" r="5" fill="#10b981" />
              <circle cx="140" cy="58" r="6" fill="#3b82f6" stroke="#fff" strokeWidth="3" />
              <circle cx="270" cy="32" r="5" fill="#ef4444" />
            </svg>
          </div>

          <div className="h-between" style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: 'var(--go-grad)', color: '#fff',
                  fontSize: 10, fontWeight: 800,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                go
              </span>
              <span style={{ fontSize: 14, fontWeight: 700 }}>动态看板已就绪</span>
            </div>
            <button style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600 }}>立即查看 ›</button>
          </div>

          {/* Progress bar */}
          <div
            style={{
              height: 6, background: '#f0f1f3', borderRadius: 999, overflow: 'hidden', marginTop: 4,
            }}
          >
            <div
              style={{
                width: '8%', height: '100%',
                background: 'linear-gradient(90deg,#ffd84a,#f5b800)',
              }}
            />
          </div>
          <div className="text-tiny text-muted" style={{ marginTop: 6 }}>
            第 1 站「{firstStop}」即将开始 · 0/{count} 已完成
          </div>

          {/* Action chips */}
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            {chips.map((c) => (
              <span
                key={c.label}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '6px 10px', borderRadius: 999,
                  background: '#fff', border: '1px solid var(--mt-line)',
                  fontSize: 11.5, fontWeight: 600, color: c.color,
                }}
              >
                <span>{c.icon}</span>
                <span>{c.label}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="text-tiny text-muted" style={{ textAlign: 'center', marginTop: 16 }}>
          小tip：看板能跟着你实时走，建议把它加到桌面 Widget
        </div>
      </div>

      <div className="footer-bar" style={{ background: '#fff' }}>
        <button className="btn-primary" onClick={onNext}>
          ✨ 进入动态看板 →
        </button>
        <button
          onClick={onHome}
          style={{
            width: '100%', marginTop: 10, padding: '6px 0',
            color: 'var(--mt-text-3)', fontSize: 13,
          }}
        >
          先返回总览
        </button>
      </div>
    </MobileFrame>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        padding: '4px 9px', borderRadius: 999,
        background: 'var(--mt-bg)',
        fontSize: 11, fontWeight: 700, color: 'var(--mt-text-2)',
      }}
    >
      {children}
    </span>
  );
}
