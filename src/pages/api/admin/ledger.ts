import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAdmin } from '../../../lib/admin-auth';
import { validate } from '../../../lib/validators/ledger';

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
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
        `INSERT INTO LedgerEntries
           (EntryDate, Direction, AmountCents, Category, Counterparty, Description, Method, Notes, CreatedBy)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
      )
      .bind(
        result.value.entryDate,
        result.value.direction,
        result.value.amountCents,
        result.value.category,
        result.value.counterparty,
        result.value.description,
        result.value.method,
        result.value.notes,
        admin.email,
      )
      .run();
    return Response.json({ ok: true, id: res.meta?.last_row_id ?? null });
  } catch (err) {
    console.error('[admin/ledger POST] insert failed', err);
    return jsonError('Could not save ledger entry.', 500);
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
    .prepare('DELETE FROM LedgerEntries WHERE Id = ?1')
    .bind(id)
    .run();

  if ((res.meta?.changes ?? 0) === 0) return jsonError('Entry not found.', 404);
  return Response.json({ ok: true });
};
