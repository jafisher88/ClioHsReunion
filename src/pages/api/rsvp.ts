import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

interface RsvpPayload {
  fullName: string;
  email: string;
  attending: 'yes' | 'no' | 'maybe';
  guestCount: string | number;
  maidenName?: string;
  notes?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(body: unknown): { ok: true; value: RsvpPayload } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request body.' };
  const b = body as Record<string, unknown>;

  const fullName = typeof b.fullName === 'string' ? b.fullName.trim() : '';
  if (!fullName) return { ok: false, error: 'Please enter your name.' };
  if (fullName.length > 200) return { ok: false, error: 'Name is too long.' };

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

  const maidenName = typeof b.maidenName === 'string' ? b.maidenName.trim().slice(0, 200) : undefined;
  const notes = typeof b.notes === 'string' ? b.notes.trim().slice(0, 2000) : undefined;

  return {
    ok: true,
    value: { fullName, email, attending, guestCount, maidenName, notes },
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
    // D1 not yet wired up — log so the organizer can still see submissions during local dev.
    console.log('[rsvp] D1 binding missing; submission:', result.value);
    return Response.json({ ok: true, persisted: false }, { status: 200 });
  }

  try {
    await db
      .prepare(
        `INSERT INTO Rsvps (FullName, Email, Attending, GuestCount, MaidenName, Notes)
         VALUES (?1, ?2, ?3, ?4, NULLIF(?5, ''), NULLIF(?6, ''))`
      )
      .bind(
        result.value.fullName,
        result.value.email,
        result.value.attending,
        result.value.guestCount,
        result.value.maidenName ?? '',
        result.value.notes ?? '',
      )
      .run();
  } catch (err) {
    console.error('[rsvp] failed to insert', err);
    return Response.json({ error: 'Could not save your RSVP. Please try again.' }, { status: 500 });
  }

  return Response.json({ ok: true, persisted: true }, { status: 200 });
};
