// ======================================
// CORS ORIGIN POLICY
// ======================================
//
// An origin is allowed when it is:
//
// 1. One of the built-in origins below (production frontend and
//    local Vite dev servers).
//
// 2. Listed in FRONTEND_ORIGIN — a single origin or a comma-separated
//    list, e.g. a custom domain. Compared exactly, after trimming and
//    dropping a trailing slash.
//
// 3. A Vercel deployment of THIS project. Vercel names them
//      civic-pulse-<hash>-shravani23-code.vercel.app        (each deploy)
//      civic-pulse-git-<branch>-shravani23-code.vercel.app  (each branch)
//    so the pattern is anchored to both the project name and the team
//    slug, over https only. Set CORS_ALLOW_VERCEL_PREVIEWS=false to turn
//    this off and rely on the explicit list alone.
//
// Why the preview pattern is acceptable here: CivicPulse authenticates
// with a Bearer token kept in the frontend's own localStorage, not with
// cookies. Another origin cannot read that token, so even a look-alike
// origin passing CORS can only make the same unauthenticated requests
// curl already can.

const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5175',
  'https://civic-pulse-murex-omega.vercel.app'
]

const VERCEL_PREVIEW_PATTERN =
  /^https:\/\/civic-pulse-[a-z0-9]+(?:-[a-z0-9]+)*-shravani23-code\.vercel\.app$/

function normalizeOrigin(origin) {
  return String(origin).trim().replace(/\/+$/, '').toLowerCase()
}

function getAllowedOrigins() {

  const configured = (process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean)

  return new Set([...DEFAULT_ORIGINS, ...configured])

}

function isAllowedOrigin(origin) {

  if (typeof origin !== 'string' || !origin) return false

  const normalized = normalizeOrigin(origin)

  if (getAllowedOrigins().has(normalized)) return true

  const previewsAllowed = (process.env.CORS_ALLOW_VERCEL_PREVIEWS || 'true').toLowerCase() !== 'false'

  return previewsAllowed && VERCEL_PREVIEW_PATTERN.test(normalized)

}

module.exports = { isAllowedOrigin, VERCEL_PREVIEW_PATTERN }
