/**
 * Volunteer signup payload validation extracted from the route for unit
 * testability. The route at `src/pages/api/volunteer.ts` re-imports
 * `validate` from here.
 */

export interface VolunteerPayload {
  fullName: string;
  email: string;
  phone: string;
  roleSetup: boolean;
  roleCleanup: boolean;
  notes: string;
}

export type VolunteerValidationResult =
  | { ok: true; value: VolunteerPayload }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.toLowerCase();
    return s === 'true' || s === 'on' || s === '1' || s === 'yes';
  }
  return false;
}

export function validate(body: unknown): VolunteerValidationResult {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request body.' };
  const b = body as Record<string, unknown>;

  const fullName = typeof b.fullName === 'string' ? b.fullName.trim() : '';
  if (!fullName) return { ok: false, error: 'Please enter your name.' };
  if (fullName.length > 200) return { ok: false, error: 'Name is too long.' };

  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: 'Please enter a valid email.' };
  if (email.length > 320) return { ok: false, error: 'Email is too long.' };

  const phone = typeof b.phone === 'string' ? b.phone.trim().slice(0, 40) : '';
  const roleSetup = asBool(b.roleSetup);
  const roleCleanup = asBool(b.roleCleanup);
  if (!roleSetup && !roleCleanup) {
    return { ok: false, error: 'Pick at least one role — setup or cleanup.' };
  }
  const notes = typeof b.notes === 'string' ? b.notes.trim().slice(0, 2000) : '';

  return { ok: true, value: { fullName, email, phone, roleSetup, roleCleanup, notes } };
}
