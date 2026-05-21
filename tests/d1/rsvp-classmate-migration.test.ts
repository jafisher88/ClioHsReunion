import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearAllRsvpMatchState,
  seedRsvp,
} from '../fixtures/rsvp-classmate-test-helpers';

// Schema-shape verification for migration 0023_rsvp_classmate_link.sql.
// Covers acceptance criteria 1 and 2 from plans/active/rsvp-classmate-matching/plan.md.
// The migration is auto-applied to the test D1 by tests/d1/apply-migrations.ts
// (via readD1Migrations in vitest.config.ts), so each test below assumes
// the columns and FK constraint are already present.

describe('migration 0023_rsvp_classmate_link', () => {
  beforeEach(clearAllRsvpMatchState);
  afterEach(clearAllRsvpMatchState);

  it('rsvp-classmate-migration.no-row-disturbance: pre-existing Rsvps rows have ClassmateId/MatchedBy/MatchedAt all null', async () => {
    // Seeding via the helper, which uses no audit-column binds — so a
    // fresh row exercises the DEFAULT NULL on all three new columns.
    const rsvpId = await seedRsvp({ fullName: 'Untouched Row', email: 'untouched@example.com' });
    const row = await env.DB
      .prepare(`SELECT ClassmateId, MatchedBy, MatchedAt FROM Rsvps WHERE Id = ?1`)
      .bind(rsvpId)
      .first<{ ClassmateId: number | null; MatchedBy: string | null; MatchedAt: string | null }>();

    expect(row).toEqual({ ClassmateId: null, MatchedBy: null, MatchedAt: null });
  });

  it('rsvp-classmate-migration.column-shape: all three new columns are notnull=0 with dflt_value null', async () => {
    const cols = await env.DB
      .prepare(`SELECT name, "notnull", dflt_value FROM pragma_table_info('Rsvps')
                 WHERE name IN ('ClassmateId', 'MatchedBy', 'MatchedAt')`)
      .all<{ name: string; notnull: number; dflt_value: string | null }>();
    const byName = Object.fromEntries(
      (cols.results ?? []).map((r: { name: string; notnull: number; dflt_value: string | null }) => [r.name, r]),
    );

    // SQLite's pragma_table_info reports dflt_value as the literal SQL
    // text of the default expression. For `DEFAULT NULL`, that's the
    // four-char string "NULL" — NOT the JS value null. That literal
    // string is exactly what we want: it proves the migration used the
    // explicit DEFAULT NULL form (required when ALTER-adding an FK
    // column under PRAGMA foreign_keys=ON, per SQLite docs).
    expect(byName).toMatchObject({
      ClassmateId: { notnull: 0, dflt_value: 'NULL' },
      MatchedBy:   { notnull: 0, dflt_value: 'NULL' },
      MatchedAt:   { notnull: 0, dflt_value: 'NULL' },
    });
  });

  it('rsvp-classmate-migration.fk-enforced: PRAGMA foreign_keys is ON and foreign_key_list shows ClassmateId → Classmates.Id ON DELETE SET NULL', async () => {
    const fkPragma = await env.DB
      .prepare(`PRAGMA foreign_keys`)
      .first<{ foreign_keys: number }>();
    const fkList = await env.DB
      .prepare(`SELECT "table", "from", "to", "on_delete" FROM pragma_foreign_key_list('Rsvps')`)
      .all<{ table: string; from: string; to: string; on_delete: string }>();
    const classmateFk = (fkList.results ?? []).find(
      (r: { table: string; from: string; to: string; on_delete: string }) => r.from === 'ClassmateId',
    );

    expect({ foreignKeysOn: fkPragma?.foreign_keys === 1, classmateFk }).toEqual({
      foreignKeysOn: true,
      classmateFk: { table: 'Classmates', from: 'ClassmateId', to: 'Id', on_delete: 'SET NULL' },
    });
  });

  it('rsvp-classmate-migration.fk-violation-throws: inserting Rsvps with nonexistent ClassmateId rejects with FOREIGN KEY error', async () => {
    // 99999 is well above any seeded Classmates.Id (we just truncated).
    // Without the FK, this insert would silently succeed.
    let caught: unknown;
    try {
      await env.DB
        .prepare(
          `INSERT INTO Rsvps (FullName, Email, Attending, GuestCount, ClassmateId)
           VALUES ('FK Probe', 'fk@example.com', 'no', 0, 99999)`,
        )
        .run();
    } catch (err) {
      caught = err;
    }

    expect(String((caught as Error)?.message ?? '')).toMatch(/FOREIGN KEY/i);
  });

  it('rsvp-classmate-migration.index-used: EXPLAIN QUERY PLAN for SELECT WHERE ClassmateId IS NULL mentions idx_rsvps_classmate', async () => {
    // Verifies the index isn't ornamental SQL — the unmatched-RSVPs
    // query in /admin/classmates.astro will use it. SQLite's EXPLAIN
    // QUERY PLAN output shape: { detail: "SEARCH ... USING INDEX ..." }
    // or similar. We just grep for the index name in any column.
    const rows = await env.DB
      .prepare(`EXPLAIN QUERY PLAN SELECT Id FROM Rsvps WHERE ClassmateId IS NULL`)
      .all<Record<string, unknown>>();
    const flattened = JSON.stringify(rows.results ?? []);

    expect(flattened).toContain('idx_rsvps_classmate');
  });
});
