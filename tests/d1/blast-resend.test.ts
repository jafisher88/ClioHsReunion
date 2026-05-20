import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recipientsForFollowUp } from '../../src/lib/blast-resend';

// Covers the resend-diff helper used by /api/admin/blast/[id]/resend.
// Diff = audience-now MINUS recipients in EmailBlastSends for the root +
// any child blast (ParentBlastId = root). Unsubscribes are honored
// transitively because recipientsFor() already filters them. Custom
// audiences are refused outright (their original recipient list isn't
// re-evaluable).

async function clearAll() {
  // FK-safe order: children before parents. EmailBlastSends references
  // EmailBlasts (ON DELETE CASCADE), and as of migration 0021 EmailBlasts
  // self-references via ParentBlastId (ON DELETE SET NULL).
  await env.DB.prepare(`DELETE FROM EmailBlastSends`).run();
  await env.DB.prepare(`DELETE FROM EmailBlasts`).run();
  await env.DB.prepare(`DELETE FROM Rsvps`).run();
  await env.DB.prepare(`DELETE FROM Unsubscribes`).run();
}

async function seedRsvp(email: string, attending: 'yes' | 'maybe' | 'no' = 'yes') {
  await env.DB
    .prepare(`INSERT INTO Rsvps (FullName, Email, Attending) VALUES (?1, ?2, ?3)`)
    .bind('Test Person', email, attending)
    .run();
}

async function seedBlast(args: { audience: string; parentId?: number | null }): Promise<number> {
  const row = await env.DB
    .prepare(
      `INSERT INTO EmailBlasts (Subject, BodyText, Audience, RecipientCount, SentBy, ParentBlastId)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       RETURNING Id`,
    )
    .bind('Test Subject', 'Test body', args.audience, 0, 'admin@example.com', args.parentId ?? null)
    .first<{ Id: number }>();
  return row!.Id;
}

async function seedSend(blastId: number, email: string) {
  await env.DB
    .prepare(`INSERT INTO EmailBlastSends (BlastId, Email) VALUES (?1, ?2)`)
    .bind(blastId, email)
    .run();
}

async function seedUnsubscribe(email: string) {
  await env.DB
    .prepare(`INSERT INTO Unsubscribes (Email, Source) VALUES (?1, 'manual')`)
    .bind(email)
    .run();
}

describe('recipientsForFollowUp (resend diff helper)', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('blast-resend.root-only.no-new: returns no-new-recipients when audience-now equals root send list', async () => {
    await seedRsvp('a@example.com');
    await seedRsvp('b@example.com');
    const rootId = await seedBlast({ audience: 'rsvp-yes' });
    await seedSend(rootId, 'a@example.com');
    await seedSend(rootId, 'b@example.com');

    const result = await recipientsForFollowUp(rootId, env.DB);

    expect(result).toMatchObject({ recipients: [], reason: 'no-new-recipients' });
  });

  it('blast-resend.root-only.has-new: returns only newcomers since root send', async () => {
    await seedRsvp('a@example.com');
    await seedRsvp('b@example.com');
    await seedRsvp('new@example.com');
    const rootId = await seedBlast({ audience: 'rsvp-yes' });
    await seedSend(rootId, 'a@example.com');
    await seedSend(rootId, 'b@example.com');

    const result = await recipientsForFollowUp(rootId, env.DB);

    expect(result.recipients.sort()).toEqual(['new@example.com']);
  });

  it('blast-resend.chain.excludes-children-too: depth-3 diff excludes both root and child sends', async () => {
    // Audience now: {a, b, c}. Root sent to {a}. Child of root sent to {b}.
    // Calling the helper with root's id must yield {c} — i.e. the diff
    // covers root.Id ∪ children-of-root.Id, not just root.Id alone.
    await seedRsvp('a@example.com');
    await seedRsvp('b@example.com');
    await seedRsvp('c@example.com');
    const rootId = await seedBlast({ audience: 'rsvp-yes' });
    await seedSend(rootId, 'a@example.com');
    const childId = await seedBlast({ audience: 'rsvp-yes', parentId: rootId });
    await seedSend(childId, 'b@example.com');

    const result = await recipientsForFollowUp(rootId, env.DB);

    expect(result.recipients.sort()).toEqual(['c@example.com']);
  });

  it('blast-resend.custom-audience.refused: returns custom-audience reason', async () => {
    const rootId = await seedBlast({ audience: 'custom' });

    const result = await recipientsForFollowUp(rootId, env.DB);

    expect(result.reason).toEqual('custom-audience');
  });

  it('blast-resend.custom-audience.empty-recipients: returns no recipients even if Rsvps exist', async () => {
    // Custom audiences can't be re-evaluated (the original list was an
    // admin-typed snapshot), so even with seed audience data we hand
    // back an empty recipient list.
    await seedRsvp('a@example.com');
    const rootId = await seedBlast({ audience: 'custom' });

    const result = await recipientsForFollowUp(rootId, env.DB);

    expect(result.recipients.length).toEqual(0);
  });

  it('blast-resend.unsubscribe.honored: excludes unsubscribed address even when freshly in audience', async () => {
    // unsub@example.com is a brand-new RSVP (never received the root
    // blast) but has unsubscribed; the diff must still filter them out.
    await seedRsvp('a@example.com');
    await seedRsvp('unsub@example.com');
    const rootId = await seedBlast({ audience: 'rsvp-yes' });
    await seedSend(rootId, 'a@example.com');
    await seedUnsubscribe('unsub@example.com');

    const result = await recipientsForFollowUp(rootId, env.DB);

    expect(result.recipients).toEqual([]);
  });

  it('blast-resend.no-audience: returns no-audience when current audience evaluates to zero', async () => {
    // No RSVPs at all — audience-now is empty, so distinguish this from
    // "no new" (where audience > 0 but all already sent).
    const rootId = await seedBlast({ audience: 'rsvp-yes' });

    const result = await recipientsForFollowUp(rootId, env.DB);

    expect(result.reason).toEqual('no-audience');
  });
});
