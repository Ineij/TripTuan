import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Render outside the iPhone bezel (e.g. for /flow overview) */
  fullPage?: boolean;
}

export function MobileFrame({ children, fullPage }: Props) {
  if (fullPage) return <>{children}</>;
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#2d2f36',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
      }}
    >
      <div
        className="mobile-frame"
        style={{ animation: 'pagePush .42s cubic-bezier(.32,.72,.32,1.18) both' }}
      >
        {children}
      </div>
    </div>
  );
}
