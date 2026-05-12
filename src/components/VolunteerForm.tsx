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
      <div className="rounded-2xl border-2 border-accent-300 bg-gradient-to-br from-accent-50 via-cream-50 to-cream-50 p-8 text-center shadow-soft">
        <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-100 text-2xl">✓</div>
        <h2 className="font-heading text-2xl font-semibold uppercase tracking-[0.06em] text-brand-900">Thanks!</h2>
        <p className="mx-auto mt-3 max-w-md text-brand-700">
          You're on the volunteer list. We'll be in touch closer to the date with timing
          and what to bring.
        </p>
        <button
          onClick={() => setStatus({ kind: 'idle' })}
          className="mt-6 rounded-full border-2 border-brand-300 bg-white px-6 py-2 text-sm font-semibold text-brand-700 transition-all duration-200 hover:border-brand-500 hover:bg-brand-50 hover:-translate-y-0.5"
        >
          Sign up someone else
        </button>
      </div>
    );
  }

  const submitting = status.kind === 'submitting';

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label="Full name" name="fullName" required placeholder="Jane Mustang" />
      <Field label="Email" name="email" type="email" required placeholder="you@example.com" />
      <Field label="Phone" name="phone" type="tel" optional placeholder="(810) 555-0123" />

      <fieldset>
        <legend className="block text-sm font-semibold text-brand-900">
          Which day(s) can you help? <span className="text-brand-500">*</span>
        </legend>
        <p className="mt-1 text-xs text-cream-700">Pick at least one.</p>
        <div className="mt-3 space-y-2">
          <RoleCheckbox name="roleSetup" title="Setup & decorate — day before" body="Friday-ish: arrive at the ranch, set up tables, hang decorations, prep the space." />
          <RoleCheckbox name="roleCleanup" title="Cleanup — day after" body="Sunday-ish: tear-down, trash, pack up decorations, leave the venue better than we found it." />
        </div>
      </fieldset>

      <label className="block">
        <span className="block text-sm font-semibold text-brand-900">Anything else? <span className="font-normal text-cream-700">(truck access, time of day, etc.)</span></span>
        <textarea
          name="notes"
          rows={3}
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
            Sign me up
            <span className="transition-transform duration-200 group-hover/submit:translate-x-0.5" aria-hidden="true">→</span>
          </>
        )}
      </button>
    </form>
  );
}

function RoleCheckbox({ name, title, body }: { name: string; title: string; body: string }) {
  return (
    <label className="group/r flex cursor-pointer items-start gap-3 rounded-xl border-2 border-cream-300 bg-white p-4 transition-all duration-150 hover:border-brand-300 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:shadow-[inset_0_0_0_1px_var(--color-brand-500)]">
      <input type="checkbox" name={name} className="peer mt-1 h-5 w-5 accent-brand-500" />
      <span>
        <span className="block font-semibold text-brand-900">{title}</span>
        <span className="mt-0.5 block text-sm leading-relaxed text-brand-700">{body}</span>
      </span>
    </label>
  );
}

function Field({
  label,
  name,
  type = 'text',
  required = false,
  optional = false,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  optional?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-brand-900">
        {label}
        {required && <span className="text-brand-500"> *</span>}
        {optional && <span className="font-normal text-cream-700"> (optional)</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="mt-1.5 block w-full rounded-lg border-2 border-cream-300 bg-white px-3 py-2.5 text-brand-900 transition-colors duration-150 placeholder-cream-500 hover:border-cream-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
      />
    </label>
  );
}
