import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAdmin } from '../../../../../lib/admin-auth';
import { resendGetEmail } from '../../../../../lib/resend';

interface SendRow {
  Id: number;
  Email: string;
  ResendId: string | null;
  Status: string;
  LastCheckedAt: string | null;
}

/**
 * POST /api/admin/blast/:id/refresh
 *
 * Polls Resend's GET /emails/:id for every send row that has a ResendId,
 * updates Status + LastCheckedAt, and returns a per-status tally.
 *
 * Now that the webhook receiver also lands status updates, this endpoint
 * is mostly a backfill / safety net. We optimize accordingly:
 *   - Skip rows whose status is already terminal (clicked / bounced /
 *     complained / failed) — those won't change again.
 *   - Skip rows checked in the last RECENCY_SECONDS unless ?force=1.
 *   - Poll the remainder in waves of WAVE_SIZE concurrent requests.
 *
 * Resend's docs put the rate limit at 10 req/sec; a wave of 5 keeps a wide
 * safety margin while still being ~5× faster than sequential.
 */
const WAVE_SIZE = 5;
const RECENCY_SECONDS = 120;
const TERMINAL_STATUSES = new Set(['clicked', 'bounced', 'complained', 'failed']);

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

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  const blastExists = await env.DB
    .prepare('SELECT Id FROM EmailBlasts WHERE Id = ?1')
    .bind(blastId)
    .first<{ Id: number }>();
  if (!blastExists) return Response.json({ error: 'Blast not found.' }, { status: 404 });

  const sendsRes = await env.DB
    .prepare('SELECT Id, Email, ResendId, Status, LastCheckedAt FROM EmailBlastSends WHERE BlastId = ?1')
    .bind(blastId)
    .all<SendRow>();
  const rows = sendsRes.results ?? [];

  const cutoffMs = Date.now() - RECENCY_SECONDS * 1000;
  const recentlyChecked = (row: SendRow): boolean => {
    if (!row.LastCheckedAt) return false;
    // SQLite CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" in UTC. Append Z so
    // Date treats it as UTC instead of local.
    const t = Date.parse(row.LastCheckedAt.replace(' ', 'T') + 'Z');
    return Number.isFinite(t) && t > cutoffMs;
  };

  // Build the actual work list: must have a ResendId, must not be terminal,
  // and must not have been checked very recently (unless force).
  const skippedNoId    = rows.filter((r) => !r.ResendId).length;
  const skippedDone    = rows.filter((r) => r.ResendId && TERMINAL_STATUSES.has(r.Status)).length;
  const candidatePool  = rows.filter((r) => r.ResendId && !TERMINAL_STATUSES.has(r.Status));
  const toPoll         = force ? candidatePool : candidatePool.filter((r) => !recentlyChecked(r));
  const skippedRecent  = candidatePool.length - toPoll.length;

  const tally: Record<string, number> = {};
  const errors: string[] = [];
  let updated = 0;
  let notFound = 0;

  // Process one row's status update. Pulled out so Promise.all can fan it
  // across a wave. Errors surface into the shared `errors` array; everything
  // else mutates the shared tally / counters under the single-threaded JS
  // event loop, so no locking needed.
  async function pollOne(row: SendRow): Promise<void> {
    try {
      const status = await resendGetEmail(env.RESEND_API_KEY!, row.ResendId!);
      if (!status) {
        notFound++;
        tally['unknown'] = (tally['unknown'] ?? 0) + 1;
        return;
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

  for (let i = 0; i < toPoll.length; i += WAVE_SIZE) {
    const wave = toPoll.slice(i, i + WAVE_SIZE);
    await Promise.all(wave.map(pollOne));
  }

  return Response.json({
    ok: true,
    polled: toPoll.length,
    skipped: {
      noResendId: skippedNoId,
      terminal: skippedDone,
      recentlyChecked: skippedRecent,
    },
    forced: force,
    updated,
    notFound,
    tally,
    errors: errors.slice(0, 5),
  });
};
