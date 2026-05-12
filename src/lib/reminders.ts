import { renderHtmlEmail, resendBatch, type ResendEmail } from './resend';

export type ReminderKind = '30day' | '7day' | 'dayof';

export interface ReminderRunResult {
  kind: ReminderKind | null;
  daysUntilEvent: number | null;
  eventDateRaw: string | null;
  attempted: number;
  sent: number;
  skipped: number;
  errors: string[];
}

function fmtEventDate(iso: string): string {
  // Render a YYYY-MM-DD string as "Saturday, November 14, 2026".
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const d = new Date(`${iso}T12:00:00Z`); // noon UTC = stable date display
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Detroit',
  });
}

interface ReminderTemplate {
  subject: (date: string) => string;
  body: (date: string) => string;
}

const TEMPLATES: Record<ReminderKind, ReminderTemplate> = {
  '30day': {
    subject: (date) => `30 days to the reunion — ${date}`,
    body: (date) => `Hey Mustangs,

The Clio High School Class of 2006 reunion is just 30 days out.

Date: ${date}
Venue: Round Em Up Ranch · Clio, Michigan
Doors: 6:00 PM

A few things to keep top of mind:

• Update your RSVP if anything's changed: https://cliohsreunion.com/rsvp
• Help cover costs (any amount, friends & family): https://venmo.com/u/Jafisher88
• Lend a hand the day before or day after: https://cliohsreunion.com/volunteer
• Have throwback photos? Submit them privately: https://cliohsreunion.com/share-a-photo

See you soon.

— The planning crew
cliohsreunion.com`,
  },
  '7day': {
    subject: (date) => `One week out — ${date}`,
    body: (date) => `Hey Mustangs,

Just a week until the Class of 2006 reunion at Round Em Up Ranch on ${date}.

Doors open at 6 PM. Quick recap of what we know:

• Bring your favorite stories — twenty years of them.
• Photo booth will run all night. Digital pictures available after.
• Music starts at 8 PM with a 2002–2006 playlist; requests welcome.

Update your RSVP if your plans changed: https://cliohsreunion.com/rsvp

See you next week.

— The planning crew
cliohsreunion.com`,
  },
  'dayof': {
    subject: (date) => `Tonight — Class of 2006 reunion`,
    body: (date) => `Hey Mustangs,

Tonight's the night. ${date}.

Round Em Up Ranch · Clio, Michigan · Doors open at 6 PM.

Drive safe. Bring a friend. Bring stories.

— The planning crew
cliohsreunion.com`,
  },
};

/**
 * Compute the days-until-event from today (UTC) to the configured event date.
 * Returns null if no event date is set.
 */
export function daysUntilEvent(eventDate: string | null, now: Date = new Date()): number | null {
  if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null;
  // Compare at UTC date precision so we don't get jittered by DST or TZ.
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [y, m, d] = eventDate.split('-').map(Number);
  const event = new Date(Date.UTC(y, m - 1, d));
  return Math.round((event.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Map days-until-event → which reminder, if any, fires today.
 * 30, 7, and 0 trigger their respective kinds.
 */
export function reminderKindFor(daysUntil: number | null): ReminderKind | null {
  if (daysUntil === null) return null;
  if (daysUntil === 30) return '30day';
  if (daysUntil === 7)  return '7day';
  if (daysUntil === 0)  return 'dayof';
  return null;
}

/**
 * For a given kind, who should receive it? RSVP yes + maybe.
 */
async function recipientsFor(kind: ReminderKind, db: D1Database): Promise<string[]> {
  const res = await db
    .prepare(`SELECT DISTINCT LOWER(Email) AS email FROM Rsvps WHERE Attending IN ('yes', 'maybe')`)
    .all<{ email: string }>();
  const rows = res.results ?? [];

  // Filter out anyone who's already received this kind.
  const already = await db
    .prepare(`SELECT Email FROM ReminderSends WHERE ReminderKind = ?1`)
    .bind(kind)
    .all<{ Email: string }>();
  const alreadySet = new Set((already.results ?? []).map((r) => r.Email.toLowerCase()));

  return rows.map((r) => r.email).filter((e) => e && !alreadySet.has(e));
}

/**
 * Actually run a reminder send for a given kind. Sends to all RSVP yes/maybe
 * who haven't been sent this kind yet. Records sends in ReminderSends so
 * subsequent invocations are no-ops.
 *
 * `force` is for the admin "test send to me" path — passes overrideRecipients
 * and skips the DB recording.
 */
export async function runReminder(args: {
  kind: ReminderKind;
  eventDate: string;
  db: D1Database;
  resendApiKey: string;
  overrideRecipients?: string[];
  skipRecording?: boolean;
  replyTo?: string;
}): Promise<ReminderRunResult> {
  const result: ReminderRunResult = {
    kind: args.kind,
    daysUntilEvent: daysUntilEvent(args.eventDate),
    eventDateRaw: args.eventDate,
    attempted: 0,
    sent: 0,
    skipped: 0,
    errors: [],
  };

  const tpl = TEMPLATES[args.kind];
  const formattedDate = fmtEventDate(args.eventDate);
  const subject = tpl.subject(formattedDate);
  const bodyText = tpl.body(formattedDate);
  const html = renderHtmlEmail({ subject, bodyText });

  const recipients = args.overrideRecipients
    ? args.overrideRecipients
    : await recipientsFor(args.kind, args.db);

  result.attempted = recipients.length;
  if (recipients.length === 0) return result;

  for (let i = 0; i < recipients.length; i += 100) {
    const batch = recipients.slice(i, i + 100);
    const msgs: ResendEmail[] = batch.map((to) => ({
      to,
      subject,
      html,
      text: bodyText,
      replyTo: args.replyTo,
    }));
    try {
      await resendBatch(args.resendApiKey, msgs);

      // Record the sends (best-effort; ignore individual UNIQUE-constraint
      // failures so partial repeats don't block the rest).
      if (!args.skipRecording) {
        for (const email of batch) {
          try {
            await args.db
              .prepare(`INSERT OR IGNORE INTO ReminderSends (ReminderKind, Email) VALUES (?1, ?2)`)
              .bind(args.kind, email)
              .run();
          } catch (err) {
            console.error('[reminders] record insert failed for', email, err);
          }
        }
      }
      result.sent += batch.length;
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      console.error('[reminders] batch send failed', msg);
      result.errors.push(msg);
      result.skipped += batch.length;
    }
  }

  return result;
}

export function getTemplateText(kind: ReminderKind, eventDate: string): { subject: string; bodyText: string } {
  const tpl = TEMPLATES[kind];
  const formatted = fmtEventDate(eventDate);
  return { subject: tpl.subject(formatted), bodyText: tpl.body(formatted) };
}
