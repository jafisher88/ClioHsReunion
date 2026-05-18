/**
 * Thin wrapper over Resend's REST API.
 *
 * We don't pull in the `resend` SDK to keep the Worker bundle small and
 * avoid pinning extra deps. The relevant API surface is:
 *   POST https://api.resend.com/emails       — send one
 *   POST https://api.resend.com/emails/batch — send up to 100 in one call
 *
 * Reference: https://resend.com/docs/api-reference/emails/send-email
 */

const RESEND_API = 'https://api.resend.com';

export const REUNION_FROM = 'Clio HS \'06 Reunion <noreply@cliohsreunion.com>';

export interface ResendEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  audienceId?: string;       // associates the send with a Resend audience so unsubscribes flow back
  headers?: Record<string, string>;
}

export interface ResendAudience {
  id: string;
  name: string;
}

export interface ResendContact {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  unsubscribed?: boolean;
  created_at?: string;
}

export interface ResendSendResult {
  id?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render plain-text reunion-flavored email body into our standard HTML
 * template. Auto-links bare URLs, converts blank-line paragraphs to <p>,
 * and single newlines to <br>.
 */
export function renderHtmlEmail(args: { subject: string; bodyText: string }): string {
  const paragraphs = args.bodyText
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n{2,}/)
    .map((para) => {
      // Linkify bare URLs, then convert single newlines to <br>.
      const escaped = escapeHtml(para);
      const linked = escaped.replace(
        /(https?:\/\/[^\s<]+[^\s<.,!?;:'"\)])/g,
        '<a href="$1" style="color:#c75603;text-decoration:underline">$1</a>',
      );
      const withBr = linked.replace(/\n/g, '<br>');
      return `<p style="margin:0 0 16px 0;line-height:1.55;color:#2b2520;font-size:16px">${withBr}</p>`;
    })
    .join('\n');

  // Inline styles only — many email clients strip <style> tags.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(args.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#fdfbf6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,'Helvetica Neue',sans-serif;color:#2b2520">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fdfbf6">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e2d4b5;border-radius:16px;box-shadow:0 1px 3px rgba(13,11,10,0.04),0 8px 16px -8px rgba(13,11,10,0.06)">
          <tr>
            <td style="background:linear-gradient(135deg,#c75603,#1a1714);padding:24px 32px;border-radius:16px 16px 0 0">
              <div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;font-weight:700;color:#ffe2bf">Clio High School · Class of '06</div>
              <div style="margin-top:6px;font-size:22px;font-weight:700;color:#fdfbf6;letter-spacing:-0.01em">20-Year Reunion</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px 32px">
              <h1 style="margin:0 0 24px 0;font-size:22px;line-height:1.25;color:#0d0b0a;letter-spacing:-0.01em">${escapeHtml(args.subject)}</h1>
              ${paragraphs}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 32px 32px;border-top:1px solid #efe5cf;color:#6b5b37;font-size:12px;line-height:1.5">
              <p style="margin:8px 0 4px 0">You're getting this because you RSVP'd or volunteered for the Clio HS Class of 2006 reunion.</p>
              <p style="margin:0 0 4px 0">Reunion site: <a href="https://cliohsreunion.com" style="color:#c75603;text-decoration:underline">cliohsreunion.com</a></p>
              <p style="margin:8px 0 4px 0">Don't want these? <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#c75603;text-decoration:underline">Unsubscribe</a>.</p>
              <p style="margin:0;color:#8d7849;font-size:11px;letter-spacing:0.06em">Once a Mustang, always a Mustang.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildPayload(msg: ResendEmail): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    from: REUNION_FROM,
    to: [msg.to],
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
  };
  if (msg.replyTo) payload.reply_to = msg.replyTo;
  if (msg.audienceId) payload.audience_id = msg.audienceId;
  if (msg.headers && Object.keys(msg.headers).length > 0) payload.headers = msg.headers;
  return payload;
}

/**
 * Send a single email via Resend.
 */
export async function resendSend(apiKey: string, msg: ResendEmail): Promise<ResendSendResult> {
  const res = await fetch(`${RESEND_API}/emails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildPayload(msg)),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend send failed (${res.status}): ${body}`);
  }
  return res.json();
}

/**
 * Batch send up to 100 emails in one round-trip. Each recipient gets its own
 * separate message (so they don't see each other in a To:/Cc: list).
 */
export async function resendBatch(
  apiKey: string,
  messages: ResendEmail[],
): Promise<{ data?: Array<{ id: string }> }> {
  if (messages.length === 0) return { data: [] };
  if (messages.length > 100) {
    throw new Error('resendBatch supports at most 100 messages per call.');
  }
  const payload = messages.map(buildPayload);

  const res = await fetch(`${RESEND_API}/emails/batch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend batch failed (${res.status}): ${body}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Audiences / Contacts — used to capture unsubscribe state from Resend.
// Audience reference: https://resend.com/docs/api-reference/audiences/list-audiences
// Contact  reference: https://resend.com/docs/api-reference/contacts/list-contacts
// ---------------------------------------------------------------------------

export async function resendListAudiences(apiKey: string): Promise<ResendAudience[]> {
  const res = await fetch(`${RESEND_API}/audiences`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend list audiences failed (${res.status}): ${body}`);
  }
  const json = await res.json() as { data?: ResendAudience[] };
  return json.data ?? [];
}

