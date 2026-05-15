import { describe, expect, it } from 'vitest';
import { shouldUpdate } from '../src/lib/webhook-status';

describe('shouldUpdate — positive funnel progression', () => {
  it.each([
    ['sent', 'delivered'],
    ['delivered', 'opened'],
    ['opened', 'clicked'],
  ])('promotes %s → %s', (cur, next) => {
    expect(shouldUpdate(cur, next)).toBe(true);
  });

  it.each([
    ['clicked', 'opened'],
    ['clicked', 'delivered'],
    ['clicked', 'sent'],
    ['opened', 'sent'],
    ['delivered', 'sent'],
  ])('never demotes %s ← %s', (cur, next) => {
    expect(shouldUpdate(cur, next)).toBe(false);
  });

  it.each([
    ['sent'],
    ['delivered'],
    ['clicked'],
  ])('treats same-state %s as no-op', (s) => {
    expect(shouldUpdate(s, s)).toBe(false);
  });
});

describe('shouldUpdate — negative terminals always win', () => {
  it.each([
    ['sent'],
    ['delivered'],
    ['opened'],
    ['clicked'],
  ])('bounced overwrites %s', (cur) => {
    expect(shouldUpdate(cur, 'bounced')).toBe(true);
  });

  it.each([
    ['sent'],
    ['clicked'],
  ])('complained overwrites %s', (cur) => {
    expect(shouldUpdate(cur, 'complained')).toBe(true);
  });

  it.each([
    ['sent'],
    ['opened'],
  ])('failed overwrites %s', (cur) => {
    expect(shouldUpdate(cur, 'failed')).toBe(true);
  });

  it.each([
    ['bounced', 'delivered'],
    ['bounced', 'opened'],
    ['complained', 'clicked'],
    ['failed', 'sent'],
  ])('positive event %s does not overwrite terminal %s', (cur, next) => {
    expect(shouldUpdate(cur, next)).toBe(false);
  });
});

describe('shouldUpdate — delivery_delayed', () => {
  it('upgrades a sent row to delivery_delayed', () => {
    expect(shouldUpdate('sent', 'delivery_delayed')).toBe(true);
  });

  it.each([
    ['delivered'],
    ['opened'],
    ['clicked'],
  ])('delivery_delayed is ignored once row moved past sent (cur=%s)', (cur) => {
    expect(shouldUpdate(cur, 'delivery_delayed')).toBe(false);
  });
});

describe('shouldUpdate — unknown states', () => {
  it.each([
    ['', 'sent'],
    ['unknown', 'delivered'],
  ])('treats unknown current %j as below %s', (cur, next) => {
    expect(shouldUpdate(cur, next)).toBe(true);
  });

  it('treats unknown new state as not-an-upgrade', () => {
    expect(shouldUpdate('sent', 'whatever')).toBe(false);
  });
});

describe('shouldUpdate — terminal to terminal', () => {
  // Pin documented behavior: once a row is terminal, a later terminal
  // event still lands (e.g. a complaint after a bounce — the recipient
  // both bounced and reported spam). The negative-overrides path
  // returns true unconditionally on negative-new.
  it('complained lands over a prior bounce', () => {
    expect(shouldUpdate('bounced', 'complained')).toBe(true);
  });
});

