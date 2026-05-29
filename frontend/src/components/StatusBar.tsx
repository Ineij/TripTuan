interface Props {
  /** Optional background — defaults to transparent */
  bg?: string;
  /** Text color */
  color?: string;
  time?: string;
}

export function StatusBar({ bg = 'transparent', color = 'var(--mt-text)', time = '9:41' }: Props) {
  return (
    <div className="status-bar" style={{ background: bg, color }}>
      <span>{time}</span>
      <span className="right">
        <span className="signal" />
        <span style={{ fontSize: 11, fontWeight: 600 }}>5G</span>
        <span className="battery" />
      </span>
    </div>
  );
}
