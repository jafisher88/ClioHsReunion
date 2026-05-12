/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

type Env = {
  DB: D1Database;
  EVENT_NAME: string;
  RESEND_API_KEY?: string;
  ORGANIZER_EMAIL?: string;
};

declare module 'cloudflare:workers' {
  export const env: Env;
}

declare namespace App {
  interface Locals extends Env {
    runtime: {
      env: Env;
    };
  }
}
