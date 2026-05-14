import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAdmin } from '../../../../../lib/admin-auth';
import { resendGetEmail } from '../../../../../lib/resend';

interface SendRow {
  Id: number;
  Email: string;
  ResendId: string | null;
  Status: string;
}

/**
 * POST /api/admin/blast/:id/refresh
 *
 * Polls Resend's GET /emails/:id for every send row that has a ResendId,
 * updates Status + LastCheckedAt, and returns a small per-status tally.
 *
 * Concurrency-limited so we stay under Resend's 2 req/sec free-tier rate
 * limit (still works fine on Pro at 10/sec — just slower than necessary).
 */
export const POST: APIRoute = async ({ request, params }) => {
  const admin = await getAdmin(request, env);
  if (!admin) return Response.json({ error: 'Not authorized.' }, { status: 401 });
  if (!env.DB) return Response.json({ error: 'Database not configured.' }, { status: 503 });
  if (!env.RESEND_API_KEY) {
    return Response.json({ error: 'Resend not configured. Set RESEND_API_KEY secret.' }, { status: 503 });
  }

  const blastId = Number.parseInt(String(params.id ?? ''), 10);
  if (!Number.isInteger(blastId) || blastId <= 0) {
    return Response.json({ error: 'Bad blast id.' }, { status: 400 });
  }

  const blastExists = await env.DB
    .prepare('SELECT Id FROM EmailBlasts WHERE Id = ?1')
    .bind(blastId)
    .first<{ Id: number }>();
  if (!blastExists) return Response.json({ error: 'Blast not found.' }, { status: 404 });

  const sendsRes = await env.DB
    .prepare('SELECT Id, Email, ResendId, Status FROM EmailBlastSends WHERE BlastId = ?1')
    .bind(blastId)
    .all<SendRow>();
  const rows = sendsRes.results ?? [];
  const withId = rows.filter((r) => r.ResendId);

  const tally: Record<string, number> = {};
  let updated = 0;
  let notFound = 0;
  const errors: string[] = [];

  // Sequential, light-touch polling. ~500ms per row keeps us within free-tier
  // limits; admin can see "Refreshing…" and reload when done. For larger
  // blasts (200+) we could fan out with a small concurrency, but keep it
  // simple for now.
  for (const row of withId) {
    try {
      const status = await resendGetEmail(env.RESEND_API_KEY!, row.ResendId!);
      if (!status) {
        notFound++;
        tally['unknown'] = (tally['unknown'] ?? 0) + 1;
        continue;
      }
      const lastEvent = (status.last_event ?? 'sent').toLowerCase();
      tally[lastEvent] = (tally[lastEvent] ?? 0) + 1;
      if (lastEvent !== row.Status) {
        await env.DB
          .prepare(
            `UPDATE EmailBlastSends
                SET Status = ?1,
                    LastCheckedAt = CURRENT_TIMESTAMP
              WHERE Id = ?2`
          )
          .bind(lastEvent, row.Id)
          .run();
        updated++;
      } else {
        await env.DB
          .prepare('UPDATE EmailBlastSends SET LastCheckedAt = CURRENT_TIMESTAMP WHERE Id = ?1')
          .bind(row.Id)
          .run();
      }
    } catch (err) {
      errors.push(`${row.Email}: ${(err as Error).message}`);
    }
  }

  return Response.json({
    ok: true,
    polled: withId.length,
    skipped: rows.length - withId.length,
    updated,
    notFound,
    tally,
    errors: errors.slice(0, 5),
  });
};
