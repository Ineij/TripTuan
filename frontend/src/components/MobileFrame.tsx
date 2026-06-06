import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { StreamingStatus } from './StreamingStatus';

interface Props {
  children: ReactNode;
  /** Render outside the iPhone bezel (e.g. for /flow overview) */
  fullPage?: boolean;
}

/** Logical device size — the whole UI is designed against this. */
const FRAME_W = 390;
const FRAME_H = 844;

export function MobileFrame({ children, fullPage }: Props) {
  // Auto-scale the phone so the *entire* device (and thus the full itinerary
  // inside it) always fits the browser window — no manual zoom needed.
  const [scale, setScale] = useState(1);
  const location = useLocation();
  const [entering, setEntering] = useState(true);

  useEffect(() => {
    if (fullPage) return undefined;
    setEntering(true);
    const timer = window.setTimeout(() => setEntering(false), 650);
    return () => window.clearTimeout(timer);
  }, [fullPage, location.pathname]);

  useEffect(() => {
    if (fullPage) return;
    const compute = () => {
      const padX = 32; // breathing room left+right
      const padY = 32; // breathing room top+bottom
      const next = Math.min(
        1,
        (window.innerWidth - padX) / FRAME_W,
        (window.innerHeight - padY) / FRAME_H,
      );
      setScale(next > 0.2 ? next : 0.2);
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [fullPage]);

  if (fullPage) return <>{children}</>;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#2d2f36',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      {/* Sizing box reserves the *scaled* footprint so the frame stays centred
          and never overflows the viewport (which previously clipped P7/P8). */}
      <div style={{ width: FRAME_W * scale, height: FRAME_H * scale, flexShrink: 0 }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <div
            className="mobile-frame"
            style={{ animation: 'pagePush .42s cubic-bezier(.32,.72,.32,1.18) both' }}
          >
            {children}
            {entering && (
              <div style={{ position: 'absolute', left: 14, right: 14, top: 96, zIndex: 90, pointerEvents: 'none' }}>
                <StreamingStatus
                  title="页面加载中"
                  compact
                  messages={[
                    '准备页面结构',
                    '读取本页数据',
                    '同步展示状态',
                    '马上可以操作',
                  ]}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
