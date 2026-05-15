/**
 * Admin classmates roster payload validation. Extracted from the route
 * for unit testability; the route at `src/pages/api/admin/classmates.ts`
 * re-imports `validate` from here.
 */
import { parseHttpUrl } from '../url-validator';

export const MAX_NAME = 200;
export const MAX_NOTES = 2000;
export const MAX_EMAIL = 320;
export const MAX_TRIBUTE = 4000;
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ClassmateInput {
  fullName: string;
  maidenName: string | null;
  preferredFirstName: string | null;
  email: string | null;
  notes: string | null;
  isDeceased: boolean;
  birthYear: number | null;
  passingYear: number | null;
  tribute: string | null;
  photoUrl: string | null;
  obituaryUrl: string | null;
}

export type ClassmatesValidationResult =
  | { ok: true; value: ClassmateInput }
  | { ok: false; error: string };

export function clampText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length === 0 ? null : trimmed;
}

export function parseYear(value: unknown): number | null | 'invalid' {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n)) return 'invalid';
  if (n < MIN_YEAR || n > MAX_YEAR) return 'invalid';
  return n;
}

export function validate(body: unknown): ClassmatesValidationResult {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request body.' };
  const b = body as Record<string, unknown>;

  const fullName = clampText(b.fullName, MAX_NAME);
  if (!fullName) return { ok: false, error: 'Please enter a name.' };

  const emailRaw = clampText(b.email, MAX_EMAIL);
  const email = emailRaw ? emailRaw.toLowerCase() : null;
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: 'Email looks invalid.' };

  const birthYear = parseYear(b.birthYear);
  if (birthYear === 'invalid') return { ok: false, error: `Birth year must be between ${MIN_YEAR} and ${MAX_YEAR}.` };
  const passingYear = parseYear(b.passingYear);
  if (passingYear === 'invalid') return { ok: false, error: `Passing year must be between ${MIN_YEAR} and ${MAX_YEAR}.` };

  const photoUrl = parseHttpUrl(b.photoUrl);
  if (photoUrl === 'invalid') return { ok: false, error: 'Photo URL must start with http(s)://' };
  const obituaryUrl = parseHttpUrl(b.obituaryUrl);
  if (obituaryUrl === 'invalid') return { ok: false, error: 'Obituary URL must start with http(s)://' };

  return {
    ok: true,
    value: {
      fullName,
      maidenName: clampText(b.maidenName, MAX_NAME),
      preferredFirstName: clampText(b.preferredFirstName, MAX_NAME),
      email,
      notes: clampText(b.notes, MAX_NOTES),
      isDeceased: b.isDeceased === true,
      birthYear,
      passingYear,
      tribute: clampText(b.tribute, MAX_TRIBUTE),
      photoUrl,
      obituaryUrl,
    },
  };
}
