/**
 * Map recipient email addresses to the first name we should use when greeting
 * them in an outgoing email.
 *
 * Resolution order, per email:
 *   1. RSVP.PreferredFirstName — they told us themselves on the form.
 *   2. Classmate.PreferredFirstName (admin-curated on the roster).
 *   3. First word of the matched Classmate.FullName (the yearbook entry).
 *   4. First word of whatever the recipient submitted in the form.
 *   5. "Mustang" as a friendly catch-all.
 */

export const DEFAULT_FALLBACK = 'Mustang';

export interface FirstNameResolution {
  /** Map keyed by lowercased+trimmed email → first name to use. */
  byEmail: Map<string, string>;
  /** Same value as DEFAULT_FALLBACK; for emails not in `byEmail`. */
  fallback: string;
}

export async function resolveFirstNames(
  db: D1Database,
  emails: Iterable<string>,
): Promise<FirstNameResolution> {
  const normalized = Array.from(
    new Set(
      Array.from(emails)
        .map((e) => (e ?? '').toString().trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  const byEmail = new Map<string, string>();
  const byEmailTier = new Map<string, number>();
  if (normalized.length === 0) return { byEmail, fallback: DEFAULT_FALLBACK };

  // Build a parameterized IN-list. D1 supports up to ~100 bind params per
  // query comfortably; cap defensively.
  const chunks: string[][] = [];
  for (let i = 0; i < normalized.length; i += 90) {
    chunks.push(normalized.slice(i, i + 90));
  }

  for (const chunk of chunks) {
    const placeholders = chunk.map((_, i) => `?${i + 1}`).join(', ');
    const sql = `
      WITH submissions AS (
        SELECT Email, FullName, PreferredFirstName AS rsvpPreferred FROM Rsvps
        UNION ALL
        SELECT Email, FullName, NULL                AS rsvpPreferred FROM Volunteers
      )
      SELECT
        LOWER(TRIM(s.Email))               AS email,
        s.FullName                         AS submittedName,
        s.rsvpPreferred                    AS rsvpPreferred,
        c.PreferredFirstName               AS classmatePreferred,
        c.FullName                         AS classmateFullName
      FROM submissions s
      LEFT JOIN Classmates c
        ON LOWER(TRIM(c.FullName)) = LOWER(TRIM(s.FullName))
        OR (c.PreferredFirstName IS NOT NULL AND c.PreferredFirstName <> ''
            AND LOWER(TRIM(s.FullName))
                = LOWER(TRIM(c.PreferredFirstName || ' '
                             || substr(c.FullName, instr(c.FullName, ' ') + 1))))
      WHERE LOWER(TRIM(s.Email)) IN (${placeholders})
    `;
    const res = await db.prepare(sql).bind(...chunk).all<{
      email: string;
      submittedName: string | null;
      rsvpPreferred: string | null;
      classmatePreferred: string | null;
      classmateFullName: string | null;
    }>();

    for (const row of res.results ?? []) {
      // Resolution priority (best → fallback):
      //   1. RSVP preferred (self-reported)
      //   2. Classmate preferred (admin-curated)
      //   3. Yearbook first word
      //   4. Submitted first word
      const candidate =
        (row.rsvpPreferred && row.rsvpPreferred.trim()) ||
        (row.classmatePreferred && row.classmatePreferred.trim()) ||
        firstWord(row.classmateFullName) ||
        firstWord(row.submittedName) ||
        '';
      if (!candidate) continue;

      const existing = byEmail.get(row.email);
      // A "stronger" source upgrades a weaker one (RSVP preferred always wins,
      // classmate preferred beats any first-word fallback).
      const tier =
        (row.rsvpPreferred && row.rsvpPreferred.trim()) ? 3
        : (row.classmatePreferred && row.classmatePreferred.trim()) ? 2
        : 1;
      const existingTier = existing ? (byEmailTier.get(row.email) ?? 0) : 0;
      if (!existing || tier > existingTier) {
        byEmail.set(row.email, candidate);
        byEmailTier.set(row.email, tier);
      }
    }
  }

  return { byEmail, fallback: DEFAULT_FALLBACK };
}

function firstWord(value: string | null | undefined): string {
  if (!value) return '';
  return value.trim().split(/\s+/)[0] ?? '';
}

/**
 * Substitute `{firstName}` (case-sensitive) anywhere in `template` with the
 * provided name. Safe to call on any string; if the placeholder isn't present,
 * the string is returned unchanged.
 */
export function personalize(template: string, firstName: string): string {
  if (!template) return template;
  return template.split('{firstName}').join(firstName);
}
