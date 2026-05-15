import { describe, expect, it } from 'vitest';
import { parseAmount } from '../src/lib/ledger-amount';

describe('parseAmount — string inputs', () => {
  it('parses whole dollars', () => {
    expect(parseAmount('12')).toBe(1200);
  });

  it('parses cents', () => {
    expect(parseAmount('12.50')).toBe(1250);
    expect(parseAmount('12.05')).toBe(1205);
  });

  it('parses single-digit cents (e.g. .5 → 50¢)', () => {
    expect(parseAmount('12.5')).toBe(1250);
  });

  it('strips dollar sign and commas', () => {
    expect(parseAmount('$1,234.56')).toBe(123456);
    expect(parseAmount('  $42  ')).toBe(4200);
  });
});

describe('parseAmount — number inputs', () => {
  it('parses a finite positive number', () => {
    expect(parseAmount(12.5)).toBe(1250);
    expect(parseAmount(0.05)).toBe(5);
  });

  it('rejects zero', () => {
    expect(parseAmount(0)).toBe(null);
    expect(parseAmount('0')).toBe(null);
    expect(parseAmount('0.00')).toBe(null);
  });

  it('rejects negative numbers', () => {
    expect(parseAmount(-1)).toBe(null);
    expect(parseAmount('-5.00')).toBe(null);
  });

  it('rejects NaN and Infinity', () => {
    expect(parseAmount(NaN)).toBe(null);
    expect(parseAmount(Infinity)).toBe(null);
    expect(parseAmount(-Infinity)).toBe(null);
  });
});

describe('parseAmount — bad inputs', () => {
  it('rejects more than two decimal places', () => {
    expect(parseAmount('12.555')).toBe(null);
  });

  it('rejects non-numeric strings', () => {
    expect(parseAmount('twelve')).toBe(null);
    expect(parseAmount('12abc')).toBe(null);
    expect(parseAmount('')).toBe(null);
  });

  it('rejects null / undefined / boolean / object', () => {
    expect(parseAmount(null)).toBe(null);
    expect(parseAmount(undefined)).toBe(null);
    expect(parseAmount(true as unknown)).toBe(null);
    expect(parseAmount({} as unknown)).toBe(null);
  });
});
