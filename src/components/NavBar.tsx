import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  /** Right-side custom node (icon, button, ...) */
  right?: ReactNode;
  /** Override back behaviour */
  onBack?: () => void;
  /** Hide back button */
  noBack?: boolean;
}

export function NavBar({ title, right, onBack, noBack }: Props) {
  const nav = useNavigate();
  const handleBack = () => (onBack ? onBack() : nav(-1));
  return (
    <div className="nav-bar">
      {!noBack && (
        <button className="back" onClick={handleBack} aria-label="返回">
          ‹
        </button>
      )}
      <div className="title" style={noBack ? { marginLeft: 0 } : undefined}>
        {title}
      </div>
      {right ?? <div style={{ width: 36 }} />}
    </div>
  );
}
