import { describe, expect, it } from 'vitest';
import { validate } from '../../src/lib/validators/volunteer';

const baseValid = {
  fullName: 'Anna Stranger',
  email: 'anna@example.com',
  roleSetup: true,
  roleCleanup: false,
};

describe('validators/volunteer', () => {
  it('volunteer.fullName.required: rejects empty fullName', () => {
    expect(validate({ ...baseValid, fullName: '' })).toMatchObject({ ok: false });
  });

  it('volunteer.fullName.required: accepts non-empty fullName', () => {
    expect(validate(baseValid)).toMatchObject({ ok: true, value: { fullName: 'Anna Stranger' } });
  });

  it('volunteer.fullName.lengthCap: rejects fullName over 200 chars', () => {
    expect(validate({ ...baseValid, fullName: 'a'.repeat(201) })).toMatchObject({
      ok: false,
      error: 'Name is too long.',
    });
  });

  it('volunteer.email.format: rejects malformed email', () => {
    expect(validate({ ...baseValid, email: 'not-an-email' })).toMatchObject({ ok: false });
  });

  it('volunteer.email.format: accepts a valid email and lowercases it', () => {
    expect(validate({ ...baseValid, email: 'Anna@Example.COM' })).toMatchObject({
      ok: true,
      value: { email: 'anna@example.com' },
    });
  });

  it('volunteer.email.lengthCap: rejects email over 320 chars', () => {
    // 316 + '@x.co' (5) = 321 chars total.
    expect(validate({ ...baseValid, email: `${'a'.repeat(316)}@x.co` })).toMatchObject({
      ok: false,
      error: 'Email is too long.',
    });
  });

  it('volunteer.role.atLeastOne: accepts when only roleSetup is set', () => {
    expect(validate({ ...baseValid, roleSetup: true, roleCleanup: false })).toMatchObject({
      ok: true,
      value: { roleSetup: true, roleCleanup: false },
    });
  });

  it('volunteer.role.atLeastOne: accepts when only roleCleanup is set', () => {
    expect(validate({ ...baseValid, roleSetup: false, roleCleanup: true })).toMatchObject({
      ok: true,
    });
  });

  it('volunteer.role.atLeastOne: rejects when neither role is set', () => {
    expect(validate({ ...baseValid, roleSetup: false, roleCleanup: false })).toMatchObject({
      ok: false,
      error: 'Pick at least one role — setup or cleanup.',
    });
  });

  it.each([
    ['on'],
    ['true'],
    ['1'],
    ['yes'],
  ])('volunteer.role.atLeastOne: coerces truthy-string %j to true', (input) => {
    const r = validate({ ...baseValid, roleSetup: input, roleCleanup: false });
    expect(r).toMatchObject({ ok: true, value: { roleSetup: true } });
  });

  it.each([
    ['no'],
    [''],
  ])('volunteer.role.atLeastOne: coerces falsy-string %j to false (then rejects since neither role set)', (input) => {
    const r = validate({ ...baseValid, roleSetup: input, roleCleanup: false });
    expect(r).toMatchObject({ ok: false });
  });

  it('volunteer.phone.clamped: truncates phone over 40 chars (no reject)', () => {
    const r = validate({ ...baseValid, phone: '1'.repeat(50) });
    expect(r).toMatchObject({ ok: true, value: { phone: '1'.repeat(40) } });
  });

  it('volunteer.notes.clamped: truncates notes over 2000 chars (no reject)', () => {
    const r = validate({ ...baseValid, notes: 'x'.repeat(3000) });
    expect(r).toMatchObject({ ok: true, value: { notes: 'x'.repeat(2000) } });
  });
});
