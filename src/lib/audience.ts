/**
 * Reunion-mailing-list audience helpers.
 *
 * The audience id is stored in the `Settings` table under key
 * `resend_audience_id`. First call creates the audience in Resend if
 * missing and writes the id; subsequent calls are a single D1 read.
 */
import { resendEnsureAudience } from './resend';

const AUDIENCE_NAME = "Clio HS '06 Reunion mailing list";
const SETTING_KEY = 'resend_audience_id';

export async function getAudienceId(db: D1Database, apiKey: string): Promise<string> {
  const row = await db
    .prepare('SELECT Value FROM Settings WHERE Key = ?1')
    .bind(SETTING_KEY)
    .first<{ Value: string }>();
  if (row?.Value) return row.Value;

  const id = await resendEnsureAudience(apiKey, AUDIENCE_NAME);
  await db
    .prepare(
      `INSERT INTO Settings (Key, Value) VALUES (?1, ?2)
       ON CONFLICT(Key) DO UPDATE SET Value = excluded.Value, UpdatedAt = CURRENT_TIMESTAMP`,
    )
    .bind(SETTING_KEY, id)
    .run();
  return id;
}

/** Standard unsubscribe-friendly headers for Resend sends. */
export function listUnsubscribeHeaders(): Record<string, string> {
  return {
    'List-Unsubscribe': '<{{{RESEND_UNSUBSCRIBE_URL}}}>',
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}
