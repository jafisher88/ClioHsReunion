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
    const fd = new FormData(form);
    const data = {
      graduationName: String(fd.get('graduationName') ?? ''),
      // The form labels this "Current name"; the API still receives it as
      // fullName since that's the canonical identity field on Rsvps.
      fullName: String(fd.get('currentName') ?? ''),
      email: String(fd.get('email') ?? ''),
      attending: String(fd.get('attending') ?? ''),
      guestCount: fd.get('plusOne') === 'on' ? 2 : 1,
      notes: String(fd.get('notes') ?? ''),
    };

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
      <div className="rounded-2xl border-2 border-accent-300 bg-gradient-to-br from-accent-50 via-cream-50 to-cream-50 p-8 text-center shadow-soft">
        <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-100 text-2xl">✓</div>
        <h2 className="font-heading text-2xl font-semibold uppercase tracking-[0.06em] text-brand-900">You're in!</h2>
        <p className="mx-auto mt-3 max-w-md text-brand-700">Thanks for your RSVP. We'll be in touch with more details as the reunion gets closer.</p>
        <button
          onClick={() => setStatus({ kind: 'idle' })}
          className="mt-6 rounded-full border-2 border-brand-300 bg-white px-6 py-2 text-sm font-semibold text-brand-700 transition-all duration-200 hover:border-brand-500 hover:bg-brand-50 hover:-translate-y-0.5"
        >
          Submit another RSVP
        </button>
      </div>
    );
  }

  const submitting = status.kind === 'submitting';

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field
        label="Name at graduation"
        name="graduationName"
        required
        hint="As it appeared in the 2006 yearbook."
      />
      <Field
        label="Current name"
        name="currentName"
        required
        hint="What we should call you and put on your name tag. We'll use your first name here as your preferred name."
      />
      <Field label="Email" name="email" type="email" required placeholder="you@example.com" />

      <fieldset>
        <legend className="block text-sm font-semibold text-brand-900">
          Will you be attending? <span className="text-brand-500">*</span>
        </legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(['yes', 'maybe', 'no'] as const).map(v => (
            <label key={v} className="group/r cursor-pointer">
              <input type="radio" name="attending" value={v} required className="peer sr-only" defaultChecked={v === 'yes'} />
              <span className="block rounded-lg border-2 border-cream-300 bg-white px-4 py-3 text-center text-sm font-semibold capitalize text-brand-700 transition-all duration-150 group-hover/r:border-brand-300 group-hover/r:bg-brand-50/50 peer-checked:border-brand-500 peer-checked:bg-brand-50 peer-checked:text-brand-900 peer-checked:shadow-[inset_0_0_0_1px_var(--color-brand-500)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500">
                {v}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="group/p flex cursor-pointer items-start gap-3 rounded-xl border-2 border-cream-300 bg-white p-4 transition-all duration-150 hover:border-brand-300 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:shadow-[inset_0_0_0_1px_var(--color-brand-500)]">
        <input type="checkbox" name="plusOne" className="peer mt-0.5 h-5 w-5 accent-brand-500" />
        <span>
          <span className="block font-semibold text-brand-900">Bringing a +1?</span>
          <span className="mt-0.5 block text-sm leading-relaxed text-brand-700">
            Check this if you're bringing a guest — partner, spouse, plus-one. We'll set
            a seat for them.
          </span>
        </span>
      </label>

      <label className="block">
        <span className="block text-sm font-semibold text-brand-900">Anything else? <span className="font-normal text-cream-700">(dietary needs, song requests, hellos)</span></span>
        <textarea
          name="notes"
          rows={4}
          className="mt-1.5 block w-full rounded-lg border-2 border-cream-300 bg-white px-3 py-2 text-brand-900 transition-colors duration-150 placeholder-cream-500 hover:border-cream-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
        />
      </label>

      {status.kind === 'error' && (
        <p className="rounded-lg border border-brand-300 bg-brand-50 px-4 py-3 text-sm text-brand-800">{status.message}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="group/submit inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-6 py-3.5 text-base font-semibold text-cream-50 shadow-[0_2px_0_rgba(13,11,10,0.04),0_12px_24px_-8px_rgba(242,105,1,0.5)] transition-all duration-200 hover:bg-brand-600 hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {submitting ? 'Sending…' : (
          <>
            Send RSVP
            <span className="transition-transform duration-200 group-hover/submit:translate-x-0.5" aria-hidden="true">→</span>
          </>
        )}
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
  hint,
  defaultValue,
  min,
  max,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  defaultValue?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-brand-900">
        {label}
        {required && <span className="text-brand-500"> *</span>}
      </span>
      {hint && <p className="mt-0.5 text-xs text-cream-700">{hint}</p>}
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        min={min}
        max={max}
        className="mt-1.5 block w-full rounded-lg border-2 border-cream-300 bg-white px-3 py-2.5 text-brand-900 transition-colors duration-150 placeholder-cream-500 hover:border-cream-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
      />
    </label>
  );
}
