import { defineMiddleware } from 'astro:middleware';

// Headers we apply to every response. Cloudflare handles TLS termination, but
// nothing app-level enforces clickjacking / sniff / referrer policy without
// this. HSTS opts every visitor into TLS-only for a year (with preload-safe
// flags) and protects them on hostile networks even on first visit after.
const BASE_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=()',
};

// `/admin/*` should never be framed — clickjacking on a logged-in admin would
// let an attacker proxy clicks into destructive actions (delete classmate,
// remove admin). Public pages stay DENY too; we don't embed our own site.
const FRAME_OPTIONS = 'DENY';

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  for (const [name, value] of Object.entries(BASE_HEADERS)) {
    if (!response.headers.has(name)) response.headers.set(name, value);
  }
  if (!response.headers.has('X-Frame-Options')) {
    response.headers.set('X-Frame-Options', FRAME_OPTIONS);
  }
  return response;
});
