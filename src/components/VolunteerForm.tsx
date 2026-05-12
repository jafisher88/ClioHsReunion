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
      <div className="rounded-2xl border border-accent-300 bg-accent-50 p-8 text-center shadow-sm">
        <h2 className="font-heading text-2xl uppercase tracking-wider text-brand-800">Thanks!</h2>
        <p className="mt-3 text-brand-700">
          You're on the volunteer list. We'll be in touch closer to the date with timing
          and what to bring.
        </p>
        <button
          onClick={() => setStatus({ kind: 'idle' })}
          className="mt-6 rounded-full border-2 border-brand-300 bg-white px-6 py-2 text-sm font-medium text-brand-700 hover:border-brand-500"
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
      <Field label="Phone (optional)" name="phone" type="tel" placeholder="(810) 555-0123" />

      <fieldset>
        <legend className="block text-sm font-semibold text-brand-800">Which day(s) can you help?</legend>
        <p className="mt-1 text-xs text-cream-700">Pick at least one.</p>
        <div className="mt-3 space-y-2">
          <RoleCheckbox name="roleSetup" title="Setup & decorate — day before" body="Friday-ish: arrive at the ranch, set up tables, hang decorations, prep the space." />
          <RoleCheckbox name="roleCleanup" title="Cleanup — day after" body="Sunday-ish: tear-down, trash, pack up decorations, leave the venue better than we found it." />
        </div>
      </fieldset>

      <label className="block">
        <span className="block text-sm font-semibold text-brand-800">Anything else? (truck access, time of day, etc.)</span>
        <textarea
          name="notes"
          rows={3}
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
        {submitting ? 'Sending…' : 'Sign me up'}
      </button>
    </form>
  );
}

function RoleCheckbox({ name, title, body }: { name: string; title: string; body: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border-2 border-cream-300 bg-white p-4 hover:border-brand-300 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
      <input type="checkbox" name={name} className="mt-1 h-5 w-5 accent-brand-500" />
      <span>
        <span className="block font-semibold text-brand-800">{title}</span>
        <span className="mt-0.5 block text-sm text-brand-700">{body}</span>
      </span>
    </label>
  );
}

function Field({
  label,
  name,
  type = 'text',
  required = false,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
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
        className="mt-1 block w-full rounded-lg border-2 border-cream-300 bg-white px-3 py-2 text-brand-900 placeholder-cream-500 focus:border-brand-500 focus:outline-none"
      />
    </label>
  );
}
