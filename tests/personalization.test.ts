import { describe, expect, it } from 'vitest';
import { personalize, DEFAULT_FALLBACK } from '../src/lib/personalization';

describe('personalize', () => {
  it('substitutes {firstName} once', () => {
    expect(personalize('Hi {firstName}!', 'Jane')).toBe('Hi Jane!');
  });

  it('substitutes every occurrence', () => {
    expect(personalize('{firstName} — {firstName}!', 'Pat')).toBe('Pat — Pat!');
  });

  it('returns the template unchanged when placeholder is absent', () => {
    expect(personalize('No tokens here.', 'Pat')).toBe('No tokens here.');
  });

  it('handles empty templates without throwing', () => {
    expect(personalize('', 'Pat')).toBe('');
  });

  it('does not match a similar but different placeholder', () => {
    expect(personalize('Hi {firstname}!', 'Jane')).toBe('Hi {firstname}!');
  });
});

describe('DEFAULT_FALLBACK', () => {
  it('is "Mustang"', () => {
    expect(DEFAULT_FALLBACK).toBe('Mustang');
  });
});
