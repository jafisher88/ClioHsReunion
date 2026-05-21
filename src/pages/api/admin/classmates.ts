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
 *   Single add: { fullName, maidenName?, preferredFirstName?, notes?, isDeceased?,
 *                 linkRsvpId? }
 *   Bulk add:   { bulk: "line\nline\nline" } — one classmate per line.
 *               Each line may use "FullName | MaidenName" to set maiden.
 *
 * The optional `linkRsvpId` on the single-add path performs an atomic
 * create-and-link via env.DB.batch([INSERT, UPDATE]) — used by the
 * "Create classmate from this RSVP" button in /admin/classmates'
 * Unmatched section. D1's batch is a single SQL transaction, so a
 * UNIQUE-email collision on the INSERT rolls back the whole batch and
 * the RSVP's ClassmateId stays null. The UPDATE uses last_insert_rowid()
 * to pick up the just-inserted Classmate's id without a TS round-trip.
 * The RSVP's existence is pre-validated before the batch — without it,
 * a non-existent linkRsvpId would silently leave the Classmate row
 * dangling (SQLite UPDATE matching zero rows is not an error).
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

  // linkRsvpId only applies to the single-add path. Surfacing both
  // fields together is almost certainly a client bug — refuse cleanly
  // so the caller knows their intent isn't honored.
  const hasBulk = !!(body && typeof body === 'object'
    && typeof (body as Record<string, unknown>).bulk === 'string');
  const linkRsvpIdRaw = body && typeof body === 'object'
    ? (body as Record<string, unknown>).linkRsvpId
    : undefined;
  const hasLink = linkRsvpIdRaw !== undefined && linkRsvpIdRaw !== null;
  if (hasBulk && hasLink) {
    return jsonError('linkRsvpId only valid for single-add.', 400);
  }

  // Bulk path
  if (hasBulk) {
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

  // Parse + validate the optional link target. Pre-validate that the
  // RSVP exists BEFORE the batch — see the function-level JSDoc.
  let linkRsvpId: number | null = null;
  if (hasLink) {
    const parsed = typeof linkRsvpIdRaw === 'number'
      ? linkRsvpIdRaw
      : Number.parseInt(String(linkRsvpIdRaw), 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return jsonError('Missing or invalid linkRsvpId.', 400);
    }
    const rsvpExists = await env.DB
      .prepare('SELECT Id FROM Rsvps WHERE Id = ?1')
      .bind(parsed)
      .first<{ Id: number }>();
    if (!rsvpExists) return jsonError('RSVP not found.', 404);
    linkRsvpId = parsed;
  }

  try {
    const insert = env.DB
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
      );

    if (linkRsvpId !== null) {
      // Atomic create-and-link. last_insert_rowid() inside the second
      // batch statement resolves to the just-inserted Classmate id.
      // D1's batch() is one SQL transaction — failure on the INSERT
      // (e.g. UNIQUE email collision) rolls back both statements.
      const link = env.DB
        .prepare(
          `UPDATE Rsvps
              SET ClassmateId = last_insert_rowid(),
                  MatchedBy   = ?1,
                  MatchedAt   = CURRENT_TIMESTAMP
            WHERE Id = ?2`
        )
        .bind(admin.email, linkRsvpId);
      const results = await env.DB.batch([insert, link]);
      const insertedId = results[0]?.meta?.last_row_id ?? null;
      return Response.json({ ok: true, id: insertedId, linkedRsvpId: linkRsvpId });
    } else {
      const res = await insert.run();
      return Response.json({ ok: true, id: res.meta?.last_row_id ?? null });
    }
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
