/// <reference types="astro/client" />

// Cloudflare Workers environment bindings
// Access via: import { env } from 'cloudflare:workers';
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    PHOTOS: R2Bucket;
    EVENT_NAME: string;
    VENUE: string;
    // Admin auth (Google OAuth)
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    SESSION_SECRET?: string;
    // Optional comms
    RESEND_API_KEY?: string;
    ORGANIZER_EMAIL?: string;
    // Shared secret protecting POST /api/cron/run-reminders
    CRON_SECRET?: string;
  }
}
