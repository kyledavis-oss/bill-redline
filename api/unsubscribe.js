// Vercel serverless function: GET/POST /api/unsubscribe?email=...&sig=...
// The link every marketing email must include (CAN-SPAM), and it also
// supports the one-click POST that mail providers send for a
// List-Unsubscribe=One-Click header (RFC 8058). The signature (see
// lib/sign.js) means only a link this server generated can suppress a given
// address, so a link can't be forged to unsubscribe someone else.
const store = require("../lib/store");
const { verify } = require("../lib/sign");

function page(message) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Unsubscribed | General Legal</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#f4f0ec;color:#211f1c;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:20px}
.box{max-width:440px;padding:32px;background:#fff;border-radius:16px;box-shadow:0 1px 2px rgba(33,31,28,.05),0 10px 30px rgba(33,31,28,.06);text-align:center}
h1{font-size:19px;margin:0 0 12px}
p{color:#6f6a62;font-size:14px;line-height:1.55;margin:0}
a{color:#8a6838}
</style></head>
<body><div class="box"><h1>General Legal</h1><p>${message}</p></div></body></html>`;
}

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const q = req.query || {};
  const email = String(q.email || "").trim().toLowerCase();
  const sig = String(q.sig || "");
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  if (!email || !verify(email, sig)) {
    res.status(400).send(page("This unsubscribe link is invalid or has expired. Email hello@general.legal and we will remove you by hand."));
    return;
  }
  if (!store.configured()) {
    res.status(500).send(page("We could not process this request right now. Email hello@general.legal and we will remove you by hand."));
    return;
  }

  try {
    await store.suppress(email);
    res.status(200).send(page(`${email} has been unsubscribed and will not receive further marketing email from General Legal.`));
  } catch (e) {
    res.status(500).send(page("We could not process this request right now. Email hello@general.legal and we will remove you by hand."));
  }
};
