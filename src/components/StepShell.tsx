import type { ReactNode } from 'react';
import { MobileFrame } from './MobileFrame';
import { StatusBar } from './StatusBar';
import { NavBar } from './NavBar';

interface Props {
  title: string;
  children: ReactNode;
  /** Primary CTA at bottom */
  ctaLabel?: string;
  ctaDisabled?: boolean;
  onCta?: () => void;
  /** Replace the entire footer with custom JSX */
  footer?: ReactNode;
  /** Right side of nav bar */
  navRight?: ReactNode;
  /** Background of scroll area */
  bg?: string;
}

export function StepShell({
  title, children, ctaLabel, ctaDisabled, onCta, footer, navRight, bg = 'var(--mt-bg)',
}: Props) {
  return (
    <MobileFrame>
      <StatusBar bg="#fff" />
      <NavBar title={title} right={navRight} />
      <div className="scroll-area" style={{ background: bg }}>
        {children}
      </div>
      {(footer ?? (ctaLabel && (
        <div className="footer-bar">
          <button className="btn-primary" disabled={ctaDisabled} onClick={onCta}>
            {ctaLabel}
          </button>
        </div>
      ))) || null}
    </MobileFrame>
  );
}
