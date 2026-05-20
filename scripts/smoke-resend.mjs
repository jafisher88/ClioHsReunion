#!/usr/bin/env node
/**
 * Manual end-to-end smoke test for /api/admin/blast/:id/resend.
 *
 * What it does (in order):
 *   1. Prompts for a parent blast id, a base URL (e.g. http://localhost:4321),
 *      an admin session cookie value, and a non-routable test inbox you can
 *      actually check (e.g. smoke+1715000000@your-domain.com).
 *   2. Calls GET /api/admin/blast/:id/resend-preview to confirm canResend.
 *   3. POSTs a row into Rsvps via a *new SQL endpoint we don't have* —
 *      so instead, this script prints the wrangler command to seed the
 *      RSVP locally OR remotely, and waits for you to run it in another
 *      terminal. (We deliberately don't expose a "POST arbitrary SQL"
 *      endpoint for safety.)
 *   4. Once you confirm the RSVP is in, the script re-checks the preview
 *      to verify newRecipientCount went up.
 *   5. POSTs to /api/admin/blast/:id/resend with the original subject +
 *      body. Asserts 200 + recipientCount.
 *   6. Prompts you to confirm the email landed in the test inbox.
 *   7. Prints the wrangler cleanup commands (DELETE the test RSVP rows;
 *      optionally DELETE the new EmailBlasts + EmailBlastSends rows).
 *
 * Why interactive: this hits a real network, sends a real email, and
 * mutates real DB rows. Confirmation prompts keep a human in the loop
 * for each consequential action. Safe to run against local; run against
 * remote only when you're ready.
 *
 * Usage:
 *   node scripts/smoke-resend.mjs
 *
 * Pre-reqs:
 *   - Dev server (`npm run dev`) OR remote deployed worker accessible.
 *   - You have an admin session cookie for the target environment
 *     (sign in via the browser, copy the admin_session cookie value
 *     from devtools, paste here).
 *   - Wrangler can talk to the target D1 (the script doesn't run wrangler
 *     itself — it prints the commands so you stay in control).
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const rl = createInterface({ input: stdin, output: stdout });

async function prompt(question, defaultValue) {
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || defaultValue || '';
}

async function confirm(question) {
  const answer = (await rl.question(`${question} (y/N): `)).trim().toLowerCase();
  return answer === 'y' || answer === 'yes';
}

function abort(message) {
  console.error(`\n[smoke] ABORT: ${message}`);
  rl.close();
  process.exit(1);
}

function header(text) {
  const bar = '─'.repeat(Math.max(text.length, 60));
  console.log(`\n${bar}\n${text}\n${bar}`);
}

async function main() {
  header('Resend smoke test — interactive');
  console.log('Mutates real DB rows and may send a real email. Confirms each step.');

  const baseUrl = (await prompt('Base URL', 'http://localhost:4321')).replace(/\/$/, '');
  const cookie = await prompt('Admin session cookie value (just the token, NOT "admin_session=…")');
  if (!cookie) abort('Cookie required.');

  const parentBlastId = await prompt('Parent blast id (the campaign root to resend)');
  if (!/^\d+$/.test(parentBlastId)) abort('Blast id must be a positive integer.');

  const dbName = await prompt('D1 database name (for the wrangler hints)', 'cliohsreunion-db');
  const remoteFlag = (await confirm('Targeting REMOTE D1?')) ? '--remote' : '--local';

  const testTs = Math.floor(Date.now() / 1000);
  const defaultEmail = `smoke+${testTs}@example.invalid`;
  const testEmail = await prompt('Test recipient email (a real inbox you control)', defaultEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) abort('Invalid email format.');

  const headers = {
    'Cookie': `admin_session=${encodeURIComponent(cookie)}`,
    'Content-Type': 'application/json',
  };

  // Step 1 — preview before seeding.
  header('1. Pre-seed preview');
  const previewUrl = `${baseUrl}/api/admin/blast/${parentBlastId}/resend-preview`;
  console.log(`GET ${previewUrl}`);
  const preview1 = await fetch(previewUrl, { headers });
  const preview1Body = await preview1.json().catch(() => ({}));
  console.log(`  → ${preview1.status}`, preview1Body);
  if (preview1.status === 404) abort('Blast not found.');
  if (preview1.status === 401) abort('Admin session rejected — cookie wrong or expired.');
  if (preview1.status !== 200) abort('Unexpected response.');
  const before = Number(preview1Body.newRecipientCount ?? 0);

  // Step 2 — print the seed command and wait for the human to run it.
  header('2. Seed a test RSVP (run this in another terminal)');
  const seedSql = `INSERT INTO Rsvps (FullName, Email, Attending) VALUES ('Smoke Test', '${testEmail}', 'yes');`;
  console.log(`npx wrangler d1 execute ${dbName} ${remoteFlag} --command "${seedSql}"`);
  console.log('Hit ENTER once that command completes.');
  await rl.question('');

  // Step 3 — preview again, expect newRecipientCount to have gone up by 1.
  header('3. Post-seed preview');
  const preview2 = await fetch(previewUrl, { headers });
  const preview2Body = await preview2.json().catch(() => ({}));
  console.log(`  → ${preview2.status}`, preview2Body);
  const after = Number(preview2Body.newRecipientCount ?? 0);
  if (after !== before + 1) {
    console.warn(`[smoke] WARNING: newRecipientCount did not increment by exactly 1 (${before} → ${after}).`);
    if (!(await confirm('Continue anyway?'))) abort('User aborted.');
  } else {
    console.log(`  ✓ newRecipientCount: ${before} → ${after}`);
  }

  // Step 4 — confirm before triggering the actual send.
  header('4. Confirm send');
  console.log(`This will POST to ${baseUrl}/api/admin/blast/${parentBlastId}/resend`);
  console.log(`Subject: "${preview2Body.originalSubject}"`);
  console.log(`Recipients: ${after} (including ${testEmail})`);
  if (!(await confirm('Proceed with the send?'))) abort('User declined.');

  // Step 5 — send.
  header('5. Resend');
  const sendRes = await fetch(`${baseUrl}/api/admin/blast/${parentBlastId}/resend`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      subject: preview2Body.originalSubject,
      body: preview2Body.originalBody,
    }),
  });
  const sendBody = await sendRes.json().catch(() => ({}));
  console.log(`  → ${sendRes.status}`, sendBody);
  if (sendRes.status !== 200) abort('Send failed.');
  const newBlastId = sendBody.blastId;
  console.log(`  ✓ New blast id: ${newBlastId} · recipientCount: ${sendBody.recipientCount}`);

  // Step 6 — human confirms the email landed.
  header('6. Inbox check');
  console.log(`Open the inbox for ${testEmail} and confirm an email from the reunion landed.`);
  const landed = await confirm('Did the email arrive?');
  if (!landed) {
    console.log('[smoke] Email did NOT arrive. Check Resend dashboard, webhook events, and EmailBlastSends.Status.');
  }

  // Step 7 — print cleanup commands.
  header('7. Cleanup (manual — run when ready)');
  console.log('Delete the test RSVP:');
  console.log(`  npx wrangler d1 execute ${dbName} ${remoteFlag} --command "DELETE FROM Rsvps WHERE Email = '${testEmail}';"`);
  console.log('Optionally delete the follow-up audit rows:');
  console.log(`  npx wrangler d1 execute ${dbName} ${remoteFlag} --command "DELETE FROM EmailBlastSends WHERE BlastId = ${newBlastId};"`);
  console.log(`  npx wrangler d1 execute ${dbName} ${remoteFlag} --command "DELETE FROM EmailBlasts WHERE Id = ${newBlastId};"`);

  header('Done');
  console.log(`  Result: ${landed ? 'PASS' : 'INCONCLUSIVE'}`);
  console.log(`  New blast: #${newBlastId}, ParentBlastId=${parentBlastId}`);
  console.log(`  Recorded test address: ${testEmail}`);
  rl.close();
  process.exit(landed ? 0 : 2);
}

main().catch((err) => {
  console.error('[smoke] ERROR:', err);
  rl.close();
  process.exit(1);
});