export async function resendCreateAudience(apiKey: string, name: string): Promise<ResendAudience> {
  const res = await fetch(`${RESEND_API}/audiences`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend create audience failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<ResendAudience>;
}

/**
 * Ensure an audience exists with this name and return its id.
 * Idempotent: looks up first, creates only on miss.
 */
export async function resendEnsureAudience(apiKey: string, name: string): Promise<string> {
  const audiences = await resendListAudiences(apiKey);
  const match = audiences.find((a) => a.name === name);
  if (match) return match.id;
  const created = await resendCreateAudience(apiKey, name);
  return created.id;
}

/**
 * Upsert a contact into an audience. Resend's POST is idempotent on email —
 * 200 if it existed, 201 if newly created. We just swallow the response.
 */
export async function resendUpsertContact(
  apiKey: string,
  audienceId: string,
  contact: { email: string; firstName?: string; lastName?: string; unsubscribed?: boolean },
): Promise<void> {
  const payload: Record<string, unknown> = {
    email: contact.email.toLowerCase().trim(),
  };
  if (contact.firstName) payload.first_name = contact.firstName;
  if (contact.lastName)  payload.last_name  = contact.lastName;
  if (typeof contact.unsubscribed === 'boolean') payload.unsubscribed = contact.unsubscribed;

  const res = await fetch(`${RESEND_API}/audiences/${audienceId}/contacts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  // 409 / 422 mean the contact already exists in this audience; treat as success.
  if (!res.ok && res.status !== 409 && res.status !== 422) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend upsert contact failed (${res.status}): ${body}`);
  }
}

/**
 * Upsert many contacts while staying inside Resend's 5 req/sec rate limit.
 *
 * Sends in chunks of 4 with a ~1.1s pause between chunks — leaving headroom
 * for the email send that typically follows. Per-contact errors are caught
 * and forwarded to `onError`; the helper never throws, since contact upsert
 * is best-effort (the send itself doesn't depend on it).
 *
 * Why this exists: a naive `Promise.all(emails.map(upsert))` blows the
 * 5 req/sec ceiling on any audience > ~5 recipients, and the immediately
 * following batch send eats a 429.
 */
export async function resendUpsertContacts(
  apiKey: string,
  audienceId: string,
  contacts: Array<{ email: string; firstName?: string; lastName?: string; unsubscribed?: boolean }>,
  onError?: (email: string, err: unknown) => void,
  options: { chunkSize?: number; delayMs?: number } = {},
): Promise<void> {
  const chunkSize = options.chunkSize ?? 4;
  const delayMs = options.delayMs ?? 1100;

  for (let i = 0; i < contacts.length; i += chunkSize) {
    const chunk = contacts.slice(i, i + chunkSize);
    await Promise.all(chunk.map(async (c) => {
      try {
        await resendUpsertContact(apiKey, audienceId, c);
      } catch (err) {
        if (onError) onError(c.email, err);
      }
    }));
    if (delayMs > 0 && i + chunkSize < contacts.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

// ---------------------------------------------------------------------------
// Listing — used by the backfill flow to recover per-message ids for blasts
// that were sent before per-recipient logging existed. We can match by
// subject + created_at window and pull each message's last_event in one
// pass. Reference: https://resend.com/docs/api-reference/emails/list-emails
// ---------------------------------------------------------------------------

export interface ResendListedEmail {
  id: string;
  to: string[];
  from: string;
  subject: string;
  created_at: string;
  last_event?: string;
}

export interface ResendListEmailsPage {
  data: ResendListedEmail[];
  has_more: boolean;
}

export async function resendListEmails(
  apiKey: string,
  opts: { limit?: number; after?: string } = {},
): Promise<ResendListEmailsPage> {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.after) params.set('after', opts.after);
  const url = `${RESEND_API}/emails${params.toString() ? `?${params}` : ''}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend list emails failed (${res.status}): ${body}`);
  }
  const json = await res.json() as { data?: ResendListedEmail[]; has_more?: boolean };
  return { data: json.data ?? [], has_more: !!json.has_more };
}

// ---------------------------------------------------------------------------
// Per-message status — used by the blast detail page to show last_event for
// each recipient. Reference: https://resend.com/docs/api-reference/emails/retrieve-email
// ---------------------------------------------------------------------------

export interface ResendEmailStatus {
  id: string;
  last_event?: string;          // sent | delivered | delivery_delayed | complained | bounced | opened | clicked
  created_at?: string;
}

/**
 * Fetch the most recent event for a single sent email. Returns `null` if
 * Resend no longer has the message (404) — older sends past retention.
 */
export async function resendGetEmail(apiKey: string, emailId: string): Promise<ResendEmailStatus | null> {
  const res = await fetch(`${RESEND_API}/emails/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend get email failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<ResendEmailStatus>;
}

export async function resendListContacts(apiKey: string, audienceId: string): Promise<ResendContact[]> {
  const res = await fetch(`${RESEND_API}/audiences/${audienceId}/contacts`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend list contacts failed (${res.status}): ${body}`);
  }
  const json = await res.json() as { data?: ResendContact[] };
  return json.data ?? [];
}
