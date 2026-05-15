/**
 * Shared D1 fixtures for vitest (node pool).
 *
 * `emptyDb` / `throwingDb` / `dbReturning(...)` are hand-rolled fakes that
 * never run SQL — use them for fallback-path tests where the function
 * under test is supposed to handle a missing/throwing/null-returning D1
 * gracefully. They cover the contract surface (`prepare(sql).bind(...).first()`)
 * that the codebase actually uses; if a test reaches for `.all()`/`.run()`
 * or `.batch(...)`, switch it to `migratedD1()` from `tests/d1/migrated.ts`.
 *
 * For real miniflare-backed D1 with migrations applied, put the test
 * under `tests/d1/` and import from `tests/d1/migrated.ts` — that file
 * imports `cloudflare:test` which is only resolvable in the workers pool.
 */

interface FakeStatement {
  bind: (...args: unknown[]) => FakeStatement;
  first: <T = unknown>() => Promise<T | null>;
}

interface FakeD1 {
  prepare: (sql: string) => FakeStatement;
}

const noopBind = <T>(value: T | null): FakeStatement => ({
  bind: () => noopBind(value),
  first: async <U = unknown>() => value as unknown as U,
});

/** Returns null from every `.first()` call. Use for the "Settings row absent" case. */
export const emptyDb: D1Database = {
  prepare: () => noopBind(null),
} as unknown as D1Database;

/** Throws on `.prepare()`. Use for the "D1 connection blew up" case. */
export const throwingDb: D1Database = {
  prepare: () => {
    throw new Error('synthetic D1 prepare failure');
  },
} as unknown as D1Database;

/** Returns the given value from `.first()`. Use for "Settings has X" cases. */
export function dbReturning<T>(value: T | null): D1Database {
  const fake: FakeD1 = { prepare: () => noopBind(value) };
  return fake as unknown as D1Database;
}
