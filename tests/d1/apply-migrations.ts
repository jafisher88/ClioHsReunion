import { applyD1Migrations, env } from 'cloudflare:test';

// applyD1Migrations() is idempotent (only applies unapplied migrations),
// so running it from every test's setup is safe. Each test starts with a
// fully-migrated, empty D1 instance.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
