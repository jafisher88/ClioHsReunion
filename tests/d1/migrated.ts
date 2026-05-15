/**
 * Workers-pool helper: returns the migrated D1 binding for tests inside
 * `tests/d1/`. Migrations are applied by `apply-migrations.ts` (setup file
 * referenced from `vitest.config.ts`), so by the time a test calls this
 * the schema is in place.
 *
 * This file imports from `cloudflare:test`, which is only resolvable in
 * the workers pool. Tests outside `tests/d1/` must NOT import this file —
 * use the no-SQL fakes from `tests/fixtures/d1.ts` instead.
 */
import { env } from 'cloudflare:test';

export function migratedD1(): D1Database {
  return env.DB;
}
