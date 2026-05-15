import { describe, expect, it } from 'vitest';
import { getEventDateInfo, toRoman } from '../src/lib/event-date';
import { dbReturning, emptyDb, throwingDb } from './fixtures/d1';

describe('toRoman', () => {
  // Subtractive pairs (IV, IX, XL, XC, CD, CM) are the part that breaks if
  // someone regresses to a 7-symbol table. 1994 = MCMXCIV exercises three of
  // them in one input. 2026 is the actual reunion year. 3999 is the upper
  // bound the implementation supports.
  it.each([
    [1, 'I'],
    [4, 'IV'],
    [9, 'IX'],
    [40, 'XL'],
    [90, 'XC'],
    [400, 'CD'],
    [900, 'CM'],
    [1994, 'MCMXCIV'],
    [2026, 'MMXXVI'],
    [3999, 'MMMCMXCIX'],
  ])('converts %i to %s', (input, expected) => {
    expect(toRoman(input)).toBe(expected);
  });

  // Invalid-input contract: anything outside [1, 3999] or non-integer falls
  // through to `String(num)`. Pin it so a future refactor that throws
  // instead of falling back surfaces here.
  it.each([
    [0, '0'],
    [-1, '-1'],
    [Number.NaN, 'NaN'],
  ])('returns String(%s) for invalid input', (input, expected) => {
    expect(toRoman(input)).toBe(expected);
  });
});

describe('getEventDateInfo', () => {
  it('locked: returns formatted info when Settings has a valid YYYY-MM-DD', async () => {
    const info = await getEventDateInfo(dbReturning({ Value: '2026-11-07' }));
    expect(info).toMatchObject({
      isLocked: true,
      iso: '2026-11-07',
      year: 2026,
      romanYear: 'MMXXVI',
      monthLong: 'November',
      longDisplay: expect.stringMatching(/Saturday.*November 7, 2026/),
      shortDisplay: expect.stringMatching(/November 7, 2026/),
    });
  });

  it('unset: returns fallback when Settings row is absent', async () => {
    const info = await getEventDateInfo(emptyDb);
    expect(info).toMatchObject({
      isLocked: false,
      iso: null,
      year: 2026,
      romanYear: 'MMXXVI',
      monthLong: 'November',
      longDisplay: 'November 2026',
      shortDisplay: 'November 2026',
    });
  });

  it('malformed: returns fallback when Settings has a non-date value', async () => {
    const info = await getEventDateInfo(dbReturning({ Value: 'soon' }));
    expect(info).toMatchObject({
      isLocked: false,
      iso: null,
      longDisplay: 'November 2026',
    });
  });

  it('throws: returns fallback when D1 throws on prepare()', async () => {
    const info = await getEventDateInfo(throwingDb);
    expect(info).toMatchObject({
      isLocked: false,
      longDisplay: 'November 2026',
    });
  });

  it('no-binding: returns fallback when db is undefined', async () => {
    const info = await getEventDateInfo(undefined);
    expect(info).toMatchObject({
      isLocked: false,
      longDisplay: 'November 2026',
    });
  });
});
