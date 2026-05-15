import { describe, expect, it } from 'vitest';
import { validate, ALLOWED_CATEGORIES } from '../../src/lib/validators/submit-info';

const baseValid = {
  category: 'general',
  message: 'Hello, I have a question about the reunion.',
};

describe('validators/submit-info', () => {
  it('submit-info.honeypot.trips: rejects when hp field is non-empty', () => {
    expect(validate({ ...baseValid, hp: 'i-am-a-bot' })).toMatchObject({
      ok: false,
      error: 'Spam detected.',
    });
  });

  it('submit-info.honeypot.trips: accepts when hp is empty string', () => {
    expect(validate({ ...baseValid, hp: '' })).toMatchObject({ ok: true });
  });

  it.each(Array.from(ALLOWED_CATEGORIES).map((c) => [c]))(
    'submit-info.category.enum: accepts category %s',
    (cat) => {
      expect(validate({ ...baseValid, category: cat })).toMatchObject({
        ok: true,
        value: { category: cat },
      });
    },
  );

  it('submit-info.category.enum: rejects unknown category', () => {
    expect(validate({ ...baseValid, category: 'nonsense-category' })).toMatchObject({
      ok: false,
      error: 'Pick a valid category.',
    });
  });

  it('submit-info.category.defaultsGeneral: empty category falls back to general', () => {
    expect(validate({ ...baseValid, category: '' })).toMatchObject({
      ok: true,
      value: { category: 'general' },
    });
  });

  it('submit-info.category.defaultsGeneral: missing category falls back to general', () => {
    const { category, ...payload } = baseValid;
    void category;
    expect(validate(payload)).toMatchObject({
      ok: true,
      value: { category: 'general' },
    });
  });

  it('submit-info.message.minLength: rejects message shorter than 5 chars', () => {
    expect(validate({ ...baseValid, message: 'hi' })).toMatchObject({
      ok: false,
      error: 'Message is too short.',
    });
  });

  it('submit-info.message.minLength: rejects empty message', () => {
    expect(validate({ ...baseValid, message: '' })).toMatchObject({
      ok: false,
      error: 'Please add a message.',
    });
  });

  it('submit-info.message.minLength: accepts exactly 5 chars', () => {
    expect(validate({ ...baseValid, message: 'abcde' })).toMatchObject({ ok: true });
  });

  it('submit-info.message.clamped: truncates message over 5000 chars (no reject)', () => {
    const r = validate({ ...baseValid, message: 'x'.repeat(8000) });
    expect(r).toMatchObject({ ok: true, value: { message: 'x'.repeat(5000) } });
  });

  it('submit-info.submitterEmail.optional: accepts when blank', () => {
    expect(validate({ ...baseValid, submitterEmail: '' })).toMatchObject({
      ok: true,
      value: { submitterEmail: undefined },
    });
  });

  it('submit-info.submitterEmail.optional: accepts when omitted', () => {
    expect(validate(baseValid)).toMatchObject({
      ok: true,
      value: { submitterEmail: undefined },
    });
  });

  it('submit-info.submitterEmail.optional: accepts a valid present email and lowercases', () => {
    expect(validate({ ...baseValid, submitterEmail: 'Jane@Example.COM' })).toMatchObject({
      ok: true,
      value: { submitterEmail: 'jane@example.com' },
    });
  });

  it('submit-info.submitterEmail.optional: rejects malformed email when present', () => {
    expect(validate({ ...baseValid, submitterEmail: 'not-an-email' })).toMatchObject({
      ok: false,
      error: 'Please enter a valid email or leave it blank.',
    });
  });
});
