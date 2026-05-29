import { Link } from 'react-router-dom';

/** User persona / profile page. */
export default function Kevin() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(1000px 500px at 20% 10%, #2f3540 0%, #1a1c22 60%)',
        color: '#fff',
        padding: '50px 40px 80px',
      }}
    >
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <Link
          to="/"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            color: '#a8acb6', textDecoration: 'none', fontSize: 13, marginBottom: 20,
          }}
        >
          ‹ 返回总览
        </Link>

        {/* Hero */}
        <div
          style={{
            background: 'rgba(255,255,255,.05)',
            border: '1px solid rgba(255,255,255,.1)',
            borderRadius: 20,
            padding: 28,
            display: 'flex', gap: 24, alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <div
            style={{
              width: 88, height: 88, borderRadius: '50%',
              background: 'linear-gradient(135deg,#fbbf24,#fb923c)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 38, flexShrink: 0,
            }}
          >
            👨‍💼
          </div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>Kevin · 34 岁</div>
            <div style={{ fontSize: 13, color: '#a8acb6', marginBottom: 10 }}>
              深圳南山 · 互联网产品经理 · 已婚 · 一女 7 岁
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['决策型', '价格敏感', '注重家庭', '热衷打卡', '懒得做攻略'].map((t) => (
                <span
                  key={t}
                  style={{
                    padding: '4px 10px', borderRadius: 999,
                    background: 'rgba(255,209,0,.15)', border: '1px solid rgba(255,209,0,.3)',
                    fontSize: 11.5, fontWeight: 600, color: '#ffd84a',
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Cards grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <PersonaCard
            title="🎯 目标"
            items={[
              '想给爸妈和女儿安排一次轻松的家庭游',
              '不愿意花一整周做攻略',
              '希望「下单一次解决所有问题」',
            ]}
          />
          <PersonaCard
            title="😫 痛点"
            items={[
              '景点 / 美食 / 酒店分别在不同 App，跳来跳去',
              '攻略多但散，老人/小孩很难兼顾',
              '行程当天才发现景点要预约',
              '排队 + 等位太累，老人孩子吃不消',
            ]}
          />
          <PersonaCard
            title="💛 期望"
            items={[
              '一次性帮我搞定所有 → 「一键下单」',
              '出发后还能根据实时情况调整 → 「动态看板」',
              '帮我避开排队和走不动的路线',
              '回来还能一键生成朋友圈',
            ]}
          />
          <PersonaCard
            title="📱 设备 / 习惯"
            items={[
              '主要在美团 App + 大众点评里完成消费',
              '会用支付宝、滴滴，但更信任美团的「打包券」',
              '老婆负责吃，他负责行程，女儿负责开心',
            ]}
          />
        </div>

        {/* Quote */}
        <div
          style={{
            marginTop: 32, padding: '24px 28px',
            background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)',
            borderRadius: 16,
            fontStyle: 'italic', fontSize: 15, lineHeight: 1.7, color: '#d4d7dd',
          }}
        >
          "我不想自己当导游，但又怕被千篇一律的跟团游绑死。
          能不能有个东西，问几句就给我搞定，路上还能帮我应对老人累了、孩子闹了——这样我也能<b style={{ color: '#ffd84a' }}>当一回甩手掌柜</b>。"
        </div>
      </div>
    </div>
  );
}

function PersonaCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,.05)',
        border: '1px solid rgba(255,255,255,.1)',
        borderRadius: 14, padding: 18,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: '#c8ccd2' }}>
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}
