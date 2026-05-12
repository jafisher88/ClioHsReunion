import { useState, type FormEvent } from 'react';

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

export default function VolunteerForm() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus({ kind: 'submitting' });

    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      fullName: String(fd.get('fullName') ?? ''),
      email: String(fd.get('email') ?? ''),
      phone: String(fd.get('phone') ?? ''),
      roleSetup: fd.get('roleSetup') === 'on',
      roleCleanup: fd.get('roleCleanup') === 'on',
      notes: String(fd.get('notes') ?? ''),
    };

    try {
      const res = await fetch('/api/volunteer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      <div className="vol-success">
        <div className="vol-success-stamp">SIGNED UP</div>
        <h2 className="vol-success-h">Thanks &mdash; you're on the list.</h2>
        <p className="vol-success-p">
          We'll be in touch closer to the date with timing and what to bring.
        </p>
        <button onClick={() => setStatus({ kind: 'idle' })} className="vol-success-btn">
          Sign up someone else →
        </button>
        <style>{`
          .vol-success {
            padding: 2.5rem 1.5rem;
            text-align: center;
            background: var(--color-brand-50);
            border: 1.5px solid var(--color-brand-500);
          }
          .vol-success-stamp {
            display: inline-block;
            font-family: var(--font-mono);
            font-size: 0.7rem;
            letter-spacing: 0.3em;
            color: var(--color-redpen-500);
            border: 2.5px solid var(--color-redpen-500);
            padding: 0.4rem 0.9rem;
            transform: rotate(-5deg);
            margin-bottom: 1rem;
            font-weight: 700;
            background: rgba(193, 39, 45, 0.04);
          }
          .vol-success-h {
            font-family: var(--font-display);
            font-variation-settings: "opsz" 96, "wght" 600, "WONK" 1;
            font-style: italic;
            font-size: 2rem;
            line-height: 1.05;
            margin: 0.5rem 0 0.75rem;
            color: var(--color-brand-900);
          }
          .vol-success-p {
            font-family: var(--font-body);
            color: var(--color-brand-800);
            max-width: 30rem;
            margin: 0 auto;
            line-height: 1.5;
          }
          .vol-success-btn {
            margin-top: 1.5rem;
            display: inline-flex;
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
          .vol-success-btn:hover { background: var(--color-brand-900); color: var(--color-cream-50); }
        `}</style>
      </div>
    );
  }

  const submitting = status.kind === 'submitting';

  return (
    <form onSubmit={onSubmit} className="vol-form">
      <div className="vol-form-grid">
        <div className="field-block" style={{ gridColumn: 'span 2' }}>
          <label className="field-label" htmlFor="vol-name">
            Full name<span className="req">*</span>
          </label>
          <input id="vol-name" className="field-input" type="text" name="fullName" required placeholder="Jane Mustang" />
        </div>

        <div className="field-block">
          <label className="field-label" htmlFor="vol-email">
            Email<span className="req">*</span>
          </label>
          <input id="vol-email" className="field-input" type="email" name="email" required placeholder="you@example.com" />
        </div>

        <div className="field-block">
          <label className="field-label" htmlFor="vol-phone">Phone</label>
          <input id="vol-phone" className="field-input" type="tel" name="phone" placeholder="(810) 555-0123" />
        </div>
      </div>

      <fieldset className="vol-roles">
        <legend className="field-label">
          Which day(s) can you help?<span className="req">*</span>
          <span className="field-label-soft"> Pick at least one.</span>
        </legend>
        <div className="vol-role-grid">
          <label className="role-check">
            <input type="checkbox" name="roleSetup" />
            <span className="box" aria-hidden="true" />
            <span>
              <span className="role-check-title">Day before — setup &amp; decorate.</span>
              <span className="role-check-body">Friday-ish: arrive at the ranch, set up tables, hang decorations, prep the space.</span>
            </span>
          </label>
          <label className="role-check">
            <input type="checkbox" name="roleCleanup" />
            <span className="box" aria-hidden="true" />
            <span>
              <span className="role-check-title">Day after — cleanup.</span>
              <span className="role-check-body">Sunday-ish: tear-down, trash, pack up decorations, leave the venue better than we found it.</span>
            </span>
          </label>
        </div>
      </fieldset>

      <div className="field-block">
        <label className="field-label" htmlFor="vol-notes">
          Anything else?
          <span className="field-label-soft"> (truck access, time of day, etc.)</span>
        </label>
        <textarea id="vol-notes" className="field-textarea" name="notes" rows={3} />
      </div>

      {status.kind === 'error' && (
        <p className="vol-error">{status.message}</p>
      )}

      <div className="vol-actions">
        <button type="submit" disabled={submitting} className="submit-stamp">
          <span aria-hidden="true">✪</span>
          <span>{submitting ? 'Sending…' : 'Sign me up'}</span>
        </button>
      </div>

      <style>{`
        .vol-form { display: flex; flex-direction: column; gap: 1.75rem; }
        .vol-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1.5rem;
        }
        @media (max-width: 640px) {
          .vol-form-grid { grid-template-columns: 1fr; }
          .vol-form-grid .field-block { grid-column: span 1 !important; }
        }
        .vol-roles { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.75rem; }
        .vol-role-grid { display: grid; gap: 0.75rem; }
        .field-label-soft {
          font-family: var(--font-mono);
          color: var(--color-cream-700);
          text-transform: none;
          letter-spacing: 0.08em;
          font-size: 0.65rem;
          font-style: italic;
        }
        .vol-error {
          margin: 0;
          padding: 0.7rem 0.9rem;
          background: rgba(193, 39, 45, 0.06);
          border: 1.5px solid var(--color-redpen-500);
          color: var(--color-redpen-600);
          font-family: var(--font-mono);
          font-size: 0.78rem;
        }
        .vol-actions { display: flex; align-items: center; gap: 1rem; margin-top: 0.5rem; }
      `}</style>
    </form>
  );
}
