import { describe, expect, it } from 'vitest';
import { validate } from '../../src/lib/validators/rsvp';

// Each it() embeds the matching rule ID from tests/coverage-manifest.ts
// at the start of its description. The coverage-manifest audit script
// walks every test file and asserts each manifest ID is present in ≥ 1
// it() name — so the test names below double as the audit anchor.

const baseValid = {
  fullName: 'Jane Doe',
  email: 'jane@example.com',
  attending: 'yes' as const,
  guestCount: 1,
};

describe('validators/rsvp', () => {
  it('rsvp.fullName.required: rejects when fullName is empty', () => {
    const r = validate({ ...baseValid, fullName: '' });
    expect(r).toMatchObject({ ok: false });
  });

  it('rsvp.fullName.required: accepts a non-empty fullName', () => {
    const r = validate(baseValid);
    expect(r).toMatchObject({ ok: true, value: { fullName: 'Jane Doe' } });
  });

  it('rsvp.fullName.lengthCap: rejects fullName over 200 chars', () => {
    const r = validate({ ...baseValid, fullName: 'a'.repeat(201) });
    expect(r).toMatchObject({ ok: false, error: 'Name is too long.' });
  });

  it('rsvp.graduationName.clamped: accepts and truncates graduationName over 200 chars', () => {
    const r = validate({ ...baseValid, graduationName: 'a'.repeat(500) });
    expect(r).toMatchObject({ ok: true, value: { graduationName: 'a'.repeat(200) } });
  });

  it('rsvp.email.format: rejects malformed email', () => {
    const r = validate({ ...baseValid, email: 'not-an-email' });
    expect(r).toMatchObject({ ok: false, error: 'Please enter a valid email.' });
  });

  it('rsvp.email.format: accepts a valid email and lowercases it', () => {
    const r = validate({ ...baseValid, email: 'Jane@Example.COM' });
    expect(r).toMatchObject({ ok: true, value: { email: 'jane@example.com' } });
  });

  it('rsvp.email.lengthCap: rejects email over 320 chars', () => {
    // 316 + '@x.co' (5) = 321 chars total, just over the 320 cap.
    const r = validate({ ...baseValid, email: `${'a'.repeat(316)}@x.co` });
    expect(r).toMatchObject({ ok: false, error: 'Email is too long.' });
  });

  it.each([
    ['yes'],
    ['no'],
    ['maybe'],
  ])('rsvp.attending.enum: accepts %s', (value) => {
    const r = validate({ ...baseValid, attending: value });
    expect(r).toMatchObject({ ok: true, value: { attending: value } });
  });

  it.each([
    ['perhaps'],
    [''],
    [null],
    [undefined],
  ])('rsvp.attending.enum: rejects %j', (value) => {
    const r = validate({ ...baseValid, attending: value });
    expect(r).toMatchObject({ ok: false });
  });

  it('rsvp.guestCount.range: accepts 0', () => {
    expect(validate({ ...baseValid, guestCount: 0 })).toMatchObject({ ok: true });
  });

  it('rsvp.guestCount.range: accepts 10', () => {
    expect(validate({ ...baseValid, guestCount: 10 })).toMatchObject({ ok: true });
  });

  it('rsvp.guestCount.range: rejects -1', () => {
    expect(validate({ ...baseValid, guestCount: -1 })).toMatchObject({ ok: false });
  });

  it('rsvp.guestCount.range: rejects 11', () => {
    expect(validate({ ...baseValid, guestCount: 11 })).toMatchObject({ ok: false });
  });

  it('rsvp.guestCount.range: rejects non-integer 2.5', () => {
    expect(validate({ ...baseValid, guestCount: 2.5 })).toMatchObject({ ok: false });
  });

  it('rsvp.notes.clamped: truncates notes over 2000 chars (no reject)', () => {
    const r = validate({ ...baseValid, notes: 'x'.repeat(3000) });
    expect(r).toMatchObject({ ok: true, value: { notes: 'x'.repeat(2000) } });
  });

  it('rsvp.preferredFirstName.derived: derives from fullName when absent', () => {
    const r = validate({ ...baseValid, fullName: 'Jane Marie Doe' });
    expect(r).toMatchObject({ ok: true, value: { preferredFirstName: 'Jane' } });
  });

  it('rsvp.preferredFirstName.derived: honors explicit preferredFirstName when present', () => {
    const r = validate({ ...baseValid, fullName: 'Rebecca Frey', preferredFirstName: 'Becky' });
    expect(r).toMatchObject({ ok: true, value: { preferredFirstName: 'Becky' } });
  });
});
