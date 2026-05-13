/**
 * D1 stores timestamps as "YYYY-MM-DD HH:MM:SS" in UTC (CURRENT_TIMESTAMP).
 * Convert that to an ISO-8601 string with a Z suffix so a browser
 * `<time datetime="…">` element can be re-rendered in the user's local
 * 12-hour time by the inline script in AdminLayout.
 */
export function dbToIso(raw: string | null | undefined): string {
  if (!raw) return '';
  const t = raw.trim();
  if (!t) return '';
  if (/^\d{4}-\d{2}-\d{2}T/.test(t)) return t.endsWith('Z') ? t : t + 'Z';
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(t)) return t.replace(' ', 'T') + 'Z';
  return t;
}
