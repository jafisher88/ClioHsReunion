/**
 * RSVP payload validation extracted from the route for unit testability.
 *
 * Single rule from plan.md: helpers under test live in `src/lib/`. The
 * route at `src/pages/api/rsvp.ts` re-imports `validate` from here.
 */

export interface RsvpPayload {
  fullName: string;          // current name (what they go by today)
  graduationName?: string;   // yearbook name
  preferredFirstName?: string;
  email: string;
  attending: 'yes' | 'no' | 'maybe';
  guestCount: string | number;
  notes?: string;
}

export type RsvpValidationResult =
  | { ok: true; value: RsvpPayload }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function firstWord(value: string): string {
  return (value ?? '').trim().split(/\s+/)[0] ?? '';
}

export function validate(body: unknown): RsvpValidationResult {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request body.' };
  const b = body as Record<string, unknown>;

  const fullName = typeof b.fullName === 'string' ? b.fullName.trim() : '';
  if (!fullName) return { ok: false, error: 'Please enter your current name.' };
  if (fullName.length > 200) return { ok: false, error: 'Name is too long.' };

  const graduationName = typeof b.graduationName === 'string'
    ? b.graduationName.trim().slice(0, 200)
    : '';

  // PreferredFirstName: if the form sent one (legacy), respect it; otherwise
  // derive from the current name's first word so admins / emails have something
  // friendly to use.
  let preferredFirstName = typeof b.preferredFirstName === 'string'
    ? b.preferredFirstName.trim().slice(0, 100)
    : '';
  if (!preferredFirstName) preferredFirstName = firstWord(fullName).slice(0, 100);

  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: 'Please enter a valid email.' };
  if (email.length > 320) return { ok: false, error: 'Email is too long.' };

  const attending = b.attending;
  if (attending !== 'yes' && attending !== 'no' && attending !== 'maybe') {
    return { ok: false, error: 'Please select an attendance option.' };
  }

  const guestCountRaw = b.guestCount;
  const guestCount = typeof guestCountRaw === 'number' ? guestCountRaw : Number(guestCountRaw);
  if (!Number.isInteger(guestCount) || guestCount < 0 || guestCount > 10) {
    return { ok: false, error: 'Guest count must be between 0 and 10.' };
  }

  const notes = typeof b.notes === 'string' ? b.notes.trim().slice(0, 2000) : undefined;

  return {
    ok: true,
    value: { fullName, graduationName, preferredFirstName, email, attending, guestCount, notes },
  };
}
