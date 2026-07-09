# Deploying (Phase 1: AI analysis)

The site is a static `index.html` plus two serverless functions:
`api/analyze.js` (structured redline) and `api/ask.js` (streaming Q&A chat).
The Anthropic API key lives only on the server and is never sent to the browser.

## What runs where

- `index.html`, pdf.js, the regex parser: the browser (works offline, no key, no cost).
- `api/analyze.js`: a Vercel serverless function. Only runs when the user checks
  "Analyze with AI". If the function is missing or errors, the page silently falls
  back to the built-in regex parser, so the site still works without a backend.

## One-time setup

1. Get an API key at https://console.anthropic.com/ (API Keys).
2. Install the Vercel CLI: `npm i -g vercel`
3. From the project folder, link it: `vercel link`
4. Add the key as an environment variable:
   - Dashboard: Project -> Settings -> Environment Variables -> add `ANTHROPIC_API_KEY`
   - or CLI: `vercel env add ANTHROPIC_API_KEY`

## Run locally with the function

```
vercel dev
```

Opens on http://localhost:3000 and serves both the page and `/api/analyze`.
For local dev the key can also go in a `.env.local` file (see `.env.example`).
Note: opening `index.html` directly as a file (or via plain `http-server`) has no
backend, so the AI checkbox will fall back to the regex parser.

## Deploy

- Connect the GitHub repo at https://vercel.com/new, or run `vercel --prod`.
- Vercel serves `index.html` at `/` and the function at `/api/analyze` automatically.
- Set `ANTHROPIC_API_KEY` in the project's Environment Variables before the first
  AI request, or the function returns a clear "missing_api_key" error.

## Model and cost

- Uses `claude-opus-4-8` with structured JSON output and prompt caching on the
  fee schedule. Each bill is small, so cost is well under a cent per analysis.
- To cut cost at volume, change the `model` in `api/analyze.js` to
  `claude-haiku-4-5`.

## Privacy

- The AI checkbox is off by default. When on, the bill's extracted text (not the
  PDF file) is sent to the function and to Anthropic. The page says so next to the
  checkbox. For confidential matters, consider a zero-data-retention configuration
  on your Anthropic account.
- `privacy.html` is the site's privacy policy, linked from the footer and the
  email-gate note. It identifies General Legal, Inc. (228 Park Ave S PMB
  629206, New York, NY 10003-1502) as the entity that builds and operates the
  Tool, and General Legal, LLP as the licensed firm providing the legal
  services referenced in results. Use the Inc. address in the CAN-SPAM
  footer of any actual campaign email (it's the entity initiating the send),
  and keep the LLP name and a responsible attorney identified in the ad body
  (bar advertising rules attach to whoever is licensed to provide the
  advertised legal services, not to the mailing address).

## Lead storage & unsubscribe (required before a mass send)

`api/lead.js` writes durably to Redis instead of only logging, and honors
unsubscribes, via three pieces:

1. **Storage** (`lib/store.js`): a Redis REST database. Create one at
   https://vercel.com/marketplace (Upstash) or https://upstash.com directly,
   then set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (Vercel's
   own `KV_REST_API_URL` / `KV_REST_API_TOKEN` names also work). Without these,
   `/api/lead` fails closed with a clear `storage_not_configured` error instead
   of silently dropping leads.
2. **Unsubscribe** (`api/unsubscribe.js`, `lib/sign.js`): set `UNSUBSCRIBE_SECRET`
   to a long random string. This signs the link so only a link this server
   generated can suppress an address. The endpoint handles both a normal
   click (GET) and the one-click POST mail providers send for a
   `List-Unsubscribe=One-Click` header (RFC 8058) — put both in your outbound
   email's `List-Unsubscribe` / `List-Unsubscribe-Post` headers.
3. **Export** (`api/export-leads.js`): set `ADMIN_EXPORT_TOKEN` to a long
   random string. `GET /api/export-leads` with `Authorization: Bearer
   <token>` returns every active (non-suppressed) lead, each with a ready-made
   `unsubscribe_url`. Feed this into whatever actually sends the campaign
   (ESP, CRM import, mail merge) so every message carries a working
   unsubscribe link, and re-run the export before each send so anyone who
   already opted out is excluded.

None of this replaces the CAN-SPAM and attorney-solicitation review of the
campaign itself (subject line, "ADVERTISING MATERIAL" labeling where your
target states require it, a physical postal address in the email footer,
honoring opt-outs within 10 business days) — it only makes the app's side of
that (storage + suppression) real instead of a stub.
