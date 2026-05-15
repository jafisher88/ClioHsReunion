/**
 * Admin ledger entry payload validation. Extracted from the route for
 * unit testability; the route at `src/pages/api/admin/ledger.ts`
 * re-imports `validate` from here.
 */
import { parseAmount } from '../ledger-amount';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 500;
const MAX_AMOUNT_CENTS = 100_000_000; // $1,000,000

export interface LedgerInput {
  entryDate: string;
  direction: 'in' | 'out';
  amountCents: number;
  category: string;
  counterparty: string | null;
  description: string | null;
  method: string | null;
  notes: string | null;
}

export type LedgerValidationResult =
  | { ok: true; value: LedgerInput }
  | { ok: false; error: string };

function clamp(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length === 0 ? null : trimmed;
}

export function validate(body: unknown): LedgerValidationResult {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request body.' };
  const b = body as Record<string, unknown>;

  const entryDate = typeof b.entryDate === 'string' ? b.entryDate.trim() : '';
  if (!DATE_RE.test(entryDate)) return { ok: false, error: 'Please provide a valid date (YYYY-MM-DD).' };

  const direction = b.direction;
  if (direction !== 'in' && direction !== 'out') return { ok: false, error: "Direction must be 'in' or 'out'." };

  const amountCents = parseAmount(b.amount ?? b.amountCents);
  if (amountCents === null) return { ok: false, error: 'Please enter a valid positive amount.' };
  if (amountCents > MAX_AMOUNT_CENTS) return { ok: false, error: 'Amount looks too large — double-check.' };

  const category = clamp(b.category, 80);
  if (!category) return { ok: false, error: 'Please select or enter a category.' };

  return {
    ok: true,
    value: {
      entryDate,
      direction,
      amountCents,
      category,
      counterparty: clamp(b.counterparty, MAX_TEXT),
      description: clamp(b.description, MAX_TEXT),
      method: clamp(b.method, 40),
      notes: clamp(b.notes, 2000),
    },
  };
}
