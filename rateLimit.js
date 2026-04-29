// In-memory token-bucket rate limiter, keyed by origin or IP.
//
// Each bucket holds at most CAPACITY tokens; one token is consumed per
// request. Tokens refill at REFILL_PER_MIN per minute. When the bucket is
// empty, the request returns 429.
//
// We deliberately avoid Redis / external state — this is a single-instance
// Render service. If we ever scale out, swap this out for redis-rate-limit.
//
// Defense in depth, not anti-DDoS — Render's edge already absorbs gross
// abuse. This is to keep accidental tight loops from a misbehaving client
// from chewing the free tier's quotas.

const CAPACITY        = 60   // tokens
const REFILL_PER_MIN  = 60   // 1 per second sustained
const SWEEP_INTERVAL  = 5 * 60 * 1000  // GC stale buckets every 5 min

const buckets = new Map() // key → { tokens, lastRefill }

function take(key) {
  const now = Date.now()
  let b = buckets.get(key)
  if (!b) {
    b = { tokens: CAPACITY, lastRefill: now }
    buckets.set(key, b)
  } else {
    const elapsedMs = now - b.lastRefill
    const refilled  = (elapsedMs / 60000) * REFILL_PER_MIN
    b.tokens     = Math.min(CAPACITY, b.tokens + refilled)
    b.lastRefill = now
  }
  if (b.tokens >= 1) {
    b.tokens -= 1
    return { ok: true, remaining: Math.floor(b.tokens) }
  }
  // Time until at least 1 token refills
  const waitSec = Math.ceil((1 - b.tokens) * (60 / REFILL_PER_MIN))
  return { ok: false, retryAfter: waitSec }
}

// Periodically drop buckets that are full + idle so memory doesn't grow
// linearly with unique origins.
setInterval(() => {
  const now = Date.now()
  for (const [k, b] of buckets) {
    if (b.tokens >= CAPACITY && now - b.lastRefill > SWEEP_INTERVAL) {
      buckets.delete(k)
    }
  }
}, SWEEP_INTERVAL).unref?.()

export function rateLimit(req, res, next) {
  // Prefer the X-Forwarded-For header that Render injects; fall back to
  // origin so localhost dev still gets per-tab buckets.
  const key =
    (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) ||
    req.headers.origin ||
    req.socket.remoteAddress ||
    'unknown'

  const result = take(key)
  res.setHeader('X-RateLimit-Limit',     CAPACITY)
  res.setHeader('X-RateLimit-Remaining', result.remaining ?? 0)
  if (!result.ok) {
    res.setHeader('Retry-After', result.retryAfter)
    return res.status(429).json({
      error:      'too many requests',
      retryAfter: result.retryAfter,
      hint:       `Up to ${REFILL_PER_MIN} requests per minute. Wait ${result.retryAfter}s.`,
    })
  }
  next()
}
