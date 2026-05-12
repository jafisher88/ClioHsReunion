import { useState } from 'react';

const links = [
  { href: '/', label: 'Home' },
  { href: '/event', label: 'Event' },
  { href: '/rsvp', label: 'RSVP' },
  { href: '/volunteer', label: 'Volunteer' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/classmates', label: 'Classmates' },
  { href: '/contact', label: 'Contact' },
];

export default function MobileMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="rounded-md p-2 text-brand-800 hover:bg-cream-200/60"
      >
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {open ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
          )}
        </svg>
      </button>
      {open && (
        <div
          className="absolute left-0 right-0 top-full border-b border-cream-300/60 bg-cream-50 shadow-lg"
          style={{ zIndex: 90 }}
        >
          <ul className="mx-auto flex max-w-7xl flex-col px-4 py-3 sm:px-6">
            {links.map(l => (
              <li key={l.href}>
                <a
                  href={l.href}
                  className="block rounded-md px-3 py-3 text-base font-medium text-brand-800 hover:bg-cream-200/70"
                  onClick={() => setOpen(false)}
                >
                  {l.label}
                </a>
              </li>
            ))}
            <li className="mt-2 border-t border-cream-300/60 pt-2">
              <a
                href="/admin/"
                className="flex items-center justify-between rounded-md px-3 py-3 text-sm font-medium text-brand-700 hover:bg-cream-200/70"
                onClick={() => setOpen(false)}
              >
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-500"
                  >
                    Internal
                  </span>
                  <span>Admin dashboard</span>
                </span>
                <span aria-hidden="true" className="text-cream-700">→</span>
              </a>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
