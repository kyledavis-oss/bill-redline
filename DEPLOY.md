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
