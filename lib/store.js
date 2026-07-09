// Durable lead storage + suppression list, backed by a Redis REST database
// (Upstash directly, or Vercel's KV/Upstash marketplace integration, which
// sets the same REST credentials under the KV_REST_API_* names).
//
// This replaces the old lead.js behavior of only writing to console.log,
// which lives in ephemeral function logs and gives no way to record or honor
// an unsubscribe before a mass campaign.
const { Redis } = require("@upstash/redis");

const URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const redis = URL && TOKEN ? new Redis({ url: URL, token: TOKEN }) : null;

const LEADS_KEY = "billcheck:leads";           // hash: email -> JSON lead record
const SUPPRESSED_KEY = "billcheck:suppressed"; // set: emails that opted out

function configured() {
  return !!redis;
}

async function isSuppressed(email) {
  return (await redis.sismember(SUPPRESSED_KEY, email)) === 1;
}

// Suppress permanently and drop any stored lead record, so a re-export can
// never include this address again.
async function suppress(email) {
  await redis.sadd(SUPPRESSED_KEY, email);
  await redis.hdel(LEADS_KEY, email);
}

function parseRecord(raw) {
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

// Upsert keyed by email so re-submitting (e.g. running a second bill) updates
// last_seen instead of creating a duplicate lead.
async function upsertLead({ email, consent, source, ip }) {
  const now = new Date().toISOString();
  const existingRaw = await redis.hget(LEADS_KEY, email);
  const existing = existingRaw ? parseRecord(existingRaw) : null;
  const record = {
    email,
    consent: !!consent,
    source: source || "billcheck",
    ip: ip || (existing && existing.ip) || "",
    first_seen: (existing && existing.first_seen) || now,
    last_seen: now,
  };
  await redis.hset(LEADS_KEY, { [email]: JSON.stringify(record) });
  return record;
}

// All leads minus anyone who has since unsubscribed. This is what any export
// to a CRM/ESP should read from, never the raw hash, so a suppressed address
// can never end up back in a campaign.
async function listActiveLeads() {
  const all = (await redis.hgetall(LEADS_KEY)) || {};
  const suppressed = new Set((await redis.smembers(SUPPRESSED_KEY)) || []);
  return Object.values(all)
    .map(parseRecord)
    .filter(lead => !suppressed.has(lead.email));
}

module.exports = { configured, isSuppressed, suppress, upsertLead, listActiveLeads };
