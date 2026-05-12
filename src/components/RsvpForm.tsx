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
    } catch (err) {
      setStatus({ kind: 'error', message: 'Network error — please try again.' });
    }
  }

  if (status.kind === 'success') {
    return (
      <div className="rounded-2xl border border-accent-300 bg-accent-50 p-8 text-center shadow-sm">
        <h2 className="font-heading text-2xl uppercase tracking-wider text-brand-800">You're in!</h2>
        <p className="mt-3 text-brand-700">Thanks for your RSVP. We'll be in touch with more details as the reunion gets closer.</p>
        <button
          onClick={() => setStatus({ kind: 'idle' })}
          className="mt-6 rounded-full border-2 border-brand-300 bg-white px-6 py-2 text-sm font-medium text-brand-700 hover:border-brand-500"
        >
          Submit another RSVP
        </button>
      </div>
    );
  }

  const submitting = status.kind === 'submitting';

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label="Full name" name="fullName" required placeholder="Jane Mustang" />
      <Field label="Maiden name (optional)" name="maidenName" placeholder="If different from above" />
      <Field label="Email" name="email" type="email" required placeholder="you@example.com" />

      <fieldset>
        <legend className="block text-sm font-semibold text-brand-800">Will you be attending?</legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(['yes', 'maybe', 'no'] as const).map(v => (
            <label key={v} className="cursor-pointer">
              <input type="radio" name="attending" value={v} required className="peer sr-only" defaultChecked={v === 'yes'} />
              <span className="block rounded-lg border-2 border-cream-300 bg-white px-4 py-3 text-center text-sm font-medium capitalize text-brand-700 peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-checked:text-brand-800">
                {v}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="How many in your party? (including you)" name="guestCount" type="number" defaultValue="1" min={0} max={10} required />

      <label className="block">
        <span className="block text-sm font-semibold text-brand-800">Anything else? (dietary needs, song requests, hellos)</span>
        <textarea
          name="notes"
          rows={4}
          className="mt-1 block w-full rounded-lg border-2 border-cream-300 bg-white px-3 py-2 text-brand-900 focus:border-brand-500 focus:outline-none"
        />
      </label>

      {status.kind === 'error' && (
        <p className="rounded-lg border border-brand-300 bg-brand-50 px-4 py-3 text-sm text-brand-800">{status.message}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-brand-500 px-6 py-3.5 text-base font-semibold text-cream-50 shadow-lg shadow-brand-500/20 hover:bg-brand-600 disabled:opacity-60"
      >
        {submitting ? 'Sending…' : 'Send RSVP'}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type = 'text',
  required = false,
  placeholder,
  defaultValue,
  min,
  max,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-brand-800">
        {label}
        {required && <span className="text-brand-600"> *</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        min={min}
        max={max}
        className="mt-1 block w-full rounded-lg border-2 border-cream-300 bg-white px-3 py-2 text-brand-900 placeholder-cream-500 focus:border-brand-500 focus:outline-none"
      />
    </label>
  );
}
