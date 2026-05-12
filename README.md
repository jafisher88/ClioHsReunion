# cliohsreunion.com

Astro 6 SSR site for the **Clio High School Class of 2006 — 20-Year Reunion**.
Deployed to Cloudflare Workers.

## Stack

- Astro 6 (SSR) + `@astrojs/cloudflare` adapter
- Tailwind CSS v4 (via `@tailwindcss/vite`)
- React 19 islands for the RSVP form + mobile menu
- Cloudflare D1 (`cliohsreunion-db`) for RSVP storage
- GitHub Actions → `wrangler deploy` on push to `main`

## Pages

| Path           | What it is |
|----------------|------------|
| `/`            | Hero, save-the-date, quick facts, external links |
| `/event`       | Date, venue, tentative schedule |
| `/rsvp`        | RSVP form (React island, POSTs to `/api/rsvp`) |
| `/gallery`     | Embedded YouTube playlist + photo placeholder |
| `/classmates`  | Links to Facebook group and `cliohighschool.net` |
| `/contact`     | Reach the planning crew |
| `/api/rsvp`    | POST endpoint, stores into D1 `Rsvps` table |

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars        # optional — only needed if you wire Resend/etc later
npx wrangler d1 create cliohsreunion-db
# Paste the returned database_id into wrangler.toml.
npx wrangler d1 migrations apply cliohsreunion-db --local
npm run dev
```

Open http://localhost:4321.

## Deploy

1. Set `account_id` in `wrangler.toml` (or rely on `CLOUDFLARE_ACCOUNT_ID` secret).
2. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repo secrets in GitHub.
3. Push to `main` — GitHub Actions runs `astro build`, applies D1 migrations to remote, then `wrangler deploy`.
4. Point `cliohsreunion.com` and `www.cliohsreunion.com` at the Worker via Cloudflare DNS / custom domains.

## Querying RSVPs

```bash
npx wrangler d1 execute cliohsreunion-db --remote \
  --command="SELECT Attending, COUNT(*) AS n, SUM(GuestCount) AS guests FROM Rsvps GROUP BY Attending;"
```
