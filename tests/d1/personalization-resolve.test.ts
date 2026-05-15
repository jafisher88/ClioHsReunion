import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveFirstNames } from '../../src/lib/personalization';
import { migratedD1 } from './migrated';

// Workers-pool test for the 5-tier resolution chain in `resolveFirstNames`.
// One row per tier from the table pinned in plans/active/test-quality/tasks.md § 6.
// Each test seeds only the rows it needs (cleanup in afterEach) so the
// tier under test is exercised in isolation.

interface ClassmateSeed {
  fullName: string;
  maidenName?: string | null;
  preferredFirstName?: string | null;
  email?: string | null;
}

async function seedClassmate(db: D1Database, row: ClassmateSeed): Promise<void> {
  await db
    .prepare(
      `INSERT INTO Classmates (FullName, MaidenName, PreferredFirstName, Email, CreatedBy)
       VALUES (?1, ?2, ?3, ?4, 'test')`,
    )
    .bind(row.fullName, row.maidenName ?? null, row.preferredFirstName ?? null, row.email ?? null)
    .run();
}

async function seedRsvp(
  db: D1Database,
  row: { fullName: string; preferredFirstName?: string | null; email: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO Rsvps (FullName, PreferredFirstName, Email, Attending, GuestCount)
       VALUES (?1, ?2, ?3, 'yes', 1)`,
    )
    .bind(row.fullName, row.preferredFirstName ?? null, row.email)
    .run();
}

async function seedVolunteer(
  db: D1Database,
  row: { fullName: string; email: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO Volunteers (FullName, Email, RoleSetup, RoleCleanup)
       VALUES (?1, ?2, 1, 0)`,
    )
    .bind(row.fullName, row.email)
    .run();
}

describe('resolveFirstNames — 5-tier resolution', () => {
  let db: D1Database;
  beforeEach(() => {
    db = migratedD1();
  });
  afterEach(async () => {
    await db.prepare(`DELETE FROM Rsvps`).run();
    await db.prepare(`DELETE FROM Volunteers`).run();
    await db.prepare(`DELETE FROM Classmates`).run();
  });

  it('tier 1: RSVP-supplied preferred first name wins', async () => {
    await seedClassmate(db, {
      fullName: 'Rebecca Frey',
      maidenName: 'Kirby',
      preferredFirstName: 'Becky',
      email: 'rebecca@example.com',
    });
    await seedRsvp(db, {
      fullName: 'Becky Frey',
      preferredFirstName: 'Becky',
      email: 'rebecca@example.com',
    });
    const result = await resolveFirstNames(db, ['rebecca@example.com']);
    expect(result.byEmail.get('rebecca@example.com')).toBe('Becky');
  });

  it('tier 2: Classmate preferred name matched via JOIN clause 2', async () => {
    await seedClassmate(db, {
      fullName: 'Maria Garcia',
      preferredFirstName: 'Mari',
      email: 'maria@example.com',
    });
    // RSVP uses the preferred-first-name + classmate-surname form ('Mari Garcia')
    // which exactly fires the second JOIN clause in personalization.ts.
    await seedRsvp(db, { fullName: 'Mari Garcia', email: 'maria@example.com' });
    const result = await resolveFirstNames(db, ['maria@example.com']);
    expect(result.byEmail.get('maria@example.com')).toBe('Mari');
  });

  it('tier 3: yearbook first word when no preferred name is set', async () => {
    await seedClassmate(db, { fullName: 'John Smith', email: 'john@example.com' });
    await seedRsvp(db, { fullName: 'John Smith', email: 'john@example.com' });
    const result = await resolveFirstNames(db, ['john@example.com']);
    expect(result.byEmail.get('john@example.com')).toBe('John');
  });

  it('tier 4: submitted first word when no matching Classmate row', async () => {
    // Volunteer signed up without a Classmate roster entry — no JOIN match,
    // so we fall through to the first word of the submitted name.
    await seedVolunteer(db, { fullName: 'Anna Stranger', email: 'anna@example.com' });
    const result = await resolveFirstNames(db, ['anna@example.com']);
    expect(result.byEmail.get('anna@example.com')).toBe('Anna');
  });

  it('tier 5: emails with no submission row produce no map entry', async () => {
    // The function builds its map only from emails it could resolve; missing
    // emails fall back to `result.fallback` ('Mustang') in the caller.
    const result = await resolveFirstNames(db, ['nobody@example.com']);
    expect(result).toMatchObject({
      byEmail: expect.any(Map),
      fallback: 'Mustang',
    });
  });

  it('tier 5: byEmail does NOT contain the unresolved email key', async () => {
    const result = await resolveFirstNames(db, ['nobody@example.com']);
    expect(result.byEmail.has('nobody@example.com')).toBe(false);
  });
});

describe('resolveFirstNames — edge cases', () => {
  let db: D1Database;
  beforeEach(() => {
    db = migratedD1();
  });
  afterEach(async () => {
    await db.prepare(`DELETE FROM Rsvps`).run();
    await db.prepare(`DELETE FROM Volunteers`).run();
    await db.prepare(`DELETE FROM Classmates`).run();
  });

  it('chunk boundary: resolves 95 emails across the 90-bind IN-list split', async () => {
    // Validates personalization.ts's `for (let i = 0; i < normalized.length; i += 90)`
    // chunking. If the last chunk got dropped, emails 91..95 would be missing
    // from the resulting map.
    const emails: string[] = [];
    for (let i = 1; i <= 95; i++) {
      const email = `u${i}@example.com`;
      emails.push(email);
      await seedRsvp(db, { fullName: `User${i} Surname`, email });
    }
    const result = await resolveFirstNames(db, emails);
    expect(result.byEmail.size).toBe(95);
  });

  it('case-folding: classmate email JOINs case-insensitively', async () => {
    // Classmates.Email stored mixed-case (e.g. typed by an admin from the
    // Google sheet), Rsvps.Email lowercase. Personalization's LOWER(TRIM(...))
    // JOIN should still match.
    await seedClassmate(db, {
      fullName: 'Jane Doe',
      preferredFirstName: 'Janie',
      email: 'JANE@Example.COM',
    });
    await seedRsvp(db, { fullName: 'Janie Doe', email: 'jane@example.com' });
    const result = await resolveFirstNames(db, ['jane@example.com']);
    expect(result.byEmail.get('jane@example.com')).toBe('Janie');
  });
});
