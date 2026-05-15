/**
 * /contact submission payload validation extracted from the route for
 * unit testability. The route at `src/pages/api/submit-info.ts`
 * re-imports `validate` from here.
 */

export interface SubmitPayload {
  category: string;
  submitterName?: string;
  submitterEmail?: string;
  subject?: string;
  message: string;
  hp?: string; // honeypot
}

export type SubmitValidationResult =
  | { ok: true; value: SubmitPayload }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const ALLOWED_CATEGORIES = new Set([
  'general',
  'classmate-info',
  'correction',
  'memoriam',
  'photos-stories',
  'volunteer-help',
  'other',
]);

function clampString(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

export function validate(body: unknown): SubmitValidationResult {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request body.' };
  const b = body as Record<string, unknown>;

  if (typeof b.hp === 'string' && b.hp.trim() !== '') {
    return { ok: false, error: 'Spam detected.' };
  }

  const categoryRaw = clampString(b.category, 40).toLowerCase();
  // Empty / missing → default to general; explicit but unknown values are an
  // input error rather than something to silently rewrite, so a typo on the
  // form payload isn't quietly absorbed.
  const category = categoryRaw === '' ? 'general' : categoryRaw;
  if (!ALLOWED_CATEGORIES.has(category)) {
    return { ok: false, error: 'Pick a valid category.' };
  }

  const message = clampString(b.message, 5000);
  if (!message) return { ok: false, error: 'Please add a message.' };
  if (message.length < 5) return { ok: false, error: 'Message is too short.' };

  const submitterName = clampString(b.submitterName, 200);
  const submitterEmail = clampString(b.submitterEmail, 320).toLowerCase();
  if (submitterEmail && !EMAIL_RE.test(submitterEmail)) {
    return { ok: false, error: 'Please enter a valid email or leave it blank.' };
  }
  const subject = clampString(b.subject, 200);

  return {
    ok: true,
    value: {
      category,
      submitterName: submitterName || undefined,
      submitterEmail: submitterEmail || undefined,
      subject: subject || undefined,
      message,
    },
  };
}
