/**
 * Resend-to-new diff for the admin blast tool.
 *
 * Given the id of a campaign-root blast, computes who in the original
 * audience hasn't been sent to yet — across the root and every follow-up
 * blast in its chain. The POST /api/admin/blast/[id]/resend endpoint
 * calls this at send time to figure out who to mail.
 *
 * `ParentBlastId` always points to the chain ROOT (never the immediate
 * predecessor), so the "already sent" set is a single one-hop query:
 * EmailBlastSends rows whose BlastId is the root or any direct child of
 * the root.
 *
 * Custom-audience blasts can't be re-evaluated (the original recipient
 * list was a one-off admin-typed snapshot), so we refuse outright with
 * reason 'custom-audience'.
 */
import { recipientsFor } from '../pages/api/admin/blast';

export interface BlastRow {
  Id: number;
  Subject: string;
  BodyText: string;
  Audience: string;
  RecipientCount: number;
  SentBy: string;
  SentAt: string;
  ParentBlastId: number | null;
}

export type FollowUpReason = 'custom-audience' | 'no-audience' | 'no-new-recipients';

export interface FollowUpPreview {
  recipients: string[];
  alreadySentCount: number;
  totalAudienceNow: number;
  rootRow: BlastRow;
  reason: FollowUpReason | null;
}

/**
 * Loads the root blast, computes the audience-now via `recipientsFor`,
 * subtracts the union of EmailBlastSends.Email across the root + its
 * direct children, and returns the remaining recipients (plus diagnostic
 * counts the UI uses to render the resend card).
 *
 * Throws if no blast row exists for `rootBlastId`. Returns a `reason`
 * (and zero recipients) for any case where the resend is refused or
 * unproductive: custom audience, current audience is empty, current
 * audience is fully covered by prior sends.
 */
export async function recipientsForFollowUp(
  rootBlastId: number,
  db: D1Database,
): Promise<FollowUpPreview> {
  const rootRow = await db
    .prepare(
      `SELECT Id, Subject, BodyText, Audience, RecipientCount, SentBy, SentAt, ParentBlastId
         FROM EmailBlasts
        WHERE Id = ?1`,
    )
    .bind(rootBlastId)
    .first<BlastRow>();

  if (!rootRow) {
    throw new Error(`No blast found with Id=${rootBlastId}`);
  }

  if (rootRow.Audience === 'custom') {
    return {
      recipients: [],
      alreadySentCount: 0,
      totalAudienceNow: 0,
      rootRow,
      reason: 'custom-audience',
    };
  }

  // Audience-now: re-evaluate the same audience selector the root used.
  // recipientsFor() already lowercases emails and filters unsubscribes,
  // so the returned list is normalized and opt-out-respecting.
  const audienceNow = await recipientsFor(rootRow.Audience, db);

  // Already-sent set: every recipient row attached to the root or any
  // direct child. Children always point to the root (ParentBlastId =
  // root.Id), so this is one IN-subquery, no recursion needed.
  // LOWER(TRIM(...)) defends against any legacy rows that slipped in
  // before normalization existed in the send path.
  const sentRows = await db
    .prepare(
      `SELECT DISTINCT LOWER(TRIM(Email)) AS e
         FROM EmailBlastSends
        WHERE BlastId IN (
                SELECT ?1
                UNION
                SELECT Id FROM EmailBlasts WHERE ParentBlastId = ?1
              )`,
    )
    .bind(rootBlastId)
    .all<{ e: string }>();
  const alreadySent = new Set((sentRows.results ?? []).map((r: { e: string }) => r.e));

  const recipients = audienceNow.filter((e) => !alreadySent.has(e));

  let reason: FollowUpReason | null = null;
  if (audienceNow.length === 0) {
    reason = 'no-audience';
  } else if (recipients.length === 0) {
    reason = 'no-new-recipients';
  }

  return {
    recipients,
    alreadySentCount: alreadySent.size,
    totalAudienceNow: audienceNow.length,
    rootRow,
    reason,
  };
}
