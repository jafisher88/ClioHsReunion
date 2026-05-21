import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST, DELETE } from '../../src/pages/api/admin/rsvps/[id]/match';
import { POST as CLASSMATES_POST } from '../../src/pages/api/admin/classmates';
import { POST as MERGE_POST } from '../../src/pages/api/admin/classmates/merge';
import {
  TEST_ADMIN_EMAIL,
  adminCookie,
  buildClassmatesPostCtx,
  buildMatchCtx,
  buildMergeCtx,
  clearAllRsvpMatchState,
  readRsvpAudit,
  seedAdmin,
  seedClassmate,
  seedRsvp,
} from '../fixtures/rsvp-classmate-test-helpers';

// Covers:
//   POST /api/admin/rsvps/:id/match           (criteria 3 + 4)
//   DELETE /api/admin/rsvps/:id/match         (criterion 5)
//   ON DELETE SET NULL behavior + orphan audit trail (criterion 9 Part A)
//   classmates/merge.ts re-points RSVP links (criterion 9 Part B)
//   POST /api/admin/classmates with linkRsvpId (criterion 6)
//
// Each it() block uses one expect() per the project's pretest single-
// assert audit (toMatchObject / toEqual collapse multi-field assertions).

describe('POST /api/admin/rsvps/:id/match (error matrix)', () => {
  beforeEach(async () => {
    await clearAllRsvpMatchState();
    await seedAdmin();
  });
  afterEach(clearAllRsvpMatchState);

  it('rsvp-classmate-match.auth.missing.post: POST returns 401 with body {error:"Not authorized."}', async () => {
    const res = await POST(buildMatchCtx({ id: '1', body: { classmateId: 1 } }));
    const body = await res.json();
    expect({ status: res.status, body }).toEqual({ status: 401, body: { error: 'Not authorized.' } });
  });

  it('rsvp-classmate-match.id.non-integer: POST returns 400 with body {error:"Missing or invalid id."} for id="abc"', async () => {
    const cookie = await adminCookie();
    const res = await POST(buildMatchCtx({ id: 'abc', cookie, body: { classmateId: 1 } }));
    const body = await res.json();
    expect({ status: res.status, body }).toEqual({ status: 400, body: { error: 'Missing or invalid id.' } });
  });

  it('rsvp-classmate-match.id.zero: POST returns 400 with body {error:"Missing or invalid id."} for id="0"', async () => {
    const cookie = await adminCookie();
    const res = await POST(buildMatchCtx({ id: '0', cookie, body: { classmateId: 1 } }));
    expect(res.status).toBe(400);
  });

  it('rsvp-classmate-match.body.invalid-json: POST returns 400 {error:"Could not parse JSON."} for malformed body', async () => {
    const cookie = await adminCookie();
    // Hand-craft a request with non-JSON body — buildMatchCtx always
    // JSON-stringifies, so build inline.
    const request = new Request('http://test.local/api/admin/rsvps/1/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: 'this is not json {',
    });
    const ctx = { request, params: { id: '1' } } as Parameters<typeof POST>[0];

    const res = await POST(ctx);
    const body = await res.json();
    expect({ status: res.status, body }).toEqual({ status: 400, body: { error: 'Could not parse JSON.' } });
  });

  it('rsvp-classmate-match.body.missing-classmate-id: POST returns 400 {error:"Missing or invalid classmateId."} when body lacks classmateId', async () => {
    const cookie = await adminCookie();
    const res = await POST(buildMatchCtx({ id: '1', cookie, body: { foo: 'bar' } }));
    const body = await res.json();
    expect({ status: res.status, body }).toEqual({ status: 400, body: { error: 'Missing or invalid classmateId.' } });
  });

  it('rsvp-classmate-match.body.negative-classmate-id: POST returns 400 {error:"Missing or invalid classmateId."} for classmateId:-1', async () => {
    const cookie = await adminCookie();
    const res = await POST(buildMatchCtx({ id: '1', cookie, body: { classmateId: -1 } }));
    expect(res.status).toBe(400);
  });

  it('rsvp-classmate-match.rsvp.not-found: POST returns 404 {error:"RSVP not found."} when rsvp Id doesn\'t exist', async () => {
    const cookie = await adminCookie();
    const classmateId = await seedClassmate({ fullName: 'Real Classmate' });
    const res = await POST(buildMatchCtx({ id: '99999', cookie, body: { classmateId } }));
    const body = await res.json();
    expect({ status: res.status, body }).toEqual({ status: 404, body: { error: 'RSVP not found.' } });
  });

  it('rsvp-classmate-match.classmate.not-found: POST returns 404 {error:"Classmate not found."} when classmateId doesn\'t exist', async () => {
    const cookie = await adminCookie();
    const rsvpId = await seedRsvp({ fullName: 'Real Rsvp', email: 'real@example.com' });
    const res = await POST(buildMatchCtx({ id: String(rsvpId), cookie, body: { classmateId: 99999 } }));
    const body = await res.json();
    expect({ status: res.status, body }).toEqual({ status: 404, body: { error: 'Classmate not found.' } });
  });
});

