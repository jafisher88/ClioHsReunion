import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEventDateInfo } from '../src/lib/event-date';
import { dbReturning } from './fixtures/d1';

/**
 * Regression guard: the formatter must produce the right Detroit-local
 * date regardless of the system's TZ env var. The implementation defends
 * via two mechanisms:
 *   1. Construction pinned to noon UTC (`new Date(`${iso}T12:00:00Z`)`),
 *      so day-of-month is stable across a +/-12 hour window.
 *   2. Explicit `timeZone: 'America/Detroit'` passed to `toLocaleDateString`.
 *
 * If either gets removed, one of these tests breaks. We run under both
 * TZ extremes (UTC+14 and UTC-12) so a one-way drift can't slip through.
 *
 * Lives in its own file so the env stub doesn't leak across other suites.
 */
describe('getEventDateInfo — TZ independence', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders 2026-11-07 as Saturday Nov 7 under Pacific/Kiritimati (UTC+14)', async () => {
    vi.stubEnv('TZ', 'Pacific/Kiritimati');
    const info = await getEventDateInfo(dbReturning({ Value: '2026-11-07' }));
    expect(info.longDisplay).toMatch(/Saturday.*November 7, 2026/);
  });

  it('renders 2026-11-07 as Saturday Nov 7 under Etc/GMT+12 (UTC-12)', async () => {
    vi.stubEnv('TZ', 'Etc/GMT+12');
    const info = await getEventDateInfo(dbReturning({ Value: '2026-11-07' }));
    expect(info.longDisplay).toMatch(/Saturday.*November 7, 2026/);
  });
});
