import { describe, expect, it } from 'vitest';
import { personalize } from '../src/lib/personalization';

describe('personalize', () => {
  it('substitutes {firstName} once', () => {
    expect(personalize('Hi {firstName}!', 'Jane')).toBe('Hi Jane!');
  });

  it('substitutes every occurrence', () => {
    expect(personalize('{firstName} — {firstName}!', 'Pat')).toBe('Pat — Pat!');
  });
});