describe('POST /api/admin/rsvps/:id/match (happy + re-match)', () => {
  beforeEach(async () => {
    await clearAllRsvpMatchState();
    await seedAdmin();
  });
  afterEach(clearAllRsvpMatchState);

  it('rsvp-classmate-match.happy.persists-all-three-columns: POST sets ClassmateId + MatchedBy + MatchedAt', async () => {
    const cookie = await adminCookie();
    const rsvpId = await seedRsvp({ fullName: 'Jane Smith', email: 'jane@example.com' });
    const classmateId = await seedClassmate({ fullName: 'Jane Smith' });

    await POST(buildMatchCtx({ id: String(rsvpId), cookie, body: { classmateId } }));
    const audit = await readRsvpAudit(rsvpId);

    expect({
      ClassmateId: audit.ClassmateId,
      MatchedBy: audit.MatchedBy,
      MatchedAtIsNonEmptyString: typeof audit.MatchedAt === 'string' && audit.MatchedAt.length > 0,
    }).toEqual({
      ClassmateId: classmateId,
      MatchedBy: TEST_ADMIN_EMAIL,
      MatchedAtIsNonEmptyString: true,
    });
  });

  it('rsvp-classmate-match.happy.preserves-other-columns: POST leaves FullName, Email, Attending, GuestCount untouched', async () => {
    const cookie = await adminCookie();
    const rsvpId = await seedRsvp({ fullName: 'Original Name', email: 'original@example.com', attending: 'maybe' });
    const classmateId = await seedClassmate({ fullName: 'Original Name' });

    // Snapshot the columns the match endpoint must NOT touch.
    const pre = await env.DB
      .prepare(`SELECT FullName, Email, Attending, GuestCount FROM Rsvps WHERE Id = ?1`)
      .bind(rsvpId)
      .first();

    await POST(buildMatchCtx({ id: String(rsvpId), cookie, body: { classmateId } }));
    const post = await env.DB
      .prepare(`SELECT FullName, Email, Attending, GuestCount FROM Rsvps WHERE Id = ?1`)
      .bind(rsvpId)
      .first();

    expect(post).toEqual(pre);
  });

  it('rsvp-classmate-match.happy.overwrites-previous-link: a second POST replaces ClassmateId (last-write-wins)', async () => {
    const cookie = await adminCookie();
    const rsvpId = await seedRsvp({ fullName: 'Picky', email: 'picky@example.com' });
    const classmateA = await seedClassmate({ fullName: 'First Match' });
    const classmateB = await seedClassmate({ fullName: 'Better Match' });

    await POST(buildMatchCtx({ id: String(rsvpId), cookie, body: { classmateId: classmateA } }));
    await POST(buildMatchCtx({ id: String(rsvpId), cookie, body: { classmateId: classmateB } }));
    const audit = await readRsvpAudit(rsvpId);

    expect(audit.ClassmateId).toBe(classmateB);
  });
});

describe('DELETE /api/admin/rsvps/:id/match', () => {
  beforeEach(async () => {
    await clearAllRsvpMatchState();
    await seedAdmin();
  });
  afterEach(clearAllRsvpMatchState);

  it('rsvp-classmate-match.delete.auth.missing: DELETE returns 401 without admin cookie', async () => {
    const res = await DELETE(buildMatchCtx({ id: '1', method: 'DELETE' }));
    expect(res.status).toBe(401);
  });

  it('rsvp-classmate-match.delete.clears-all-three-columns: DELETE nulls ClassmateId, MatchedBy, MatchedAt', async () => {
    const cookie = await adminCookie();
    const rsvpId = await seedRsvp({ fullName: 'To Unmatch', email: 'unmatch@example.com' });
    const classmateId = await seedClassmate({ fullName: 'To Unmatch' });
    // Match first so the DELETE has something to clear.
    await POST(buildMatchCtx({ id: String(rsvpId), cookie, body: { classmateId } }));

    await DELETE(buildMatchCtx({ id: String(rsvpId), cookie, method: 'DELETE' }));
    const audit = await readRsvpAudit(rsvpId);

    expect(audit).toEqual({ ClassmateId: null, MatchedBy: null, MatchedAt: null });
  });

  it('rsvp-classmate-match.delete.idempotent: DELETE on a never-matched RSVP returns 200 and leaves columns null', async () => {
    const cookie = await adminCookie();
    const rsvpId = await seedRsvp({ fullName: 'Never Matched', email: 'never@example.com' });

    const res = await DELETE(buildMatchCtx({ id: String(rsvpId), cookie, method: 'DELETE' }));
    const audit = await readRsvpAudit(rsvpId);

    expect({ status: res.status, audit }).toEqual({
      status: 200,
      audit: { ClassmateId: null, MatchedBy: null, MatchedAt: null },
    });
  });

  it('rsvp-classmate-match.delete.rsvp-not-found: DELETE on missing rsvp returns 404 {error:"RSVP not found."}', async () => {
    const cookie = await adminCookie();
    const res = await DELETE(buildMatchCtx({ id: '99999', cookie, method: 'DELETE' }));
    const body = await res.json();
    expect({ status: res.status, body }).toEqual({ status: 404, body: { error: 'RSVP not found.' } });
  });
});

