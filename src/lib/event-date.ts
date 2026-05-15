/**
 * Resolve the locked-in event date from the Settings table, with a
 * fallback when no date has been chosen yet. The single source of truth
 * lives in Settings.event_date (admins set it at /admin/settings); the
 * public pages format it for display, the reminders job uses it for
 * "30 / 7 / 0 days until" scheduling.
 */

const SETTING_KEY = 'event_date';
const FALLBACK_DISPLAY = 'November 2026';
const FALLBACK_MONTH_LONG = 'November';
const FALLBACK_YEAR = 2026;

export interface EventDateInfo {
  /** Raw "YYYY-MM-DD" from D1, or null if no date has been chosen. */
  iso: string | null;
  /** "Saturday, November 14, 2026" when set; the FALLBACK_DISPLAY when not. */
  longDisplay: string;
  /** "November 14, 2026" when set; the FALLBACK_DISPLAY when not. */
  shortDisplay: string;
  /** Full month name, e.g. "November". Always populated (falls back). */
  monthLong: string;
  /** 4-digit calendar year. Always populated (falls back). */
  year: number;
  /** Year as Roman numerals, e.g. "MMXXVI". Always populated (falls back). */
  romanYear: string;
  /** True when admins have committed to a specific calendar date. */
  isLocked: boolean;
}

// Generate Roman numerals up to 3999 (more than enough for any plausible
// reunion year). Used for the masthead's stylized "Anno MMXXVI".
function toRoman(num: number): string {
  if (!Number.isInteger(num) || num <= 0 || num >= 4000) return String(num);
  const pairs: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100,  'C'], [90,  'XC'], [50,  'L'], [40,  'XL'],
    [10,   'X'], [9,   'IX'], [5,   'V'], [4,   'IV'],
    [1,    'I'],
  ];
  let out = '';
  let n = num;
  for (const [val, sym] of pairs) {
    while (n >= val) { out += sym; n -= val; }
  }
  return out;
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

function formatMonth(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'long', timeZone: 'America/Detroit' });
}

/**
 * Fetch and format the event date for public pages.
 *
 * Wraps the D1 read in a try/catch so a transient DB hiccup or a missing
 * binding (the photo-of-the-month dev scenario) degrades to "November 2026"
 * rather than 500ing the home page.
 */
function fallback(): EventDateInfo {
  return {
    iso: null,
    longDisplay: FALLBACK_DISPLAY,
    shortDisplay: FALLBACK_DISPLAY,
    monthLong: FALLBACK_MONTH_LONG,
    year: FALLBACK_YEAR,
    romanYear: toRoman(FALLBACK_YEAR),
    isLocked: false,
  };
}

export async function getEventDateInfo(db: D1Database | undefined): Promise<EventDateInfo> {
  if (!db) return fallback();
  try {
    const row = await db
      .prepare(`SELECT Value FROM Settings WHERE Key = ?1`)
      .bind(SETTING_KEY)
      .first<{ Value: string }>();
    const iso = row?.Value?.trim() || null;
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return fallback();
    const year = Number.parseInt(iso.slice(0, 4), 10);
    return {
      iso,
      longDisplay: formatLong(iso),
      shortDisplay: formatShort(iso),
      monthLong: formatMonth(iso),
      year,
      romanYear: toRoman(year),
      isLocked: true,
    };
  } catch (err) {
    console.error('[event-date] read failed', err);
    return fallback();
  }
}
