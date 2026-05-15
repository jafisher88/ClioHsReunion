import { applyD1Migrations, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

// A12: migrations must be idempotent so a future migration that introduces
// a non-idempotent statement is caught here rather than crashing a real
// `wrangler d1 migrations apply` against production.
//
// Two angles:
//   1. The applyD1Migrations() helper (what wrangler uses underneath) must
//      be a no-op when called a second time on a fully-migrated DB.
//   2. Migration 0020 specifically (DROP INDEX IF EXISTS + CREATE UNIQUE
//      INDEX + dedupe UPDATE) must survive a forced re-application — we
//      drop its tracking row and re-invoke the helper to exercise the
//      real production code path, not a hand-rolled query splitter.

describe('migrations are idempotent (A12)', () => {
  it('applyD1Migrations helper is safe to re-run on a fully-migrated DB', async () => {
    // Setup file already applied migrations once. Run again — must not throw,
    // and the Classmates table must still be there afterward.
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
    const row = await env.DB
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='Classmates'`)
      .first<{ name: string }>();
    expect(row?.name).toBe('Classmates');
  });

  it('migration 0020 re-applies cleanly when forced (DROP INDEX IF EXISTS guard works)', async () => {
    // Force a real re-execution of 0020 by deleting its tracking row, then
    // running the helper again. If anyone removes the IF EXISTS guard on
    // the DROP INDEX or the IF NOT EXISTS guard on the dedupe UPDATE, this
    // pass will throw.
    await env.DB.prepare(`DELETE FROM d1_migrations WHERE name LIKE '0020%'`).run();
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
    // Sanity: the unique index that 0020 creates is still in place after
    // the re-apply (catches the case where the 2nd CREATE silently failed
    // and the DROP left us with no index).
    const idx = await env.DB
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='index' AND name='idx_classmates_email_unique'`,
      )
      .first<{ name: string }>();
    expect(idx?.name).toBe('idx_classmates_email_unique');
  });
});
