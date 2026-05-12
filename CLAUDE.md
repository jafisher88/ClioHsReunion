# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## What This Is

Marketing + RSVP site for the **Clio High School Class of 2006 20-year reunion**.
Currently scheduled for **November 2026 at Round Em Up Ranch in Clio, MI** (exact
date is being voted on in the class Facebook group). Hosted by classmate Amber,
the ranch's owner.
Astro 6 SSR on Cloudflare Workers. Serves cliohsreunion.com.

Mirrors the [ThePressDenWebsite](../ThePressDenWebsite/CLAUDE.md) stack but
intentionally simpler: no cart, no Neon, no admin panel, no auth. Just pages +
one D1 table for RSVPs.

## Commands

```bash
npm run dev                                              # Local dev (Astro :4321)
npm run build                                            # Production build
npm test                                                 # vitest run
npx wrangler d1 migrations apply cliohsreunion-db --local
npx wrangler d1 migrations apply cliohsreunion-db --remote
npx wrangler secret put <NAME>                           # Cloudflare secret
```

## Architecture

- `src/pages/*.astro` — SSR pages
- `src/pages/api/rsvp.ts` — single POST endpoint, writes to D1 `Rsvps` table
- `src/components/*.astro` — server-rendered partials (Logo, Card, Step)
- `src/components/*.tsx` — React islands (RsvpForm, MobileMenu) loaded with `client:load`
- `src/layouts/Layout.astro` — site chrome (header, footer, fonts, OG tags)
- `src/styles/global.css` — Tailwind v4 `@theme` (mustang red + cream + gold palette)
- `migrations/` — D1 sequential SQL migrations
- `wrangler.toml` — D1 binding (`DB`), custom-domain routes
- `.github/workflows/deploy.yml` — push-to-main deploy

## D1 Schema (Rsvps)

PascalCase columns, accessed via D1 prepared statements (`env.DB.prepare(...).bind(...).run()`).

Columns: `Id`, `FullName`, `Email`, `Attending` (`yes|no|maybe`), `GuestCount`,
`MaidenName`, `Notes`, `CreatedAt`.

Multiple submissions per email are allowed (people change their mind) — query for
latest per email if you ever need to dedupe.

## RSVP endpoint behavior

`POST /api/rsvp` accepts JSON, validates everything server-side, inserts into D1.
If the `DB` binding is missing (local dev without a D1 setup) it logs the payload
and returns `{ok: true, persisted: false}` so the UI still feels responsive while
the developer is wiring things up.

## Conventions to follow

- No ORM — raw D1 prepared statements only.
- No literal secrets in tracked files. If you add a secret, use `.dev.vars` locally
  and `wrangler secret put` in production.
- Match existing CSS variable names in `global.css` instead of inventing new ones.
- React islands stay small; keep most rendering server-side in `.astro`.

## Contact list / mailing

The canonical contact list for the Class of 2006 lives in a Google Sheet that
classmates have been adding themselves to. **The sheet URL is intentionally not
stored in this repo** — ask Jason if you need it for an organizer-side workflow.

Sheet is "anyone with link can view." Columns:
`First Name, Last Name, Name at time of graduation if different, Email Address,
Physical Address, Phone Number`.

**Decisions (confirmed by Jason, 2026-05-12):**

1. **Don't link the sheet from the public site.** It contains phone numbers and
   physical addresses. The on-site RSVP form is the public way to opt in; the
   sheet stays internal/organizer-only.
2. **Email-sending tooling is deferred.** When ready, the user will manually
   export the sheet to CSV and send via their own client / Gmail mail-merge.
   No `/admin` page, no Resend integration, no scheduled jobs to build right now.

If those decisions change later, the reasonable build path is:
- Fetch sheet via CSV export URL (`/export?format=csv`) at send time.
- Dedupe with `Rsvps.Email`.
- POST to Resend (`RESEND_API_KEY`, `ORGANIZER_EMAIL` are already stubbed in
  `.dev.vars.example`).
- Gate behind a password-protected `/admin` page (single shared password in
  `wrangler secret`, constant-time compare).
