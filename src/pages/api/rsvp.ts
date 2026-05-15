import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { validate } from '../../lib/validators/rsvp';

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
