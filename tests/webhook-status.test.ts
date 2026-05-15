import { describe, expect, it } from 'vitest';
import { shouldUpdate } from '../src/lib/webhook-status';

describe('shouldUpdate — positive funnel progression', () => {
  it('promotes sent → delivered → opened → clicked', () => {
    expect(shouldUpdate('sent', 'delivered')).toBe(true);
    expect(shouldUpdate('delivered', 'opened')).toBe(true);
    expect(shouldUpdate('opened', 'clicked')).toBe(true);
  });

  it('never demotes within the positive funnel', () => {
    expect(shouldUpdate('clicked', 'opened')).toBe(false);
    expect(shouldUpdate('clicked', 'delivered')).toBe(false);
    expect(shouldUpdate('clicked', 'sent')).toBe(false);
    expect(shouldUpdate('opened', 'sent')).toBe(false);
    expect(shouldUpdate('delivered', 'sent')).toBe(false);
  });

  it('treats same-state as no-op', () => {
    expect(shouldUpdate('sent', 'sent')).toBe(false);
    expect(shouldUpdate('delivered', 'delivered')).toBe(false);
    expect(shouldUpdate('clicked', 'clicked')).toBe(false);
  });
});

describe('shouldUpdate — negative terminals always win', () => {
  it('bounced overwrites any positive state', () => {
    expect(shouldUpdate('sent', 'bounced')).toBe(true);
    expect(shouldUpdate('delivered', 'bounced')).toBe(true);
    expect(shouldUpdate('opened', 'bounced')).toBe(true);
    expect(shouldUpdate('clicked', 'bounced')).toBe(true);
  });

  it('complained overwrites any positive state', () => {
    expect(shouldUpdate('sent', 'complained')).toBe(true);
    expect(shouldUpdate('clicked', 'complained')).toBe(true);
  });

  it('failed overwrites any positive state', () => {
    expect(shouldUpdate('sent', 'failed')).toBe(true);
    expect(shouldUpdate('opened', 'failed')).toBe(true);
  });

  it('positive events never overwrite a terminal negative', () => {
    expect(shouldUpdate('bounced', 'delivered')).toBe(false);
    expect(shouldUpdate('bounced', 'opened')).toBe(false);
    expect(shouldUpdate('complained', 'clicked')).toBe(false);
    expect(shouldUpdate('failed', 'sent')).toBe(false);
  });
});

describe('shouldUpdate — delivery_delayed', () => {
  it('upgrades a sent row to delivery_delayed', () => {
    expect(shouldUpdate('sent', 'delivery_delayed')).toBe(true);
  });

  it('is ignored once the row has moved past sent', () => {
    expect(shouldUpdate('delivered', 'delivery_delayed')).toBe(false);
    expect(shouldUpdate('opened', 'delivery_delayed')).toBe(false);
    expect(shouldUpdate('clicked', 'delivery_delayed')).toBe(false);
  });
});

describe('shouldUpdate — unknown states', () => {
  it('treats unknown current state as below sent', () => {
    expect(shouldUpdate('', 'sent')).toBe(true);
    expect(shouldUpdate('unknown', 'delivered')).toBe(true);
  });

  it('treats unknown new state as not-an-upgrade', () => {
    expect(shouldUpdate('sent', 'whatever')).toBe(false);
  });
});
