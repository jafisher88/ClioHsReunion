import { useState, type FormEvent } from 'react';

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

export default function RsvpForm() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus({ kind: 'submitting' });

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const res = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string')
          ? body.error
          : `Submission failed (${res.status})`;
        setStatus({ kind: 'error', message });
        return;
      }
      setStatus({ kind: 'success' });
      form.reset();
    } catch {
      setStatus({ kind: 'error', message: 'Network error — please try again.' });
    }
  }

  if (status.kind === 'success') {
    return (
      <div className="rsvp-success">
        <div className="rsvp-success-stamp">RECEIVED</div>
        <h2 className="rsvp-success-h">You're in.</h2>
        <p className="rsvp-success-p">
          Thanks for your RSVP. We'll be in touch with more details as the reunion
          gets closer.
        </p>
        <button onClick={() => setStatus({ kind: 'idle' })} className="rsvp-success-btn">
          Submit another →
        </button>
        <style>{`
          .rsvp-success {
            position: relative;
            padding: 2.5rem 1.5rem;
            text-align: center;
            background: var(--color-brand-50);
            border: 1.5px solid var(--color-brand-500);
          }
          .rsvp-success-stamp {
            display: inline-block;
            font-family: var(--font-mono);
            font-size: 0.7rem;
            letter-spacing: 0.32em;
            color: var(--color-redpen-500);
            border: 2.5px solid var(--color-redpen-500);
            padding: 0.4rem 0.9rem;
            transform: rotate(-5deg);
            margin-bottom: 1rem;
            font-weight: 700;
            background: rgba(193, 39, 45, 0.04);
          }
          .rsvp-success-h {
            font-family: var(--font-display);
            font-variation-settings: "opsz" 96, "wght" 600, "WONK" 1;
            font-style: italic;
            font-size: 2.4rem;
            line-height: 1;
            margin: 0.5rem 0 0.75rem;
            color: var(--color-brand-900);
          }
          .rsvp-success-p {
            font-family: var(--font-body);
            color: var(--color-brand-800);
            max-width: 30rem;
            margin: 0 auto;
            line-height: 1.5;
          }
          .rsvp-success-btn {
            margin-top: 1.5rem;
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            background: transparent;
            border: 1.5px solid var(--color-brand-900);
            color: var(--color-brand-900);
            padding: 0.65rem 1.1rem;
            font-family: var(--font-mono);
            font-size: 0.72rem;
            text-transform: uppercase;
            letter-spacing: 0.2em;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.15s ease, color 0.15s ease;
          }
          .rsvp-success-btn:hover { background: var(--color-brand-900); color: var(--color-cream-50); }
        `}</style>
      </div>
    );
  }

  const submitting = status.kind === 'submitting';

  return (
    <form onSubmit={onSubmit} className="rsvp-form">
      <div className="rsvp-form-grid">
        <div className="field-block" style={{ gridColumn: 'span 2' }}>
          <label className="field-label" htmlFor="rsvp-name">
            Full name<span className="req">*</span>
          </label>
          <input id="rsvp-name" className="field-input" type="text" name="fullName" required placeholder="Jane Mustang" />
        </div>

        <div className="field-block" style={{ gridColumn: 'span 1' }}>
          <label className="field-label" htmlFor="rsvp-maiden">Maiden name</label>
          <input id="rsvp-maiden" className="field-input" type="text" name="maidenName" placeholder="(if applicable)" />
        </div>

        <div className="field-block" style={{ gridColumn: 'span 2' }}>
          <label className="field-label" htmlFor="rsvp-email">
            Email<span className="req">*</span>
          </label>
          <input id="rsvp-email" className="field-input" type="email" name="email" required placeholder="you@example.com" />
        </div>

        <div className="field-block" style={{ gridColumn: 'span 1' }}>
          <label className="field-label" htmlFor="rsvp-guests">
            Party size<span className="req">*</span>
          </label>
          <input id="rsvp-guests" className="field-input" type="number" name="guestCount" defaultValue="1" min={0} max={10} required />
        </div>
      </div>

      <fieldset className="rsvp-attending">
        <legend className="field-label">
          Will you attend?<span className="req">*</span>
        </legend>
        <div className="ballot-grid ballot-grid-3">
          {(['yes', 'maybe', 'no'] as const).map((v, i) => (
            <label key={v} className="ballot">
              <input type="radio" name="attending" value={v} required defaultChecked={v === 'yes'} />
              <span className="dot" aria-hidden="true" />
              <span className="ballot-label">
                <span className="ballot-num">{['i', 'ii', 'iii'][i]}</span>
                <span className="ballot-text">{v === 'yes' ? 'Yes, with bells on.' : v === 'maybe' ? 'Maybe — hold a seat.' : 'Sadly, no.'}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field-block">
        <label className="field-label" htmlFor="rsvp-notes">
          Anything else? <span className="field-label-soft">(dietary needs, song requests, hellos)</span>
        </label>
        <textarea id="rsvp-notes" className="field-textarea" name="notes" rows={3} />
      </div>

      {status.kind === 'error' && (
        <p className="rsvp-error">{status.message}</p>
      )}

      <div className="rsvp-actions">
        <button type="submit" disabled={submitting} className="submit-stamp">
          <span aria-hidden="true">▸</span>
          <span>{submitting ? 'Sending…' : 'Mail it in'}</span>
        </button>
      </div>

      <style>{`
        .rsvp-form { display: flex; flex-direction: column; gap: 1.75rem; }
        .rsvp-form-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1.5rem;
        }
        @media (max-width: 640px) {
          .rsvp-form-grid { grid-template-columns: 1fr; }
          .rsvp-form-grid .field-block { grid-column: span 1 !important; }
        }
        .rsvp-attending { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.75rem; }
        .ballot-grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        @media (max-width: 640px) { .ballot-grid-3 { grid-template-columns: 1fr; } }
        .ballot-label { display: inline-flex; flex-direction: column; line-height: 1.05; }
        .ballot-num {
          font-family: var(--font-mono);
          font-size: 0.6rem;
          text-transform: uppercase;
          letter-spacing: 0.24em;
          color: var(--color-cream-700);
        }
        .ballot-text {
          font-family: var(--font-display);
          font-variation-settings: "opsz" 20, "wght" 500;
          font-size: 1rem;
          margin-top: 0.2rem;
        }
        .field-label-soft {
          font-family: var(--font-mono);
          color: var(--color-cream-700);
          text-transform: none;
          letter-spacing: 0.08em;
          font-size: 0.65rem;
          font-style: italic;
        }
        .rsvp-error {
          margin: 0;
          padding: 0.7rem 0.9rem;
          background: rgba(193, 39, 45, 0.06);
          border: 1.5px solid var(--color-redpen-500);
          color: var(--color-redpen-600);
          font-family: var(--font-mono);
          font-size: 0.78rem;
        }
        .rsvp-actions { display: flex; align-items: center; gap: 1rem; margin-top: 0.5rem; }
      `}</style>
    </form>
  );
}
