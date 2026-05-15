import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

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
              bindings: { TEST_MIGRATIONS: migrations },
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
