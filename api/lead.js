// Vercel serverless function: POST /api/lead
// Captures a consented marketing lead (email entered by the user at the upload
// step). Reuses the same abuse guard as the other endpoints.
//
// STUB STORAGE: this only writes the lead to the function logs, which are
// ephemeral on Vercel. Before relying on this to actually collect leads,
// connect a real destination (CRM such as HubSpot/Salesforce, an ESP such as
// Mailchimp, or a database).
const { guard } = require("../lib/guard");

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

  const email = String(body.email || "").trim().slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "invalid_email" });
    return;
  }

  const lead = {
    email,
    consent: body.consent === true,
    source: "billcheck",
    ts: new Date().toISOString(),
  };

  // Stub: logged only. Replace with a write to your CRM/ESP/database.
  console.log("LEAD_CAPTURE " + JSON.stringify(lead));

  res.status(200).json({ ok: true });
};