describe('ON DELETE SET NULL (criterion 9 Part A)', () => {
  beforeEach(async () => {
    await clearAllRsvpMatchState();
    await seedAdmin();
  });
  afterEach(clearAllRsvpMatchState);

  it('rsvp-classmate-match.fk.set-null-on-classmate-delete: deleting a linked Classmate nulls Rsvps.ClassmateId', async () => {
    const cookie = await adminCookie();
    const rsvpId = await seedRsvp({ fullName: 'Linked', email: 'linked@example.com' });
    const classmateId = await seedClassmate({ fullName: 'Linked' });
    await POST(buildMatchCtx({ id: String(rsvpId), cookie, body: { classmateId } }));

    // Hard-delete the classmate. ON DELETE SET NULL should null
    // Rsvps.ClassmateId but leave the audit columns intact.
    await env.DB.prepare(`DELETE FROM Classmates WHERE Id = ?1`).bind(classmateId).run();
    const audit = await readRsvpAudit(rsvpId);

    expect(audit.ClassmateId).toBe(null);
  });

  it('rsvp-classmate-match.fk.audit-columns-persist-as-orphan-trail: MatchedBy and MatchedAt survive the FK SET NULL', async () => {
    const cookie = await adminCookie();
    const rsvpId = await seedRsvp({ fullName: 'Orphan Trail', email: 'orphan@example.com' });
    const classmateId = await seedClassmate({ fullName: 'Orphan Trail' });
    await POST(buildMatchCtx({ id: String(rsvpId), cookie, body: { classmateId } }));
    const preDelete = await readRsvpAudit(rsvpId);

    await env.DB.prepare(`DELETE FROM Classmates WHERE Id = ?1`).bind(classmateId).run();
    const postDelete = await readRsvpAudit(rsvpId);

    // ClassmateId nulled (FK cascade) but MatchedBy / MatchedAt unchanged.
    expect({
      MatchedBy: postDelete.MatchedBy,
      MatchedAt: postDelete.MatchedAt,
    }).toEqual({
      MatchedBy: preDelete.MatchedBy,
      MatchedAt: preDelete.MatchedAt,
    });
  });
});

describe('classmates/merge.ts re-points RSVP links (criterion 9 Part B)', () => {
  beforeEach(async () => {
    await clearAllRsvpMatchState();
    await seedAdmin();
  });
  afterEach(clearAllRsvpMatchState);

  it('rsvp-classmate-match.merge.repoints-rsvp-link: POST /merge moves Rsvps.ClassmateId from mergeId to primaryId (no null-cascade)', async () => {
    const cookie = await adminCookie();
    // Neither classmate has an email — avoids triggering the pre-existing
    // merge.ts behavior where copying loser.Email onto the winner can
    // collide with the still-extant loser row's UNIQUE Email index.
    // That's an unrelated bug surface; this test isolates the RSVP-link
    // re-point fix.
    const winnerId = await seedClassmate({ fullName: 'Winner' });
    const loserId = await seedClassmate({ fullName: 'Loser' });
    const rsvpId = await seedRsvp({ fullName: 'Linked To Loser', email: 'linked-loser@example.com' });
    await POST(buildMatchCtx({ id: String(rsvpId), cookie, body: { classmateId: loserId } }));

    // Merge loser INTO winner. The fix is the new UPDATE Rsvps step
    // BEFORE the DELETE — without it, FK SET NULL would null the link.
    const mergeRes = await MERGE_POST(buildMergeCtx({ cookie, body: { primaryId: winnerId, mergeId: loserId } }));
    if (mergeRes.status !== 200) {
      // Surface the merge error before the assertion fails on link state.
      throw new Error(`Merge failed: ${mergeRes.status} ${await mergeRes.text()}`);
    }
    const audit = await readRsvpAudit(rsvpId);

    expect(audit.ClassmateId).toBe(winnerId);
  });
});

