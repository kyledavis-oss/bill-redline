// Best-effort abuse protection for the public AI endpoints.
//
// Caveat: serverless instances do not share memory, so this rate limit applies
// PER WARM INSTANCE, not globally. It deters casual abuse and runaway loops but
// is not a hard global cap. The real spend backstop is your Anthropic account
// limit (Console -> Settings -> Limits). For a durable global limit, back this
// with Vercel KV / Upstash Redis.

const WINDOW_MS = 60 * 1000;   // 1 minute window
const MAX_PER_WINDOW = 20;     // max requests per IP per window
const hits = new Map();        // ip -> array of request timestamps

function clientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (xf) return String(xf).split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  // occasional cleanup so the map cannot grow without bound
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (!v.length || now - v[v.length - 1] > WINDOW_MS) hits.delete(k);
    }
  }
  return recent.length > MAX_PER_WINDOW;
}

// Allow same-origin browser requests (and non-browser clients that send no
// Origin). Reject requests whose Origin is a different host, which blocks other
// sites from calling your endpoint from a user's browser.
function sameOriginOk(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const host = req.headers.host;
    return !host || new URL(origin).host === host;
  } catch (_) {
    return false;
  }
}

// Returns true if the request may proceed. Otherwise writes the error response
// and returns false (the caller should just `return`).
function guard(req, res) {
  if (!sameOriginOk(req)) {
    res.status(403).json({ error: "forbidden_origin" });
    return false;
  }
  if (rateLimited(clientIp(req))) {
    res.setHeader("Retry-After", "60");
    res.status(429).json({ error: "rate_limited", detail: "Too many requests. Please wait a minute and try again." });
    return false;
  }
  return true;
}

module.exports = { guard };
