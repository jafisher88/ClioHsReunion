import { defineMiddleware } from 'astro:middleware';

// Headers we apply to every response. Cloudflare handles TLS termination, but
// nothing app-level enforces clickjacking / sniff / referrer policy without
// this. HSTS opts every visitor into TLS-only for a year (with preload-safe
// flags) and protects them on hostile networks even on first visit after.
const BASE_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=()',
};

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();

  // Workers Response headers are immutable on responses produced by some
  // adapters; mutating `response.headers` in place can break the body
  // streaming. The safe pattern is to clone into a new Response, copying
  // the body through and the headers we want to ensure are present.
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(BASE_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
