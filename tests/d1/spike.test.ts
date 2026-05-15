import { describe, expect, it } from 'vitest';
import { migratedD1 } from './migrated';

// Task 5 spike: prove the @cloudflare/vitest-pool-workers infra works
// end-to-end. Once this passes, Tasks 6 (resolveFirstNames), 11
// (/api/rsvp DB-missing path), and 12 (migration idempotency) can build
// on the same fixture.
describe('D1 spike — vitest-pool-workers + migrations', () => {
  it('writes and reads from Settings (proving migrations applied)', async () => {
    const db = migratedD1();
    await db
      .prepare(`INSERT INTO Settings (Key, Value) VALUES (?1, ?2)`)
      .bind('event_date', '2026-11-07')
      .run();
    const row = await db
      .prepare(`SELECT Value FROM Settings WHERE Key = ?1`)
      .bind('event_date')
      .first<{ Value: string }>();
    expect(row?.Value).toBe('2026-11-07');
  });
});
