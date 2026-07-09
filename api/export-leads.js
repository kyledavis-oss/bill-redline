// Vercel serverless function: GET /api/export-leads
// Admin-only export of active (non-suppressed) leads, each stamped with a
// signed, working unsubscribe link, so whatever tool sends the actual
// campaign (ESP, CRM import, mail merge) can drop the link straight into
// every message and this list stays the single source of truth for opt-outs.
//
// Protect this with a long random ADMIN_EXPORT_TOKEN; it returns email
// addresses and consent metadata, which is itself PII.
const store = require("../lib/store");
const { sign, configured: signConfigured } = require("../lib/sign");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const token = process.env.ADMIN_EXPORT_TOKEN;
  const auth = req.headers.authorization || "";
  if (!token || auth !== `Bearer ${token}`) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  if (!store.configured()) {
    res.status(500).json({ error: "storage_not_configured" });
    return;
  }
  if (!signConfigured()) {
    res.status(500).json({ error: "unsubscribe_secret_not_configured" });
    return;
  }

  try {
    const leads = await store.listActiveLeads();
    const base = `https://${req.headers.host}/api/unsubscribe`;
    const withLinks = leads.map(l => ({
      ...l,
      unsubscribe_url: `${base}?email=${encodeURIComponent(l.email)}&sig=${sign(l.email)}`,
    }));
    res.status(200).json({ count: withLinks.length, leads: withLinks });
  } catch (e) {
    res.status(500).json({ error: "export_failed", detail: String((e && e.message) || e) });
  }
};
