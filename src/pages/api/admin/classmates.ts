import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAdmin } from '../../../lib/admin-auth';
import { validate } from '../../../lib/validators/classmates';

const MAX_NAME = 200;

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/**
 * POST /api/admin/classmates
 *   Single add: { fullName, maidenName?, preferredFirstName?, notes?, isDeceased? }
 *   Bulk add:   { bulk: "line\nline\nline" } — one classmate per line.
 *               Each line may use "FullName | MaidenName" to set maiden.
 */
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

  // Bulk path
  if (body && typeof body === 'object' && typeof (body as Record<string, unknown>).bulk === 'string') {
    const text = (body as Record<string, unknown>).bulk as string;
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return jsonError('No lines to import.', 400);
    if (lines.length > 1000) return jsonError('Too many lines (max 1000).', 413);

    let added = 0;
    const errors: string[] = [];
    for (const line of lines) {
      const [name, maiden] = line.split('|').map((s) => s.trim());
      if (!name) { errors.push(`Skipped empty: "${line}"`); continue; }
      try {
        await env.DB
          .prepare(
            `INSERT INTO Classmates (FullName, MaidenName, CreatedBy)
             VALUES (?1, ?2, ?3)`
          )
          .bind(name.slice(0, MAX_NAME), (maiden || '').slice(0, MAX_NAME) || null, admin.email)
          .run();
        added += 1;
      } catch (err) {
        errors.push(`Failed: "${line}" — ${(err as Error).message}`);
      }
    }
    return Response.json({ ok: true, added, total: lines.length, errors });
  }

  // Single-add path
  const result = validate(body);
  if (!result.ok) return jsonError(result.error, 400);
  try {
    const res = await env.DB
      .prepare(
        `INSERT INTO Classmates
           (FullName, MaidenName, PreferredFirstName, Email, Notes, IsDeceased,
            BirthYear, PassingYear, Tribute, PhotoUrl, ObituaryUrl, CreatedBy)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
      )
      .bind(
        result.value.fullName,
        result.value.maidenName,
        result.value.preferredFirstName,
        result.value.email,
        result.value.notes,
        result.value.isDeceased ? 1 : 0,
        result.value.isDeceased ? result.value.birthYear   : null,
        result.value.isDeceased ? result.value.passingYear : null,
        result.value.isDeceased ? result.value.tribute     : null,
        result.value.isDeceased ? result.value.photoUrl    : null,
        result.value.isDeceased ? result.value.obituaryUrl : null,
        admin.email,
      )
      .run();
    return Response.json({ ok: true, id: res.meta?.last_row_id ?? null });
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    if (msg.includes('UNIQUE') && msg.toLowerCase().includes('email')) {
      return jsonError('Another classmate already has that email.', 409);
    }
    console.error('[admin/classmates POST] insert failed', err);
    return jsonError('Could not save classmate.', 500);
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
  if (!body || typeof body !== 'object') return jsonError('Invalid body.', 400);

  const idRaw = (body as Record<string, unknown>).id;
  const id = typeof idRaw === 'number' ? idRaw : Number.parseInt(String(idRaw), 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('Missing or invalid id.', 400);

  const result = validate(body);
  if (!result.ok) return jsonError(result.error, 400);

  try {
    const res = await env.DB
      .prepare(
        `UPDATE Classmates
            SET FullName = ?1, MaidenName = ?2, PreferredFirstName = ?3,
                Email = ?4, Notes = ?5, IsDeceased = ?6,
                BirthYear   = ?7,
                PassingYear = ?8,
                Tribute     = ?9,
                PhotoUrl    = ?10,
                ObituaryUrl = ?11,
                UpdatedAt = CURRENT_TIMESTAMP
          WHERE Id = ?12`
      )
      .bind(
        result.value.fullName,
        result.value.maidenName,
        result.value.preferredFirstName,
        result.value.email,
        result.value.notes,
        result.value.isDeceased ? 1 : 0,
        result.value.isDeceased ? result.value.birthYear   : null,
        result.value.isDeceased ? result.value.passingYear : null,
        result.value.isDeceased ? result.value.tribute     : null,
        result.value.isDeceased ? result.value.photoUrl    : null,
        result.value.isDeceased ? result.value.obituaryUrl : null,
        id,
      )
      .run();
    if ((res.meta?.changes ?? 0) === 0) return jsonError('Classmate not found.', 404);
    return Response.json({ ok: true });
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    if (msg.includes('UNIQUE') && msg.toLowerCase().includes('email')) {
      return jsonError('Another classmate already has that email.', 409);
    }
    console.error('[admin/classmates PATCH] update failed', err);
    return jsonError('Could not update classmate.', 500);
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

  const res = await env.DB.prepare('DELETE FROM Classmates WHERE Id = ?1').bind(id).run();
  if ((res.meta?.changes ?? 0) === 0) return jsonError('Classmate not found.', 404);
  return Response.json({ ok: true });
};
