import { useState } from 'react';

const links = [
  { href: '/',           num: '01', label: 'Home' },
  { href: '/event',      num: '02', label: 'Event' },
  { href: '/rsvp',       num: '03', label: 'RSVP' },
  { href: '/volunteer',  num: '04', label: 'Volunteer' },
  { href: '/gallery',    num: '05', label: 'Gallery' },
  { href: '/classmates', num: '06', label: 'Classmates' },
  { href: '/contact',    num: '07', label: 'Contact' },
];

export default function MobileMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mobile-menu" style={{ display: 'contents' }}>
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="mm-trigger"
      >
        <span className="mm-trigger-label">{open ? 'CLOSE' : 'INDEX'}</span>
        <svg className="mm-trigger-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          {open ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
          )}
        </svg>
      </button>
      {open && (
        <div className="mm-overlay" onClick={() => setOpen(false)}>
          <div className="mm-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mm-head">
              <span className="mm-head-mark">INDEX</span>
              <button className="mm-close" onClick={() => setOpen(false)} aria-label="Close menu">✕</button>
            </div>
            <ul className="mm-list">
              {links.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="mm-link" onClick={() => setOpen(false)}>
                    <span className="mm-link-num">{l.num}</span>
                    <span className="mm-link-label">{l.label}</span>
                    <span className="mm-link-arrow" aria-hidden="true">→</span>
                  </a>
                </li>
              ))}
            </ul>
            <div className="mm-foot">
              <span>THE MUSTANG ANNUAL</span>
              <span>·</span>
              <span>VOL. 06</span>
            </div>
          </div>
        </div>
      )}
      <style>{`
        .mm-trigger {
          display: none;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.7rem;
          background: transparent;
          border: 1.5px solid var(--color-brand-900);
          color: var(--color-brand-900);
          font-family: var(--font-mono);
          font-size: 0.72rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .mm-trigger:hover { background: var(--color-brand-900); color: var(--color-cream-50); }
        .mm-trigger-icon { width: 1.1rem; height: 1.1rem; }
        @media (max-width: 980px) { .mm-trigger { display: inline-flex; } }

        .mm-overlay {
          position: fixed;
          inset: 0;
          background: rgba(13, 11, 10, 0.6);
          backdrop-filter: blur(4px);
          z-index: 90;
          display: flex;
          justify-content: flex-end;
          animation: mm-fade 0.2s ease-out;
        }
        @keyframes mm-fade { from { opacity: 0 } to { opacity: 1 } }
        .mm-panel {
          background: var(--color-cream-50);
          width: min(360px, 100%);
          padding: 1.5rem 1.5rem 2rem;
          border-left: 2px solid var(--color-brand-900);
          display: flex;
          flex-direction: column;
          animation: mm-slide 0.25s ease-out;
          overflow-y: auto;
        }
        @keyframes mm-slide { from { transform: translateX(20px); opacity: 0 } to { transform: none; opacity: 1 } }
        .mm-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 1rem;
          border-bottom: 1.5px solid var(--color-brand-900);
          margin-bottom: 1rem;
        }
        .mm-head-mark {
          font-family: var(--font-mono);
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.28em;
          color: var(--color-brand-500);
          font-weight: 600;
        }
        .mm-close {
          background: transparent;
          border: 0;
          color: var(--color-brand-900);
          font-size: 1.2rem;
          cursor: pointer;
          padding: 0.25rem 0.5rem;
        }
        .mm-list { list-style: none; padding: 0; margin: 0; }
        .mm-list li { border-bottom: 1px dotted rgba(13, 11, 10, 0.25); }
        .mm-link {
          display: flex;
          align-items: baseline;
          gap: 0.8rem;
          padding: 0.85rem 0;
          text-decoration: none;
          color: var(--color-brand-900);
          transition: color 0.15s ease;
        }
        .mm-link:hover { color: var(--color-brand-500); }
        .mm-link-num {
          font-family: var(--font-mono);
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.22em;
          color: var(--color-cream-700);
          width: 1.5rem;
          flex-shrink: 0;
        }
        .mm-link-label {
          flex: 1;
          font-family: var(--font-display);
          font-variation-settings: "opsz" 32, "wght" 500;
          font-size: 1.25rem;
          letter-spacing: -0.01em;
        }
        .mm-link-arrow {
          font-family: var(--font-mono);
          color: var(--color-brand-500);
          font-size: 0.9rem;
        }
        .mm-foot {
          margin-top: auto;
          padding-top: 1.5rem;
          font-family: var(--font-mono);
          font-size: 0.62rem;
          text-transform: uppercase;
          letter-spacing: 0.26em;
          color: var(--color-cream-700);
          display: flex;
          gap: 0.4rem;
          align-items: center;
        }
      `}</style>
    </div>
  );
}
