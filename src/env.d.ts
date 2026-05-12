/// <reference types="astro/client" />

// Cloudflare Workers environment bindings
// Access via: import { env } from 'cloudflare:workers';
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    EVENT_NAME: string;
    VENUE: string;
    ADMIN_PASSWORD?: string;
    RESEND_API_KEY?: string;
    ORGANIZER_EMAIL?: string;
  }
}
