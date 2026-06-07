import { useEffect, useMemo, useState, type CSSProperties } from 'react';

const DEFAULT_MESSAGES = [
  '正在连接后端服务',
  '正在读取你的选择',
  '正在同步最新结果',
  '页面马上更新',
];

interface StreamingStatusProps {
  title?: string;
  messages?: string[];
  active?: boolean;
  compact?: boolean;
  tone?: 'light' | 'dark';
  style?: CSSProperties;
}

export function StreamingStatus({
  title = '小go正在处理',
  messages = DEFAULT_MESSAGES,
  active = true,
  compact = false,
  tone = 'light',
  style,
}: StreamingStatusProps) {
  const safeMessages = useMemo(
    () => (messages.length > 0 ? messages : DEFAULT_MESSAGES),
    [messages],
  );
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    setStep(0);
    const timer = window.setInterval(() => {
      setStep((current) => Math.min(current + 1, safeMessages.length - 1));
    }, 850);
    return () => window.clearInterval(timer);
  }, [active, safeMessages]);

  if (!active) return null;

  const progress = `${Math.round(((step + 1) / safeMessages.length) * 100)}%`;
  const className = [
    'stream-status',
    compact ? 'stream-status--compact' : '',
    tone === 'dark' ? 'stream-status--dark' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={className} style={style}>
      <div className="stream-status__header">
        <span className="stream-status__pulse" />
        <span className="stream-status__title">{title}</span>
        <span className="stream-status__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>

      <div className="stream-status__live">{safeMessages[step]}</div>
      <div className="stream-status__bar" aria-hidden="true">
        <div className="stream-status__fill" style={{ width: progress }} />
      </div>

      {!compact && (
        <div className="stream-status__steps">
          {safeMessages.map((message, index) => (
            <div
              key={message}
              className={[
                'stream-status__step',
                index < step ? 'stream-status__step--done' : '',
                index === step ? 'stream-status__step--active' : '',
              ].filter(Boolean).join(' ')}
            >
              <span>{index < step ? '✓' : index === step ? '•' : ''}</span>
              <b>{message}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
