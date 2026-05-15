/**
 * Parse a user-typed amount into integer cents.
 *
 * Accepts either a JavaScript number or a string with optional `$`, commas,
 * and surrounding whitespace. Rejects negative, zero, NaN, infinite, or
 * anything with more than two fractional digits. Returns null on any
 * rejection so the caller can surface a single "please enter a valid
 * positive amount" message.
 */
export function parseAmount(raw: unknown): number | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return Math.round(raw * 100);
  }
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[\s$,]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = parseFloat(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  // Avoid floating round-trips for the final cent value.
  const [whole, fraction = ''] = cleaned.split('.');
  const paddedFraction = (fraction + '00').slice(0, 2);
  return parseInt(whole, 10) * 100 + parseInt(paddedFraction, 10);
}
