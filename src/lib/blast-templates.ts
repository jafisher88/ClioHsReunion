/**
 * Reusable subject + body presets for the /admin/blast composer.
 *
 * Pure data + pure render functions — no D1, no env. The composer page
 * imports BLAST_TEMPLATES + renderTemplate at SSR time, materializes each
 * template against the current event date, and ships the rendered map to
 * the client script so radio-clicks can swap subject/body fields without
 * a round-trip.
 *
 * Adding a template: append to BLAST_TEMPLATES, add a case in
 * renderTemplate, add a test in tests/blast-templates.test.ts.
 */

export interface EventDateContext {
  /** Full month name, e.g. "November". Always populated. */
  monthLong: string;
  /** "Saturday, November 7, 2026" when locked; "November 2026" when not. */
  longDisplay: string;
  /** True only when admins have committed to a specific calendar date. */
  isLocked: boolean;
}

export interface BlastTemplate {
  id: string;
  label: string;
  description: string;
  /** Optional informational hint — audience id this template typically pairs with. */
  audienceHint?: string;
}

export interface RenderedTemplate {
  subject: string;
  body: string;
}

export const BLAST_TEMPLATES: BlastTemplate[] = [
  {
    id: 'custom',
    label: 'Custom',
    description: 'Write your own subject and body.',
  },
  {
    id: 'rsvp-nudge',
    label: 'RSVP nudge',
    description: "Reminder for classmates who haven't replied yet.",
    audienceHint: 'roster-no-rsvp',
  },
  {
    id: 'venmo-donate',
    label: 'Venmo donation ask',
    description: 'Ask attendees to chip in for DJ + bartender.',
    audienceHint: 'rsvp-yes-maybe',
  },
];

export function renderTemplate(id: string, ctx: EventDateContext): RenderedTemplate {
  switch (id) {
    case 'rsvp-nudge':   return renderRsvpNudge(ctx);
    case 'venmo-donate': return renderVenmoDonate();
    // 'custom' and any unknown id fall through to empty fields.
    default:             return { subject: '', body: '' };
  }
}

function renderRsvpNudge(ctx: EventDateContext): RenderedTemplate {
  const whenSubject = ctx.isLocked ? `happening ${ctx.longDisplay}` : `this ${ctx.monthLong}`;
  const whenBody    = ctx.isLocked ? `on ${ctx.longDisplay}`        : `this ${ctx.monthLong}`;
  return {
    subject: `Our 20-year reunion is ${whenSubject} — please RSVP`,
    body: `Hey {firstName},

Quick note from the Clio High School Class of 2006 reunion crew. Our
20-year reunion is happening ${whenBody} at Round Em Up Ranch in
Clio. All the details (date, venue, schedule, what to bring) live on
the site:

  https://cliohsreunion.com

We're getting close to head-count time and don't see an RSVP from you
yet. Even a quick "yes / maybe / no" helps us plan food, drinks, and
seating, so please take a minute to fill it out:

  https://cliohsreunion.com/rsvp

If you've already replied somewhere else, sorry for the nudge — you
can ignore this. Otherwise, we'd love to see you in ${ctx.monthLong}.

— The planning crew
cliohsreunion.com`,
  };
}

function renderVenmoDonate(): RenderedTemplate {
  return {
    subject: 'Quick ask — help cover the DJ + bartender?',
    body: `Hey {firstName},

As we finalize vendors for the 20-year reunion at Round Em Up Ranch,
the two biggest costs left are the DJ and the bartender. We're trying
to keep the door price down, and any donation toward those helps a ton.

If you can swing it, any amount works:

  https://venmo.com/u/Jafisher88  (@Jafisher88)

Please use Venmo's "friends & family" option so the full amount comes
to the planners and not the processor.

No pressure — you saying you're coming is already the win. Thanks for
being part of this.

— The planning crew
cliohsreunion.com`,
  };
}
