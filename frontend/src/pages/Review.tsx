import { useState } from 'react';
import { Link } from 'react-router-dom';

interface Comment {
  id: string;
  type: 'interact' | 'bug' | 'suggest' | 'intent';
  text: string;
  page: string;
}

const typeMeta: Record<Comment['type'], { label: string; color: string }> = {
  interact: { label: '交互', color: '#3b82f6' },
  bug: { label: '问题', color: '#ef4444' },
  suggest: { label: '建议', color: '#f59e0b' },
  intent: { label: '设计意图', color: '#6b7280' },
};

const initial: Comment[] = [
  { id: '1', type: 'intent', page: '/p1', text: '问小团对话页是入口，强调「自然语言 → 结构化偏好」的转化感。' },
  { id: '2', type: 'suggest', page: '/p3', text: '勾选卡片增加「价格 / 排队 / 时长」三件套，让用户一眼判断。' },
  { id: '3', type: 'interact', page: '/p7', text: '看板在用户停留后自然弹出附近推荐，避免打扰主动操作。' },
];

export default function Review() {
  const [comments, setComments] = useState<Comment[]>(initial);
  const [filter, setFilter] = useState<Comment['type'] | 'all'>('all');
  const [text, setText] = useState('');
  const [type, setType] = useState<Comment['type']>('suggest');
  const [page, setPage] = useState('/p1');

  const filtered = filter === 'all' ? comments : comments.filter((c) => c.type === filter);

  const submit = () => {
    if (!text.trim()) return;
    setComments((prev) => [
      ...prev,
      { id: String(Date.now()), type, text: text.trim(), page },
    ]);
    setText('');
  };

  const remove = (id: string) => setComments((prev) => prev.filter((c) => c.id !== id));

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#1a1c22',
        color: '#fff',
        padding: '40px 32px 80px',
      }}
    >
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <Link
          to="/"
          style={{ color: '#a8acb6', textDecoration: 'none', fontSize: 13 }}
        >
          ‹ 返回总览
        </Link>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, margin: '12px 0 6px' }}>
          <div style={{ fontSize: 26, fontWeight: 800 }}>📝 设计评审</div>
          <div style={{ fontSize: 12, color: '#6c707a' }}>Design Review · 共 {comments.length} 条</div>
        </div>
        <div style={{ fontSize: 13, color: '#a8acb6', marginBottom: 28 }}>
          每个页面都可以打交互意见、bug、建议或注释「设计意图」。注释保存在本地。
        </div>

        {/* Filter */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {(['all', 'interact', 'bug', 'suggest', 'intent'] as const).map((t) => {
            const active = filter === t;
            const c = t === 'all' ? '#fff' : typeMeta[t].color;
            return (
              <button
                key={t}
                onClick={() => setFilter(t)}
                style={{
                  padding: '6px 14px', borderRadius: 999,
                  background: active ? c : 'rgba(255,255,255,.06)',
                  color: active ? (t === 'all' ? '#1a1a1a' : '#fff') : '#c8ccd2',
                  fontSize: 12, fontWeight: 600,
                  border: '1px solid ' + (active ? c : 'rgba(255,255,255,.1)'),
                }}
              >
                {t === 'all' ? '全部' : typeMeta[t].label}
              </button>
            );
          })}
        </div>

        {/* Comments */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
          {filtered.map((c) => (
            <div
              key={c.id}
              style={{
                background: 'rgba(255,255,255,.04)',
                border: '1px solid rgba(255,255,255,.08)',
                borderRadius: 12, padding: 14,
                display: 'flex', gap: 12, alignItems: 'flex-start',
              }}
            >
              <span
                style={{
                  padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                  background: typeMeta[c.type].color, color: '#fff',
                  flexShrink: 0,
                }}
              >
                {typeMeta[c.type].label}
              </span>
              <Link
                to={c.page}
                style={{
                  fontSize: 11.5, color: '#a8acb6', textDecoration: 'none',
                  padding: '3px 8px', borderRadius: 4, background: 'rgba(255,255,255,.05)',
                  flexShrink: 0,
                }}
              >
                {c.page}
              </Link>
              <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.6, color: '#d4d7dd' }}>{c.text}</div>
              <button
                onClick={() => remove(c.id)}
                style={{ color: '#6c707a', fontSize: 16, padding: 4 }}
                title="删除"
              >
                ×
              </button>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 30, textAlign: 'center', color: '#6c707a', fontSize: 13 }}>
              该类型暂无记录
            </div>
          )}
        </div>

        {/* New comment */}
        <div
          style={{
            background: 'rgba(255,255,255,.04)',
            border: '1px solid rgba(255,255,255,.08)',
            borderRadius: 12, padding: 18,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>＋ 新增一条</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            {(['interact', 'bug', 'suggest', 'intent'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                style={{
                  padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                  background: type === t ? typeMeta[t].color : 'rgba(255,255,255,.06)',
                  color: type === t ? '#fff' : '#c8ccd2',
                }}
              >
                {typeMeta[t].label}
              </button>
            ))}
            <select
              value={page}
              onChange={(e) => setPage(e.target.value)}
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,.06)',
                color: '#fff', border: '1px solid rgba(255,255,255,.1)',
                borderRadius: 8, padding: '5px 8px', fontSize: 12,
              }}
            >
              {['/p1', '/p2', '/p3', '/p4', '/p5', '/p6', '/p7', '/p8', '/summary'].map((p) => (
                <option key={p} value={p} style={{ background: '#1a1c22' }}>{p}</option>
              ))}
            </select>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="写下你的意见…"
            rows={3}
            style={{
              width: '100%',
              background: 'rgba(0,0,0,.2)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 8,
              padding: 12, fontSize: 13, lineHeight: 1.6,
              resize: 'vertical',
            }}
          />
          <button
            onClick={submit}
            disabled={!text.trim()}
            style={{
              marginTop: 10,
              padding: '8px 18px', borderRadius: 8,
              background: 'var(--mt-yellow)', color: '#1a1a1a',
              fontSize: 13, fontWeight: 700,
            }}
          >
            提交
          </button>
        </div>
      </div>
    </div>
  );
}
