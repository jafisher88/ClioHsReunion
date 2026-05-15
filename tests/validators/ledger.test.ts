import { describe, expect, it } from 'vitest';
import { validate } from '../../src/lib/validators/ledger';

const baseValid = {
  entryDate: '2026-11-07',
  direction: 'in' as const,
  amount: '50.00',
  category: 'venmo',
};

describe('validators/ledger', () => {
  it('ledger.entryDate.format: accepts YYYY-MM-DD', () => {
    expect(validate(baseValid)).toMatchObject({ ok: true, value: { entryDate: '2026-11-07' } });
  });

  it.each([
    ['11/07/2026'],
    ['2026-11-7'],
    ['2026/11/07'],
    [''],
    ['not-a-date'],
  ])('ledger.entryDate.format: rejects %j', (input) => {
    expect(validate({ ...baseValid, entryDate: input })).toMatchObject({
      ok: false,
      error: 'Please provide a valid date (YYYY-MM-DD).',
    });
  });

  it.each([
    ['in'],
    ['out'],
  ])('ledger.direction.enum: accepts %s', (dir) => {
    expect(validate({ ...baseValid, direction: dir })).toMatchObject({
      ok: true,
      value: { direction: dir },
    });
  });

  it.each([
    ['inbound'],
    [''],
    ['IN'], // case-sensitive enum
    [null],
  ])('ledger.direction.enum: rejects %j', (dir) => {
    expect(validate({ ...baseValid, direction: dir })).toMatchObject({
      ok: false,
      error: "Direction must be 'in' or 'out'.",
    });
  });

  it('ledger.amount.range: accepts a valid positive amount', () => {
    expect(validate({ ...baseValid, amount: '12.50' })).toMatchObject({
      ok: true,
      value: { amountCents: 1250 },
    });
  });

  it('ledger.amount.range: rejects zero', () => {
    expect(validate({ ...baseValid, amount: '0' })).toMatchObject({
      ok: false,
      error: 'Please enter a valid positive amount.',
    });
  });

  it('ledger.amount.range: rejects negative', () => {
    expect(validate({ ...baseValid, amount: '-5' })).toMatchObject({ ok: false });
  });

  it('ledger.amount.range: rejects amount over $1,000,000 cap', () => {
    // $1,000,000.01 in dollars = 100_000_001 cents, just over the cap.
    expect(validate({ ...baseValid, amount: '1000000.01' })).toMatchObject({
      ok: false,
      error: 'Amount looks too large — double-check.',
    });
  });

  it('ledger.amount.range: accepts amount at the $1,000,000 boundary', () => {
    expect(validate({ ...baseValid, amount: '1000000' })).toMatchObject({
      ok: true,
      value: { amountCents: 100_000_000 },
    });
  });

  it('ledger.category.required: rejects when category is empty', () => {
    expect(validate({ ...baseValid, category: '' })).toMatchObject({
      ok: false,
      error: 'Please select or enter a category.',
    });
  });

  it('ledger.category.required: rejects when category is whitespace-only', () => {
    expect(validate({ ...baseValid, category: '   ' })).toMatchObject({
      ok: false,
      error: 'Please select or enter a category.',
    });
  });

  it('ledger.category.required: accepts a non-empty category', () => {
    expect(validate(baseValid)).toMatchObject({
      ok: true,
      value: { category: 'venmo' },
    });
  });
});
