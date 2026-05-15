import { describe, expect, it } from 'vitest';
import {
  validate,
  parseYear,
  MAX_YEAR,
  MIN_YEAR,
} from '../../src/lib/validators/classmates';

const baseValid = { fullName: 'Jane Doe' };

describe('validators/classmates', () => {
  it('classmates.fullName.required: rejects when fullName is empty', () => {
    expect(validate({})).toMatchObject({ ok: false, error: 'Please enter a name.' });
  });

  it('classmates.fullName.required: accepts non-empty fullName', () => {
    expect(validate(baseValid)).toMatchObject({ ok: true, value: { fullName: 'Jane Doe' } });
  });

  it('classmates.email.format: accepts when email is omitted', () => {
    expect(validate(baseValid)).toMatchObject({ ok: true, value: { email: null } });
  });

  it('classmates.email.format: accepts a valid email and lowercases it', () => {
    expect(validate({ ...baseValid, email: 'Jane@Example.COM' })).toMatchObject({
      ok: true,
      value: { email: 'jane@example.com' },
    });
  });

  it('classmates.email.format: rejects malformed email', () => {
    expect(validate({ ...baseValid, email: 'not-an-email' })).toMatchObject({
      ok: false,
      error: 'Email looks invalid.',
    });
  });

  it('classmates.year.range: accepts birthYear at lower bound', () => {
    expect(validate({ ...baseValid, birthYear: MIN_YEAR })).toMatchObject({
      ok: true,
      value: { birthYear: MIN_YEAR },
    });
  });

  it('classmates.year.range: accepts passingYear at upper bound', () => {
    expect(validate({ ...baseValid, passingYear: MAX_YEAR })).toMatchObject({
      ok: true,
      value: { passingYear: MAX_YEAR },
    });
  });

  it('classmates.year.range: rejects birthYear below 1900', () => {
    expect(validate({ ...baseValid, birthYear: 1899 })).toMatchObject({ ok: false });
  });

  it('classmates.year.range: rejects passingYear above 2100', () => {
    expect(validate({ ...baseValid, passingYear: 2101 })).toMatchObject({ ok: false });
  });

  it('classmates.year.range: rejects non-integer year (2000.5)', () => {
    expect(validate({ ...baseValid, birthYear: 2000.5 })).toMatchObject({ ok: false });
  });

  it('classmates.year.range: parseYear returns null for empty input', () => {
    expect(parseYear('')).toBe(null);
  });

  it('classmates.photoUrl.scheme: accepts a valid https URL', () => {
    expect(
      validate({ ...baseValid, photoUrl: 'https://example.com/photo.jpg' }),
    ).toMatchObject({ ok: true });
  });

  it('classmates.photoUrl.scheme: rejects javascript: URL', () => {
    expect(validate({ ...baseValid, photoUrl: 'javascript:alert(1)' })).toMatchObject({
      ok: false,
      error: 'Photo URL must start with http(s)://',
    });
  });

  it('classmates.obituaryUrl.scheme: rejects data: URL', () => {
    expect(validate({ ...baseValid, obituaryUrl: 'data:text/html,x' })).toMatchObject({
      ok: false,
      error: 'Obituary URL must start with http(s)://',
    });
  });

  it('classmates.obituaryUrl.scheme: accepts a valid http URL', () => {
    expect(
      validate({ ...baseValid, obituaryUrl: 'http://example.com/obit.html' }),
    ).toMatchObject({ ok: true });
  });
});
