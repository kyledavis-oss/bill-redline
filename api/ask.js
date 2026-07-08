// Vercel serverless function: POST /api/ask
// Streaming Q&A about the uploaded bill. Streams plain-text chunks back to the
// browser as Claude generates them. The API key stays server side.
const Anthropic = require("@anthropic-ai/sdk");
const { guard } = require("../lib/guard");

const client = new Anthropic();

const SCHEDULE = [
  "Contract review, short (<=3 pages): $250",
  "Contract review, standard (3-25 pages): $500",
  "Contract review + negotiation: $1000",
  "Smaller drafting project: $1500",
  "Foundational document drafting (ToS, Privacy, MSA, DPA, BAA): $2000",
  "Basic research memo: $1000",
  "NDA / confidentiality / IP assignment: $250",
  "Offer letter: $250",
  "SAFE (draft): $250",
  "Employee handbook: $2500",
  "Email, calls, filing, internal time: included free",
].join("\n");

const BASE_SYSTEM = `You are General Legal's pricing information assistant. Answer GENERAL questions about how legal work is priced: how flat fees work, what terms like "block billing" or "hourly rate" mean, and roughly how General Legal would price a given type of work using the flat-fee schedule below.

Follow these limits strictly:
- Provide general information only. Do not give legal advice or a definitive legal opinion, and do not guarantee any outcome.
- Do not advise the user on how to dispute, negotiate, challenge, or push back on their bill, their lawyer, or their law firm. If asked anything like that, briefly decline and suggest they speak with a licensed attorney (General Legal would be glad to help).
- Do not characterize any specific firm as overbilling, unethical, or wrong. Keep any comparison neutral and factual.
- You are not the user's lawyer, and this does not create an attorney-client relationship.

Style: concise and plain-spoken, two to five sentences. Do not use em dashes. When you compare prices, lean toward General Legal's lowest defensible flat fee.

GENERAL LEGAL FLAT-FEE SCHEDULE:
${SCHEDULE}`;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  if (!guard(req, res)) return;
  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  } catch (_) {
    res.status(400).json({ error: "bad_json" });
    return;
  }
  const billText = String(body.billText || "").slice(0, 120000);
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const messages = incoming
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20)
    .map(m => ({ role: m.role, content: m.content }));

  if (!messages.length) {
    res.status(400).json({ error: "no_messages" });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: "missing_api_key" });
    return;
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    const stream = client.messages.stream({
      model: "claude-opus-4-8",
      max_tokens: 1500,
      system: [
        { type: "text", text: BASE_SYSTEM },
        // The bill text repeats across every question in a session, so cache it.
        { type: "text", text: `The user's legal bill (extracted text):\n${billText || "(no bill text provided)"}`, cache_control: { type: "ephemeral" } },
      ],
      messages,
    });

    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") {
        res.write(ev.delta.text);
      }
    }
    res.end();
  } catch (e) {
    try { res.write("\n\n[Sorry, something went wrong: " + String((e && e.message) || e) + "]"); } catch (_) {}
    res.end();
  }
};
