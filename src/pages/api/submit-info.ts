import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { renderHtmlEmail, resendSend, REUNION_FROM } from '../../lib/resend';
import { validate, type SubmitPayload } from '../../lib/validators/submit-info';

async function notifyAdmins(
  apiKey: string | undefined,
  data: { id: number; payload: SubmitPayload },
): Promise<void> {
  if (!apiKey) return;

  let adminEmails: string[] = [];
  try {
    const result = await env.DB
      .prepare('SELECT Email FROM Admins ORDER BY AddedAt ASC')
      .all<{ Email: string }>();
    adminEmails = (result.results ?? []).map(r => r.Email).filter(Boolean);
  } catch (err) {
    console.error('[submit-info] could not load admins for notification', err);
    return;
  }
  if (adminEmails.length === 0) return;

  const subject = `[Reunion site] New ${data.payload.category} submission #${data.id}`;
  const lines = [
    `A new submission was sent through the reunion site.`,
    ``,
    `Category: ${data.payload.category}`,
    `From: ${data.payload.submitterName ?? '(anonymous)'}${data.payload.submitterEmail ? ` <${data.payload.submitterEmail}>` : ''}`,
    data.payload.subject ? `Subject: ${data.payload.subject}` : '',
    ``,
    data.payload.message,
    ``,
    `Review and respond: https://cliohsreunion.com/admin/submissions`,
  ].filter(Boolean);
  const bodyText = lines.join('\n');
  const html = renderHtmlEmail({ subject, bodyText });

  await Promise.all(
    adminEmails.map(async (to) => {
      try {
        await resendSend(apiKey, {
          to,
          subject,
          html,
          text: bodyText,
          replyTo: data.payload.submitterEmail,
        });
      } catch (err) {
        console.error('[submit-info] notify failed for', to, err);
      }
    }),
  );
}

export const POST: APIRoute = async ({ request }) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Could not parse JSON.' }, { status: 400 });
  }

  const result = validate(payload);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  const db = env.DB;
  if (!db) {
    console.log('[submit-info] D1 missing; would have stored:', result.value);
    return Response.json({ ok: true, persisted: false }, { status: 200 });
  }

  let insertId: number | null = null;
  try {
    const row = await db
      .prepare(
        `INSERT INTO Submissions
           (Category, SubmitterName, SubmitterEmail, Subject, Message)
         VALUES (?1, NULLIF(?2, ''), NULLIF(?3, ''), NULLIF(?4, ''), ?5)
         RETURNING Id`
      )
      .bind(
        result.value.category,
        result.value.submitterName ?? '',
        result.value.submitterEmail ?? '',
        result.value.subject ?? '',
        result.value.message,
      )
      .first<{ Id: number }>();
    insertId = row?.Id ?? null;
  } catch (err) {
    console.error('[submit-info] insert failed', err);
    return Response.json({ error: 'Could not save your message. Please try again.' }, { status: 500 });
  }

  // Fire-and-forget admin notification — don't make the user wait on email.
  if (insertId !== null) {
    await notifyAdmins(env.RESEND_API_KEY, { id: insertId, payload: result.value });
  }

  // Silence unused-import warning if REUNION_FROM tree-shakes oddly.
  void REUNION_FROM;
  return Response.json({ ok: true, persisted: true, id: insertId }, { status: 200 });
};