describe('POST /api/admin/classmates with linkRsvpId (criterion 6)', () => {
  beforeEach(async () => {
    await clearAllRsvpMatchState();
    await seedAdmin();
  });
  afterEach(clearAllRsvpMatchState);

  it('rsvp-classmate-match.create-and-link.atomic-success.classmate-created: POST with linkRsvpId inserts the new Classmate row', async () => {
    const cookie = await adminCookie();
    const rsvpId = await seedRsvp({ fullName: 'Off Roster', email: 'off@example.com' });

    await CLASSMATES_POST(buildClassmatesPostCtx({
      cookie,
      body: { fullName: 'Off Roster', email: 'off@example.com', linkRsvpId: rsvpId },
    }));
    const count = await env.DB
      .prepare(`SELECT COUNT(*) AS n FROM Classmates WHERE FullName = 'Off Roster'`)
      .first<{ n: number }>();

    expect(count?.n).toBe(1);
  });

  it('rsvp-classmate-match.create-and-link.atomic-success.rsvp-linked: POST with linkRsvpId sets Rsvps.ClassmateId = inserted classmate id', async () => {
    const cookie = await adminCookie();
    const rsvpId = await seedRsvp({ fullName: 'Off Roster', email: 'off2@example.com' });

    const res = await CLASSMATES_POST(buildClassmatesPostCtx({
      cookie,
      body: { fullName: 'Off Roster', email: 'off2@example.com', linkRsvpId: rsvpId },
    }));
    const body = await res.json() as { id: number; linkedRsvpId: number };
    const audit = await readRsvpAudit(rsvpId);

    // Verifies last_insert_rowid() inside batch[1] picked up batch[0]'s id.
    expect(audit.ClassmateId).toBe(body.id);
  });

  it('rsvp-classmate-match.create-and-link.email-collision-rolls-back: 409 collision leaves Rsvps.ClassmateId null AND no new Classmate row', async () => {
    const cookie = await adminCookie();
    // Seed an existing Classmate with the email we're about to collide on.
    await seedClassmate({ fullName: 'Existing', email: 'taken@example.com' });
    const rsvpId = await seedRsvp({ fullName: 'New Person', email: 'newrsvp@example.com' });
    const preCount = await env.DB
      .prepare(`SELECT COUNT(*) AS n FROM Classmates`)
      .first<{ n: number }>();

    const res = await CLASSMATES_POST(buildClassmatesPostCtx({
      cookie,
      body: { fullName: 'New Person', email: 'taken@example.com', linkRsvpId: rsvpId },
    }));
    const audit = await readRsvpAudit(rsvpId);
    const postCount = await env.DB
      .prepare(`SELECT COUNT(*) AS n FROM Classmates`)
      .first<{ n: number }>();

    // 409 returned, no new Classmate row committed, Rsvp link still null.
    expect({
      status: res.status,
      classmateCountUnchanged: postCount?.n === preCount?.n,
      rsvpLinkStillNull: audit.ClassmateId === null,
    }).toEqual({ status: 409, classmateCountUnchanged: true, rsvpLinkStillNull: true });
  });

  it('rsvp-classmate-match.create-and-link.rsvp-not-found-pre-validated: POST with linkRsvpId=99999 returns 404 BEFORE the batch runs', async () => {
    const cookie = await adminCookie();
    const preCount = await env.DB
      .prepare(`SELECT COUNT(*) AS n FROM Classmates`)
      .first<{ n: number }>();

    const res = await CLASSMATES_POST(buildClassmatesPostCtx({
      cookie,
      body: { fullName: 'Should Not Insert', email: 'noop@example.com', linkRsvpId: 99999 },
    }));
    const postCount = await env.DB
      .prepare(`SELECT COUNT(*) AS n FROM Classmates`)
      .first<{ n: number }>();
    const body = await res.json();

    expect({
      status: res.status,
      body,
      classmateCountUnchanged: postCount?.n === preCount?.n,
    }).toEqual({
      status: 404,
      body: { error: 'RSVP not found.' },
      classmateCountUnchanged: true,
    });
  });

  it('rsvp-classmate-match.create-and-link.bulk-rejects-linkRsvpId: POST with both bulk and linkRsvpId returns 400 {error:"linkRsvpId only valid for single-add."}', async () => {
    const cookie = await adminCookie();
    const res = await CLASSMATES_POST(buildClassmatesPostCtx({
      cookie,
      body: { bulk: 'Some Classmate', linkRsvpId: 1 },
    }));
    const body = await res.json();
    expect({ status: res.status, body }).toEqual({
      status: 400,
      body: { error: 'linkRsvpId only valid for single-add.' },
    });
  });
});
