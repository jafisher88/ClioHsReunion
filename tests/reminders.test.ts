import { describe, expect, it } from 'vitest';
import { daysUntilEvent, reminderKindFor } from '../src/lib/reminders';

describe('daysUntilEvent', () => {
  it('returns null for null input', () => {
    expect(daysUntilEvent(null)).toBe(null);
  });

  it.each([
    ['not-a-date'],
    ['2026-1-1'],
    ['20260101'],
  ])('returns null for malformed date %j', (input) => {
    expect(daysUntilEvent(input)).toBe(null);
  });

  it('returns 0 on the day of the event', () => {
    const now = new Date('2026-11-14T18:00:00Z');
    expect(daysUntilEvent('2026-11-14', now)).toBe(0);
  });

  it('returns 1 the day before', () => {
    const now = new Date('2026-11-13T03:00:00Z');
    expect(daysUntilEvent('2026-11-14', now)).toBe(1);
  });

  it('returns 30 exactly 30 days out', () => {
    const now = new Date('2026-10-15T12:00:00Z');
    expect(daysUntilEvent('2026-11-14', now)).toBe(30);
  });

  it('returns a negative number for dates in the past', () => {
    const now = new Date('2026-11-15T00:00:00Z');
    expect(daysUntilEvent('2026-11-14', now)).toBe(-1);
  });
});

describe('reminderKindFor', () => {
  it('returns null for null daysUntil', () => {
    expect(reminderKindFor(null)).toBe(null);
  });

  it('maps 30 → 30day', () => {
    expect(reminderKindFor(30)).toBe('30day');
  });

  it('maps 7 → 7day', () => {
    expect(reminderKindFor(7)).toBe('7day');
  });

  it('maps 0 → dayof', () => {
    expect(reminderKindFor(0)).toBe('dayof');
  });

  it('returns null for any non-trigger day', () => {
    for (const d of [-5, 1, 5, 8, 14, 29, 31, 60, 100]) {
      expect(reminderKindFor(d)).toBe(null);
    }
  });
});
