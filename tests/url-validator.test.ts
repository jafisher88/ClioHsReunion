import { describe, expect, it } from 'vitest';
import { parseHttpUrl } from '../src/lib/url-validator';

// Pin the security contract: only http(s) survives. Each input is a
// distinct `it()` so failures point to the specific bypass vector.
//
// The accept tests assert on `.startsWith(...)` because the URL
// constructor normalizes (trailing slash, default port, case-folded
// host) — the exact .href can drift across Node versions without that
// being a real bug.

describe('parseHttpUrl — accept set', () => {
  it('accepts http://example.com', () => {
    const r = parseHttpUrl('http://example.com');
    expect(typeof r === 'string' && r.startsWith('http://example.com')).toBe(true);
  });

  it('accepts https://example.com/path?q=1', () => {
    const r = parseHttpUrl('https://example.com/path?q=1');
    expect(typeof r === 'string' && r.startsWith('https://example.com/path')).toBe(true);
  });
});

describe('parseHttpUrl — reject set (must return "invalid")', () => {
  it.each([
    ['javascript:alert(1)'],
    ['JavaScript:alert(1)'],
    ['  javascript:x'],
    ['data:text/html,x'],
    ['ftp://x'],
    ['file:///etc/passwd'],
    ['//example.com'],
    ['vbscript:x'],
    ['http:'],
    ['not-a-url'],
  ])('rejects %j', (input) => {
    expect(parseHttpUrl(input)).toBe('invalid');
  });
});

describe('parseHttpUrl — null contract (must return null, not "invalid")', () => {
  it.each([
    [null],
    [undefined],
    [''],
    ['   '],
  ])('returns null for empty-ish input %j', (input) => {
    expect(parseHttpUrl(input)).toBe(null);
  });
});
