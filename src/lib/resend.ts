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

/**
 * Send a single email via Resend.
 */
export async function resendSend(apiKey: string, msg: ResendEmail): Promise<ResendSendResult> {
  const payload: Record<string, unknown> = {
    from: REUNION_FROM,
    to: [msg.to],
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
  };
  if (msg.replyTo) payload.reply_to = msg.replyTo;

  const res = await fetch(`${RESEND_API}/emails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
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
  const payload = messages.map((msg) => {
    const m: Record<string, unknown> = {
      from: REUNION_FROM,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    };
    if (msg.replyTo) m.reply_to = msg.replyTo;
    return m;
  });

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
