import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

interface VolunteerPayload {
  fullName: string;
  email: string;
  phone: string;
  roleSetup: boolean;
  roleCleanup: boolean;
  notes: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.toLowerCase();
    return s === 'true' || s === 'on' || s === '1' || s === 'yes';
  }
  return false;
}

function validate(body: unknown): { ok: true; value: VolunteerPayload } | { ok: false; error: string } {
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
