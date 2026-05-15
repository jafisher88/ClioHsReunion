import { describe, expect, it } from 'vitest';
import { parseAmount } from '../src/lib/ledger-amount';

describe('parseAmount — string inputs', () => {
  it('parses whole dollars', () => {
    expect(parseAmount('12')).toBe(1200);
  });

  it.each([
    ['12.50', 1250],
    ['12.05', 1205],
  ])('parses cents %s → %i', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it('parses single-digit cents (e.g. .5 → 50¢)', () => {
    expect(parseAmount('12.5')).toBe(1250);
  });

  it.each([
    ['$1,234.56', 123456],
    ['  $42  ', 4200],
  ])('strips dollar sign and commas %j → %i', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });
});

describe('parseAmount — number inputs', () => {
  it.each([
    [12.5, 1250],
    [0.05, 5],
  ])('parses finite positive number %j → %i', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each([
    [0],
    ['0'],
    ['0.00'],
  ])('rejects zero (%j)', (input) => {
    expect(parseAmount(input)).toBe(null);
  });

  it.each([
    [-1],
    ['-5.00'],
  ])('rejects negative %j', (input) => {
    expect(parseAmount(input)).toBe(null);
  });

  it.each([
    [Number.NaN],
    [Number.POSITIVE_INFINITY],
    [Number.NEGATIVE_INFINITY],
  ])('rejects non-finite number %j', (input) => {
    expect(parseAmount(input)).toBe(null);
  });
});

describe('parseAmount — bad inputs', () => {
  it('rejects more than two decimal places', () => {
    expect(parseAmount('12.555')).toBe(null);
  });

  it.each([
    ['twelve'],
    ['12abc'],
    [''],
  ])('rejects non-numeric string %j', (input) => {
    expect(parseAmount(input)).toBe(null);
  });

  it.each([
    [null],
    [undefined],
    [true],
    [{}],
  ])('rejects non-numeric value %j', (input) => {
    expect(parseAmount(input as unknown)).toBe(null);
  });
});
