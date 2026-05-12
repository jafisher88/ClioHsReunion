import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

interface RsvpPayload {
  fullName: string;          // current name (what they go by today)
  graduationName?: string;   // yearbook name
  preferredFirstName?: string;
  email: string;
  attending: 'yes' | 'no' | 'maybe';
  guestCount: string | number;
  notes?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function firstWord(value: string): string {
  return (value ?? '').trim().split(/\s+/)[0] ?? '';
}

function validate(body: unknown): { ok: true; value: RsvpPayload } | { ok: false; error: string } {
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

export const POST: APIRoute = async ({ request }) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Could not parse JSON.' }, { status: 400 });
  }

  const result = validate(payload);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  const db = env.DB;

  if (!db) {
    console.log('[rsvp] D1 binding missing; submission:', result.value);
    return Response.json({ ok: true, persisted: false }, { status: 200 });
  }

  try {
    await db
      .prepare(
        `INSERT INTO Rsvps (FullName, PreferredFirstName, GraduationName, Email, Attending, GuestCount, Notes)
         VALUES (?1, NULLIF(?2, ''), NULLIF(?3, ''), ?4, ?5, ?6, NULLIF(?7, ''))`
      )
      .bind(
        result.value.fullName,
        result.value.preferredFirstName ?? '',
        result.value.graduationName ?? '',
        result.value.email,
        result.value.attending,
        result.value.guestCount,
        result.value.notes ?? '',
      )
      .run();
  } catch (err) {
    console.error('[rsvp] failed to insert', err);
    return Response.json({ error: 'Could not save your RSVP. Please try again.' }, { status: 500 });
  }

  return Response.json({ ok: true, persisted: true }, { status: 200 });
};
