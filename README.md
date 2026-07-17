# Call BS on Your Legal Bill

Upload an invoice from your law firm and see, in plain numbers, what a
comparable scope of work costs at [General Legal](https://general.legal)'s
flat fees.

**Live at [billcheck.general.legal](https://billcheck.general.legal).**

## How it works

The whole app is one static page (`index.html`) plus a few small serverless
functions:

1. **Parsing happens in your browser.** [pdf.js](https://mozilla.github.io/pdf.js/)
   extracts the invoice text on your device, a regex parser pulls out the dated
   time entries (hours, rate, amount, discounts), and a keyword classifier maps
   each line to the closest General Legal flat-fee service. By default nothing
   leaves your machine.
2. **The comparison is drawn to scale.** Your invoice total vs the flat-fee
   total for the same deliverables, plus a line-by-line view flagging things
   like block billing and internally billed time. Emails, calls, and filings
   are matched at $0 — they're bundled into the flat fee.
3. **AI analysis is opt-in.** If you check "Analyze with AI", the extracted
   invoice text (not the file, with the letterhead and obvious identifiers
   stripped) is sent to `api/analyze.js`, which asks Claude for a sharper
   read. The API key lives only on the server. If the backend is missing or
   errors, the page falls back to the local parser.
4. **Email is optional.** Results show without one. If you leave an email on
   the results page, it's stored (with consent) via `api/lead.js`, and every
   outbound email carries a signed unsubscribe link (`api/unsubscribe.js`).

## Privacy

- Bills are read in your browser; the PDF is never uploaded.
- The AI option sends only redacted invoice text, used to generate the result
  and not stored by us.
- See the full [privacy policy](https://billcheck.general.legal/privacy.html).

## Run it locally

```
npm install
vercel dev        # serves the page + /api functions on localhost:3000
```

Opening `index.html` directly also works — the AI checkbox just falls back to
the local parser. See [DEPLOY.md](DEPLOY.md) for environment variables
(Anthropic key, lead storage, unsubscribe signing) and deployment details.

## Testing

`node harness.js` runs the real parser/classifier from `index.html` against a
set of sample invoice PDFs and checks item counts, totals, and matter
detection. (The sample PDFs are real invoices and are not committed; point
`DL` in `harness.js` at your own.)

## Disclaimers

This tool is an illustrative cost comparison and general information only. It
is not legal advice, it is not a binding quote, and using it does not create
an attorney-client relationship. Attorney advertising.

## License

[MIT](LICENSE)
