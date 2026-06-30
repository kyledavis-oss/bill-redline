// Vercel serverless function: POST /api/analyze
// Takes extracted legal-bill text, returns a structured redline via Claude.
// The ANTHROPIC_API_KEY lives only here (server side) and is never shipped to the browser.
const Anthropic = require("@anthropic-ai/sdk");
const { guard } = require("../lib/guard");

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

// General Legal flat-fee schedule (from general.legal/pricing). Keep these keys
// in sync with SERVICES in index.html so the browser can render the result.
const SERVICES = [
  ["review_short", "Contract review, short (3 pages or fewer)", 250],
  ["review_std",   "Contract review, standard (3 to 25 pages)", 500],
  ["review_neg",   "Contract review plus negotiation (unlimited turns)", 1000],
  ["review_long",  "Long or non-standard contract (25+ pages)", 1000],
  ["draft_small",  "Smaller drafting project", 1500],
  ["draft_found",  "Foundational document drafting (ToS, Privacy, MSA, DPA, BAA)", 2000],
  ["research",     "Basic research memo", 1000],
  ["playbook",     "Playbook development", 1500],
  ["nda",          "NDA, confidentiality, or IP assignment", 250],
  ["offer",        "Offer letter", 250],
  ["safe",         "SAFE (draft)", 250],
  ["advisor",      "Advisor agreement (draft)", 250],
  ["side_letter",  "Side letter (draft)", 500],
  ["ic",           "Independent contractor agreement (draft)", 500],
  ["separation",   "Separation or termination package", 500],
  ["exec_emp",     "Executive employment agreement", 1500],
  ["handbook",     "Employee handbook", 2500],
  ["other_doc",    "Other agreement (MOU, LOI, referral)", 1000],
  ["bundled",      "Included free in the flat fee (email, call, filing, internal)", 0],
  ["other",        "Other or uncategorized", 250],
  ["discount",     "Credit or discount on their bill", 0],
];
const SERVICE_KEYS = SERVICES.map(s => s[0]);
const SCHEDULE_TEXT = SERVICES
  .filter(s => !["bundled", "other", "discount"].includes(s[0]))
  .map(s => `- ${s[0]}: ${s[1]} = $${s[2]}`)
  .join("\n");

const SYSTEM = `You analyze a law firm's invoice and re-price it against General Legal's flat-fee schedule, in the voice of a tool that helps clients "call BS" on overbilling.

GENERAL LEGAL FLAT-FEE SCHEDULE (the only prices you may assign):
${SCHEDULE_TEXT}
Plus two non-billable categories: "bundled" ($0, for email/call/filing/internal/correspondence/admin time, which General Legal includes free) and "other" ($250, last resort).

YOUR JOB:
1. Extract every time-entry line item from the bill: description, professional name if present, hours, hourly rate, and the line amount. Ignore prior-balance / "outstanding invoice" / statement-of-account rows that list OTHER invoices, and ignore subtotal/total/professional-summary rollup rows. Capture a "No Charge" entry with amount 0. Capture a courtesy discount or credit as its own line with a NEGATIVE amount and gl_service "discount".
2. Assign each line the single CHEAPEST defensible gl_service key. This tool exists to show how much less General Legal would have cost, so always resolve ambiguity DOWNWARD in price. Specific rules:
   - Any review, analysis, research, examination, summarizing, or "looking into" work defaults to review_short ($250). Use the $1000 research memo ONLY when the entry is explicitly and solely the production of a standalone research memorandum.
   - When a specific low-cost document is named (NDA, offer letter, SAFE, advisor agreement), use that $250 service even if the verb is "draft".
   - Use draft_small ($1500) and any higher tier ONLY when the line unambiguously requires drafting a substantial new document and no cheaper category honestly fits.
   - Email, calls, telephone, filing, scheduling, internal discussion, conferring, and correspondence are always "bundled" ($0).
   - Whenever two services are both defensible, pick the cheaper one. When genuinely uncertain, go cheaper.
   - Prefer assigning a line to a gl_service that is ALREADY used elsewhere in this same bill rather than introducing a new, pricier distinct deliverable, whenever that is defensible. Because the General Legal total is one flat fee per DISTINCT service, fewer distinct services means a lower total, so keep the set of distinct billable services as small as is honestly defensible.
   The goal is the lowest General Legal total you can justify with a straight face, never an inflated one.
3. For each line, list any bs_flags that apply (short phrases): a BigLaw hourly rate ($450+/hr), a top-of-market rate ($900+/hr), block billing (multiple tasks lumped in one entry), a large single entry (5+ hours), a vague entry, or internal firm time billed to the client.
4. Compute the General Legal total as ONE flat fee per DISTINCT gl_service present (deduped across the matter), excluding "bundled" and "discount". their_total is the sum of every line amount including negative discounts.
5. Write a short (2-4 sentence) plain-English narrative of what stands out, no em dashes.

Return ONLY the structured object.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    matter: { type: "string", description: "Matter name/number if present, else empty string" },
    line_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          description: { type: "string" },
          professional: { type: "string", description: "Name and/or title, or empty string" },
          hours: { type: "number" },
          rate: { type: "number" },
          amount: { type: "number", description: "Line total; negative for a credit/discount" },
          gl_service: { type: "string", enum: SERVICE_KEYS },
          bs_flags: { type: "array", items: { type: "string" } },
          reasoning: { type: "string", description: "One short sentence on the classification" },
        },
        required: ["description", "professional", "hours", "rate", "amount", "gl_service", "bs_flags", "reasoning"],
      },
    },
    their_total: { type: "number" },
    gl_total: { type: "number" },
    narrative: { type: "string" },
  },
  required: ["matter", "line_items", "their_total", "gl_total", "narrative"],
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  if (!guard(req, res)) return;
  let text = "";
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    text = String(body.text || "");
  } catch (_) {
    res.status(400).json({ error: "bad_json" });
    return;
  }
  if (text.trim().length < 20) {
    res.status(400).json({ error: "no_bill_text" });
    return;
  }
  if (text.length > 120000) {
    res.status(413).json({ error: "too_large" });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: "missing_api_key", detail: "Set ANTHROPIC_API_KEY in the environment." });
    return;
  }

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 8000,
      // The system prompt + schedule are identical on every request, so cache them.
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: `Analyze this legal bill and re-price it.\n\n<bill>\n${text}\n</bill>`,
        },
      ],
    });

    const block = response.content.find(b => b.type === "text");
    if (!block) {
      res.status(502).json({ error: "no_output" });
      return;
    }
    const data = JSON.parse(block.text);
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: "analysis_failed", detail: String((e && e.message) || e) });
  }
};
