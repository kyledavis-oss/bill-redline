// Vercel serverless function: POST /api/lead
// Captures a consented marketing lead (email entered by the user at the
// upload step) into durable storage, and does not (re)record anyone who has
// already unsubscribed. Reuses the same abuse guard as the other endpoints.
//
// Storage is a Redis REST database; see lib/store.js. Configure
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (or the Vercel KV
// equivalents) before relying on this in production, or leads are rejected
// with a clear error instead of silently going nowhere.
const { guard } = require("../lib/guard");
const store = require("../lib/store");

function clientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (xf) return String(xf).split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "";
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  if (!guard(req, res)) return;
  if (!store.configured()) {
    res.status(500).json({
      error: "storage_not_configured",
      detail: "Set UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL/KV_REST_API_TOKEN) in the environment.",
    });
    return;
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  } catch (_) {
    res.status(400).json({ error: "bad_json" });
    return;
  }

  const email = String(body.email || "").trim().toLowerCase().slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "invalid_email" });
    return;
  }

  try {
    if (await store.isSuppressed(email)) {
      // Still let them use the tool; just don't re-add them as a lead.
      res.status(200).json({ ok: true, suppressed: true });
      return;
    }
    await store.upsertLead({ email, consent: body.consent === true, source: "billcheck", ip: clientIp(req) });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "lead_store_failed", detail: String((e && e.message) || e) });
  }
};
