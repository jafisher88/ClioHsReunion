/**
 * Resolve the locked-in event date from the Settings table, with a
 * fallback when no date has been chosen yet. The single source of truth
 * lives in Settings.event_date (admins set it at /admin/settings); the
 * public pages format it for display, the reminders job uses it for
 * "30 / 7 / 0 days until" scheduling.
 */

const SETTING_KEY = 'event_date';
const FALLBACK_DISPLAY = 'November 2026';

export interface EventDateInfo {
  /** Raw "YYYY-MM-DD" from D1, or null if no date has been chosen. */
  iso: string | null;
  /** "Saturday, November 14, 2026" when set; the FALLBACK_DISPLAY when not. */
  longDisplay: string;
  /** "November 14, 2026" when set; the FALLBACK_DISPLAY when not. */
  shortDisplay: string;
  /** True when admins have committed to a specific calendar date. */
  isLocked: boolean;
}

function formatLong(iso: string): string {
  // Pin to noon Detroit time so the rendered date never drifts a day.
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Detroit',
  });
}

function formatShort(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Detroit',
  });
}

/**
 * Fetch and format the event date for public pages.
 *
 * Wraps the D1 read in a try/catch so a transient DB hiccup or a missing
 * binding (the photo-of-the-month dev scenario) degrades to "November 2026"
 * rather than 500ing the home page.
 */
export async function getEventDateInfo(db: D1Database | undefined): Promise<EventDateInfo> {
  if (!db) return { iso: null, longDisplay: FALLBACK_DISPLAY, shortDisplay: FALLBACK_DISPLAY, isLocked: false };
  try {
    const row = await db
      .prepare(`SELECT Value FROM Settings WHERE Key = ?1`)
      .bind(SETTING_KEY)
      .first<{ Value: string }>();
    const iso = row?.Value?.trim() || null;
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      return { iso: null, longDisplay: FALLBACK_DISPLAY, shortDisplay: FALLBACK_DISPLAY, isLocked: false };
    }
    return {
      iso,
      longDisplay: formatLong(iso),
      shortDisplay: formatShort(iso),
      isLocked: true,
    };
  } catch (err) {
    console.error('[event-date] read failed', err);
    return { iso: null, longDisplay: FALLBACK_DISPLAY, shortDisplay: FALLBACK_DISPLAY, isLocked: false };
  }
}
