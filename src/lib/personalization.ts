/**
 * Map recipient email addresses to the first name we should use when greeting
 * them in an outgoing email.
 *
 * Resolution order, per email:
 *   1. Classmate.PreferredFirstName (matched via Rsvps/Volunteers full-name
 *      match against Classmates — exact or "preferred + last name").
 *   2. First word of the matched Classmate.FullName (the yearbook entry).
 *   3. First word of whatever the recipient submitted in the form.
 *   4. "Mustang" as a friendly catch-all.
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
        SELECT Email, FullName FROM Rsvps
        UNION ALL
        SELECT Email, FullName FROM Volunteers
      )
      SELECT
        LOWER(TRIM(s.Email))               AS email,
        s.FullName                         AS submittedName,
        c.PreferredFirstName               AS preferred,
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
      preferred: string | null;
      classmateFullName: string | null;
    }>();

    for (const row of res.results ?? []) {
      // Only set the entry if we haven't found a better one yet. A "better"
      // entry is one with a non-null preferred name.
      const candidate =
        (row.preferred && row.preferred.trim()) ||
        firstWord(row.classmateFullName) ||
        firstWord(row.submittedName) ||
        '';
      if (!candidate) continue;
      const existing = byEmail.get(row.email);
      // If existing is a generic-first-word but this row carries a preferred
      // name, upgrade. Otherwise first match wins.
      if (!existing || (row.preferred && row.preferred.trim())) {
        byEmail.set(row.email, candidate);
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
