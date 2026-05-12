import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB per photo
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
]);

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function extFor(contentType: string, originalName?: string): string {
  switch (contentType) {
    case 'image/jpeg': return 'jpg';
    case 'image/png':  return 'png';
    case 'image/webp': return 'webp';
    case 'image/heic': return 'heic';
    case 'image/heif': return 'heif';
    case 'image/gif':  return 'gif';
  }
  const fromName = originalName?.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  return fromName && fromName.length <= 5 ? fromName : 'bin';
}

function clampText(value: FormDataEntryValue | null, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length === 0 ? null : trimmed;
}

export const POST: APIRoute = async ({ request }) => {
  if (!env.DB) return jsonError('Database not configured.', 503);
  if (!env.PHOTOS) return jsonError('Photo storage not configured.', 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError('Could not parse form data.', 400);
  }

  const file = form.get('photo');
  if (!(file instanceof File)) {
    return jsonError('Please attach a photo.', 400);
  }
  if (file.size === 0) {
    return jsonError('That file looks empty — please re-attach.', 400);
  }
  if (file.size > MAX_BYTES) {
    return jsonError(
      `Photo is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 15 MB.`,
      413,
    );
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return jsonError('That file type isn\'t supported. Use JPG, PNG, HEIC, WebP, or GIF.', 415);
  }

  const caption = clampText(form.get('caption'), 1000);
  const peopleInPhoto = clampText(form.get('peopleInPhoto'), 1000);
  const submitterName = clampText(form.get('submitterName'), 200);
  const submitterEmail = clampText(form.get('submitterEmail'), 320);

  // Generate a key: yyyy/mm/uuid.ext  → predictable + sorted by month
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const uuid = crypto.randomUUID();
  const key = `${yyyy}/${mm}/${uuid}.${extFor(file.type, file.name)}`;

  try {
    await env.PHOTOS.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: {
        originalName: file.name || 'unknown',
        submitterName: submitterName || '',
      },
    });
  } catch (err) {
    console.error('[submit-photo] R2 put failed', err);
    return jsonError('Could not upload your photo. Please try again.', 500);
  }

  try {
    await env.DB
      .prepare(
        `INSERT INTO PhotoSubmissions
           (R2Key, OriginalName, ContentType, Bytes, Caption, PeopleInPhoto, SubmitterName, SubmitterEmail)
         VALUES (?1, ?2, ?3, ?4, NULLIF(?5, ''), NULLIF(?6, ''), NULLIF(?7, ''), NULLIF(?8, ''))`
      )
      .bind(
        key,
        file.name || null,
        file.type,
        file.size,
        caption ?? '',
        peopleInPhoto ?? '',
        submitterName ?? '',
        submitterEmail ?? '',
      )
      .run();
  } catch (err) {
    console.error('[submit-photo] D1 insert failed', err);
    // Best-effort cleanup so we don't leave orphaned R2 objects.
    try { await env.PHOTOS.delete(key); } catch {}
    return jsonError('Could not save your submission. Please try again.', 500);
  }

  return Response.json({ ok: true });
};
