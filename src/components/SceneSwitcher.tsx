import { useApp } from '../store';

/** Pill toggle between Hong Kong / Beijing scenes */
export function SceneSwitcher() {
  const { scene, setScene } = useApp();
  return (
    <div
      style={{
        display: 'inline-flex',
        background: 'var(--mt-bg)',
        borderRadius: 999,
        padding: 3,
        gap: 2,
      }}
    >
      {(['hk', 'bj'] as const).map((s) => (
        <button
          key={s}
          onClick={() => setScene(s)}
          style={{
            padding: '6px 14px',
            borderRadius: 999,
            background: scene === s ? '#fff' : 'transparent',
            color: scene === s ? 'var(--mt-text)' : 'var(--mt-text-3)',
            fontWeight: 600,
            fontSize: 12,
            boxShadow: scene === s ? 'var(--shadow-1)' : 'none',
          }}
        >
          {s === 'hk' ? '🇭🇰 香港' : '🇨🇳 北京'}
        </button>
      ))}
    </div>
  );
}
