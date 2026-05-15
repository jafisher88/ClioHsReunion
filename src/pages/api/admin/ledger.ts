import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAdmin } from '../../../lib/admin-auth';
import { parseAmount } from '../../../lib/ledger-amount';

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 500;

interface LedgerInput {
  entryDate: string;
  direction: 'in' | 'out';
  amountCents: number;
  category: string;
  counterparty: string | null;
  description: string | null;
  method: string | null;
  notes: string | null;
}

function clamp(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length === 0 ? null : trimmed;
}

function validate(body: unknown): { ok: true; value: LedgerInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request body.' };
  const b = body as Record<string, unknown>;

  const entryDate = typeof b.entryDate === 'string' ? b.entryDate.trim() : '';
  if (!DATE_RE.test(entryDate)) return { ok: false, error: 'Please provide a valid date (YYYY-MM-DD).' };

  const direction = b.direction;
  if (direction !== 'in' && direction !== 'out') return { ok: false, error: "Direction must be 'in' or 'out'." };

  const amountCents = parseAmount(b.amount ?? b.amountCents);
  if (amountCents === null) return { ok: false, error: 'Please enter a valid positive amount.' };
  if (amountCents > 100_000_000) return { ok: false, error: 'Amount looks too large — double-check.' };

  const category = clamp(b.category, 80);
  if (!category) return { ok: false, error: 'Please select or enter a category.' };

  return {
    ok: true,
    value: {
      entryDate,
      direction,
      amountCents,
      category,
      counterparty: clamp(b.counterparty, MAX_TEXT),
      description: clamp(b.description, MAX_TEXT),
      method: clamp(b.method, 40),
      notes: clamp(b.notes, 2000),
    },
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
