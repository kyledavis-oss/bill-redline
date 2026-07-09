// Signs and verifies unsubscribe links so an email address can only be
// suppressed via a link this server generated, not by anyone who guesses or
// scrapes an address.
const crypto = require("crypto");

function secret() {
  return process.env.UNSUBSCRIBE_SECRET || "";
}

function configured() {
  return !!secret();
}

function sign(email) {
  return crypto.createHmac("sha256", secret()).update(String(email).toLowerCase()).digest("hex");
}

function verify(email, sig) {
  if (!configured() || !sig) return false;
  const expected = Buffer.from(sign(email));
  const given = Buffer.from(String(sig));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

module.exports = { sign, verify, configured };
