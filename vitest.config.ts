import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import {
  TEST_RESEND_API_KEY,
  TEST_RESEND_WEBHOOK_SECRET,
  TEST_SESSION_SECRET,
} from './tests/fixtures/test-secrets';

// Read every `migrations/*.sql` once at config-load time. The workers project
// gets these handed to it as a `TEST_MIGRATIONS` binding so its setup file
// can `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)`.
const migrationsPath = path.join(import.meta.dirname, 'migrations');
const migrations = await readD1Migrations(migrationsPath);

export default defineConfig({
  test: {
    // Two projects so pure-function tests run in Node (cheap, no workerd
    // boot) and D1-touching tests run in the miniflare-backed Workers pool.
    projects: [
      {
        test: {
          name: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/d1/**'],
          environment: 'node',
        },
      },
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: './wrangler.toml' },
            miniflare: {
              // Per-binding override: miniflare creates an isolated in-memory
              // SQLite for `DB` regardless of the production database_id in
              // wrangler.toml. The TEST_MIGRATIONS binding is what
              // `tests/d1/apply-migrations.ts` reads to seed schema.
              // SESSION_SECRET lets tests construct valid signed session
              // tokens for `getAdmin` coverage (F1) — it's intentionally a
              // long static string, NOT a leaked production secret.
              bindings: {
                TEST_MIGRATIONS: migrations,
                // SESSION_SECRET + RESEND_WEBHOOK_SECRET imported from
                // tests/fixtures/test-secrets.ts — that file labels the
                // values as PUBLIC_TEST_VALUE_NOT_A_SECRET_* so a future
                // grep can't confuse them with production credentials.
                SESSION_SECRET: TEST_SESSION_SECRET,
                RESEND_WEBHOOK_SECRET: TEST_RESEND_WEBHOOK_SECRET,
                // RESEND_API_KEY is forwarded to api.resend.com as a Bearer
                // token in production. Tests stub globalThis.fetch via
                // tests/fixtures/resend-mock.ts so no real request leaves
                // the process; the binding just needs to be truthy.
                RESEND_API_KEY: TEST_RESEND_API_KEY,
              },
            },
          }),
        ],
        test: {
          name: 'workers',
          include: ['tests/d1/**/*.test.ts'],
          setupFiles: ['./tests/d1/apply-migrations.ts'],
        },
      },
    ],
  },
});
