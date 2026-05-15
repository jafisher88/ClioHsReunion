/**
 * Coverage manifest for A6 — the source of truth for which validator rules
 * are covered by tests. `scripts/check-coverage-manifest.mjs` walks every
 * `tests/**\/*.test.ts` and asserts every ID below appears as a substring
 * of ≥ one `it()`/`test()` description.
 *
 * Naming: <route>.<field>.<rule>. Field is the property under test;
 * rule is the specific validation behavior (required, lengthCap, enum,
 * format, range, derived, clamped). Use `clamped` when the validator
 * silently truncates (no reject path) and `lengthCap` when it errors.
 *
 * Add IDs here when a new route's tests land. Drop IDs only when the
 * underlying rule is removed from the validator.
 */
export const COVERAGE_MANIFEST: string[] = [
  // src/lib/validators/rsvp.ts
  'rsvp.fullName.required',
  'rsvp.fullName.lengthCap',
  'rsvp.graduationName.clamped',
  'rsvp.email.format',
  'rsvp.email.lengthCap',
  'rsvp.attending.enum',
  'rsvp.guestCount.range',
  'rsvp.notes.clamped',
  'rsvp.preferredFirstName.derived',

  // src/lib/validators/volunteer.ts
  'volunteer.fullName.required',
  'volunteer.fullName.lengthCap',
  'volunteer.email.format',
  'volunteer.email.lengthCap',
  'volunteer.role.atLeastOne',
  'volunteer.phone.clamped',
  'volunteer.notes.clamped',

  // src/lib/validators/submit-info.ts
  'submit-info.honeypot.trips',
  'submit-info.category.enum',
  'submit-info.category.defaultsGeneral',
  'submit-info.message.minLength',
  'submit-info.message.clamped',
  'submit-info.submitterEmail.optional',

  // src/lib/validators/classmates.ts
  'classmates.fullName.required',
  'classmates.email.format',
  'classmates.year.range',
  'classmates.photoUrl.scheme',
  'classmates.obituaryUrl.scheme',

  // src/lib/validators/ledger.ts
  'ledger.entryDate.format',
  'ledger.direction.enum',
  'ledger.amount.range',
  'ledger.category.required',
];
