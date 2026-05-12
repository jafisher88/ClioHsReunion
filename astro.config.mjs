// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
  security: {
    // Disable Astro's built-in Origin-header CSRF check. We rely on:
    //   - SameSite=Lax on the admin_session cookie (the only auth state
    //     worth protecting) to block cross-origin admin form POSTs.
    //   - A shared secret (CRON_SECRET) on the /api/cron/* webhook so
    //     external schedulers (cron-job.org etc.) can hit it. Astro's
    //     CSRF check blocks all cross-origin POSTs by default, which
    //     breaks server-to-server webhooks that have no Origin header.
    //   - Public APIs (/api/rsvp, /api/volunteer, /api/submit-photo) are
    //     intentionally open submission endpoints; CSRF wouldn't protect
    //     them either way.
    checkOrigin: false,
  },
});
