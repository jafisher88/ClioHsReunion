import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAdmin } from '../../../lib/admin-auth';

const MAX_NAME = 200;
const MAX_TRIBUTE = 4000;
const MAX_URL = 2000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function clampText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length === 0 ? null : trimmed;
}

function parseYear(value: unknown): number | null | 'invalid' {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n)) return 'invalid';
  if (n < MIN_YEAR || n > MAX_YEAR) return 'invalid';
  return n;
}

interface MemoriamInput {
  fullName: string;
  maidenName: string | null;
  birthYear: number | null;
  passingYear: number | null;
  tribute: string | null;
  photoUrl: string | null;
}

function validate(body: unknown): { ok: true; value: MemoriamInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request body.' };
  const b = body as Record<string, unknown>;

  const fullName = clampText(b.fullName, MAX_NAME);
  if (!fullName) return { ok: false, error: 'Please enter a name.' };

  const maidenName = clampText(b.maidenName, MAX_NAME);

  const birthYear = parseYear(b.birthYear);
  if (birthYear === 'invalid') return { ok: false, error: 'Birth year must be a valid year between 1900 and 2100.' };

  const passingYear = parseYear(b.passingYear);
  if (passingYear === 'invalid') return { ok: false, error: 'Passing year must be a valid year between 1900 and 2100.' };

  if (birthYear !== null && passingYear !== null && passingYear < birthYear) {
    return { ok: false, error: 'Passing year must be after birth year.' };
  }

  const tribute = clampText(b.tribute, MAX_TRIBUTE);
  const photoUrl = clampText(b.photoUrl, MAX_URL);
  if (photoUrl && !/^https?:\/\//i.test(photoUrl)) {
    return { ok: false, error: 'Photo URL must start with http:// or https://.' };
  }

  return {
    ok: true,
    value: { fullName, maidenName, birthYear, passingYear, tribute, photoUrl },
  };
}

export const POST: APIRoute = async ({ request }) => {
  const admin = await getAdmin(request, env);
  if (!admin) return jsonError('Not authorized.', 401);
  if (!env.DB) return jsonError('Database not configured.', 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Could not parse JSON.', 400);
  }
  const result = validate(body);
  if (!result.ok) return jsonError(result.error, 400);

  try {
    const res = await env.DB
      .prepare(
        `INSERT INTO MemoriamEntries (FullName, MaidenName, BirthYear, PassingYear, Tribute, PhotoUrl, CreatedBy)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      )
      .bind(
        result.value.fullName,
        result.value.maidenName,
        result.value.birthYear,
        result.value.passingYear,
        result.value.tribute,
        result.value.photoUrl,
        admin.email,
      )
      .run();
    return Response.json({ ok: true, id: res.meta?.last_row_id ?? null });
  } catch (err) {
    console.error('[admin/memoriam POST] insert failed', err);
    return jsonError('Could not save entry.', 500);
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  const admin = await getAdmin(request, env);
  if (!admin) return jsonError('Not authorized.', 401);
  if (!env.DB) return jsonError('Database not configured.', 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Could not parse JSON.', 400);
  }
  if (!body || typeof body !== 'object') return jsonError('Invalid request body.', 400);

  const idRaw = (body as Record<string, unknown>).id;
  const id = typeof idRaw === 'number' ? idRaw : Number.parseInt(String(idRaw), 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('Missing or invalid id.', 400);

  const result = validate(body);
  if (!result.ok) return jsonError(result.error, 400);

  try {
    const res = await env.DB
      .prepare(
        `UPDATE MemoriamEntries
            SET FullName = ?1, MaidenName = ?2, BirthYear = ?3,
                PassingYear = ?4, Tribute = ?5, PhotoUrl = ?6,
                UpdatedAt = CURRENT_TIMESTAMP
          WHERE Id = ?7`
      )
      .bind(
        result.value.fullName,
        result.value.maidenName,
        result.value.birthYear,
        result.value.passingYear,
        result.value.tribute,
        result.value.photoUrl,
        id,
      )
      .run();
    if ((res.meta?.changes ?? 0) === 0) return jsonError('Entry not found.', 404);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[admin/memoriam PATCH] update failed', err);
    return jsonError('Could not update entry.', 500);
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  const admin = await getAdmin(request, env);
  if (!admin) return jsonError('Not authorized.', 401);
  if (!env.DB) return jsonError('Database not configured.', 503);

  const url = new URL(request.url);
  let idRaw = url.searchParams.get('id');
  if (!idRaw) {
    try {
      const body = await request.json();
      if (body && typeof body === 'object' && 'id' in (body as Record<string, unknown>)) {
        idRaw = String((body as Record<string, unknown>).id);
      }
    } catch {
      // ignore
    }
  }
  const id = idRaw ? Number.parseInt(idRaw, 10) : NaN;
  if (!Number.isInteger(id) || id <= 0) return jsonError('Missing or invalid id.', 400);

  const res = await env.DB
    .prepare('DELETE FROM MemoriamEntries WHERE Id = ?1')
    .bind(id)
    .run();
  if ((res.meta?.changes ?? 0) === 0) return jsonError('Entry not found.', 404);
  return Response.json({ ok: true });
};
