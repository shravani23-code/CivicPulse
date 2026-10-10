// Minimal fixed-window rate limiter (no extra dependency).
//
// Buckets live in an in-process Map keyed by "<name>:<user id or IP>",
// giving O(1) lookup per request. On a single Render instance this is
// exact; with several instances each one enforces its own window, which
// is still a meaningful brake. Expired buckets are swept periodically so
// the Map cannot grow without bound.

const buckets = new Map()

const SWEEP_INTERVAL_MS = 5 * 60 * 1000

const sweeper = setInterval(() => {

  const now = Date.now()

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }

}, SWEEP_INTERVAL_MS)

// Never keep the process alive just for the sweeper.
if (sweeper.unref) sweeper.unref()

function rateLimit({ name, windowMs, max, message }) {

  return function (req, res, next) {

    const who = req.user && req.user.id ? `u:${req.user.id}` : `ip:${req.ip}`
    const key = `${name}:${who}`
    const now = Date.now()

    let bucket = buckets.get(key)

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(key, bucket)
    }

    bucket.count += 1

    if (bucket.count > max) {

      const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000)

      res.set('Retry-After', String(retryAfterSeconds))

      return res.status(429).json({
        message: message || 'Too many requests. Please try again later.',
        retryAfterSeconds
      })

    }

    next()

  }

}

// Test helper — clears all buckets.
function resetRateLimits() {
  buckets.clear()
}

module.exports = { rateLimit, resetRateLimits }
