import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { validate } from '../../lib/validators/volunteer';

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
    console.log('[volunteer] D1 binding missing; submission:', result.value);
    return Response.json({ ok: true, persisted: false }, { status: 200 });
  }

  try {
    await db
      .prepare(
        `INSERT INTO Volunteers (FullName, Email, Phone, RoleSetup, RoleCleanup, Notes)
         VALUES (?1, ?2, NULLIF(?3, ''), ?4, ?5, NULLIF(?6, ''))`
      )
      .bind(
        result.value.fullName,
        result.value.email,
        result.value.phone,
        result.value.roleSetup ? 1 : 0,
        result.value.roleCleanup ? 1 : 0,
        result.value.notes,
      )
      .run();
  } catch (err) {
    console.error('[volunteer] failed to insert', err);
    return Response.json({ error: 'Could not save your sign-up. Please try again.' }, { status: 500 });
  }

  return Response.json({ ok: true, persisted: true }, { status: 200 });
};
