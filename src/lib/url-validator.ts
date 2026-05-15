/**
 * Defense-in-depth URL validator for admin-supplied form fields that land
 * in HTML attributes (e.g. `<a href={obituaryUrl}>`, `<img src={photoUrl}>`
 * on /memoriam). Only `http:` and `https:` URLs are accepted; everything
 * else (including `javascript:`, `data:`, `file:`, `vbscript:`, protocol-
 * relative `//`) returns the `'invalid'` sentinel so the caller can
 * surface a 400.
 *
 * Return contract:
 *   - `null`      — the input was empty/null/undefined or whitespace-only
 *                   (treat as "no URL provided")
 *   - `'invalid'` — input was non-empty but failed the scheme or shape check
 *   - `string`    — the parsed URL's `.href` (URL constructor normalizes)
 *
 * The MAX_URL cap is applied before parsing so a 100 MB string can't
 * be fed into `new URL(...)`.
 */

export const MAX_URL = 2000;

function clampText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length === 0 ? null : trimmed;
}

export function parseHttpUrl(value: unknown): string | null | 'invalid' {
  const clamped = clampText(value, MAX_URL);
  if (!clamped) return null;
  try {
    const u = new URL(clamped);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'invalid';
    return u.href;
  } catch {
    return 'invalid';
  }
}
