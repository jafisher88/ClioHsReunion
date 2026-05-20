/**
 * Human-readable labels for the `EmailBlasts.Audience` enum values.
 *
 * Lived inline in both `src/pages/admin/blast.astro` and
 * `src/pages/admin/blast/[id].astro` until the resend feature added
 * a third caller (the resend card on the detail page). Pulled out
 * here so the three rendering surfaces can't drift.
 *
 * Keep the keys in sync with the `VALID_AUDIENCES` set in
 * `src/pages/api/admin/blast.ts` and the SQL switch in `recipientsFor()`.
 */
export const AUDIENCE_LABEL: Record<string, string> = {
  'rsvp-yes':       'RSVPs · Yes',
  'rsvp-maybe':     'RSVPs · Maybe',
  'rsvp-yes-maybe': 'RSVPs · Yes + Maybe',
  'rsvp-all':       'All RSVPs',
  'volunteers':     'Volunteers',
  'everyone':       'Everyone',
  'roster-no-rsvp': "Roster · not RSVP'd",
  'custom':         'Custom list',
};
