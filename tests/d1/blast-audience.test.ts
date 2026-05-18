import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recipientsFor } from '../../src/pages/api/admin/blast';

// Covers the audience-resolution switch in src/pages/api/admin/blast.ts.
// Seeds Rsvps with one of each Attending value, then exercises every
// rsvp-* branch. The combined `rsvp-yes-maybe` audience is the reason
// this file exists — it's the donate-blast / "still planning to come"
// audience and a regression here would silently broadcast to people who
// already said no, or omit the maybes.

async function clearRsvps() {
  await env.DB.prepare(`DELETE FROM Rsvps`).run();
  await env.DB.prepare(`DELETE FROM Unsubscribes`).run();
}

async function seedRsvp(email: string, attending: 'yes' | 'maybe' | 'no') {
  await env.DB
    .prepare(`INSERT INTO Rsvps (FullName, Email, Attending) VALUES (?1, ?2, ?3)`)
    .bind('Test Person', email, attending)
    .run();
}

describe('recipientsFor (blast audience resolution)', () => {
  beforeEach(clearRsvps);
  afterEach(clearRsvps);

  it('blast-audience.yes: returns only yes RSVPs', async () => {
    await seedRsvp('yes@example.com', 'yes');
    await seedRsvp('maybe@example.com', 'maybe');
    await seedRsvp('no@example.com', 'no');

    const result = await recipientsFor('rsvp-yes', env.DB);

    expect(result.sort()).toEqual(['yes@example.com']);
  });

  it('blast-audience.maybe: returns only maybe RSVPs', async () => {
    await seedRsvp('yes@example.com', 'yes');
    await seedRsvp('maybe@example.com', 'maybe');
    await seedRsvp('no@example.com', 'no');

    const result = await recipientsFor('rsvp-maybe', env.DB);

    expect(result.sort()).toEqual(['maybe@example.com']);
  });

  it('blast-audience.yes-maybe: returns yes ∪ maybe but never no', async () => {
    await seedRsvp('yes@example.com', 'yes');
    await seedRsvp('maybe@example.com', 'maybe');
    await seedRsvp('no@example.com', 'no');

    const result = await recipientsFor('rsvp-yes-maybe', env.DB);

    expect(result.sort()).toEqual(['maybe@example.com', 'yes@example.com']);
  });

  it('blast-audience.yes-maybe.unsubscribed-excluded: drops opted-out addresses', async () => {
    await seedRsvp('yes@example.com', 'yes');
    await seedRsvp('maybe@example.com', 'maybe');
    await env.DB
      .prepare(`INSERT INTO Unsubscribes (Email, Source) VALUES (?1, 'manual')`)
      .bind('maybe@example.com')
      .run();

    const result = await recipientsFor('rsvp-yes-maybe', env.DB);

    expect(result.sort()).toEqual(['yes@example.com']);
  });

  it('blast-audience.all: returns yes ∪ maybe ∪ no', async () => {
    await seedRsvp('yes@example.com', 'yes');
    await seedRsvp('maybe@example.com', 'maybe');
    await seedRsvp('no@example.com', 'no');

    const result = await recipientsFor('rsvp-all', env.DB);

    expect(result.sort()).toEqual(['maybe@example.com', 'no@example.com', 'yes@example.com']);
  });
});
