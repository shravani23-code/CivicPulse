// CORS policy, health check, and authorization gates that reject a
// request before any database access. No database connection is made.

const test = require('node:test')
const assert = require('node:assert/strict')
const jwt = require('jsonwebtoken')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret'

const app = require('../server')
const { isAllowedOrigin } = require('../config/cors')
const { normalizeIndianMobile, maskMobile } = require('../utils/mobile')
const { moderateComplaint } = require('../services/moderationEngine')

const PRODUCTION = 'https://civic-pulse-murex-omega.vercel.app'
const PREVIEW = 'https://civic-pulse-59qgk2qx6-shravani23-code.vercel.app'
const BRANCH_PREVIEW = 'https://civic-pulse-git-feature-moderation-notifications-shravani23-code.vercel.app'

let server
let baseUrl

test.before(async () => {
  server = app.listen(0)
  await new Promise(resolve => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

test.after(() => new Promise(resolve => server.close(resolve)))


// ------------------------------------------------------------
// Origin policy
// ------------------------------------------------------------

test('allowed origins: production, local dev, and this project\'s Vercel previews', () => {
  assert.equal(isAllowedOrigin(PRODUCTION), true)
  assert.equal(isAllowedOrigin(PRODUCTION + '/'), true)
  assert.equal(isAllowedOrigin('http://localhost:5173'), true)
  assert.equal(isAllowedOrigin(PREVIEW), true)
  assert.equal(isAllowedOrigin(BRANCH_PREVIEW), true)
})

test('rejected origins: other projects, other teams, http, look-alike hosts', () => {
  for (const origin of [
    'https://evil.example.com',
    'https://civic-pulse-abc123-someone-else.vercel.app',
    'https://other-app-abc123-shravani23-code.vercel.app',
    'http://civic-pulse-59qgk2qx6-shravani23-code.vercel.app',
    'https://civic-pulse-59qgk2qx6-shravani23-code.vercel.app.evil.com',
    'https://civic-pulse-59qgk2qx6-shravani23-code.vercel.app:8443',
    'https://xcivic-pulse-59qgk2qx6-shravani23-code.vercel.app',
    '',
    null
  ]) {
    assert.equal(isAllowedOrigin(origin), false, String(origin))
  }
})

test('FRONTEND_ORIGIN adds extra exact origins; previews can be switched off', () => {

  const saved = { ...process.env }

  try {
    process.env.FRONTEND_ORIGIN = 'https://civicpulse.example.org, https://other.example.org/'
    assert.equal(isAllowedOrigin('https://civicpulse.example.org'), true)
    assert.equal(isAllowedOrigin('https://other.example.org'), true)

    process.env.CORS_ALLOW_VERCEL_PREVIEWS = 'false'
    assert.equal(isAllowedOrigin(PREVIEW), false)
    assert.equal(isAllowedOrigin(PRODUCTION), true)
  } finally {
    process.env.FRONTEND_ORIGIN = saved.FRONTEND_ORIGIN
    process.env.CORS_ALLOW_VERCEL_PREVIEWS = saved.CORS_ALLOW_VERCEL_PREVIEWS
    if (saved.FRONTEND_ORIGIN === undefined) delete process.env.FRONTEND_ORIGIN
    if (saved.CORS_ALLOW_VERCEL_PREVIEWS === undefined) delete process.env.CORS_ALLOW_VERCEL_PREVIEWS
  }

})


// ------------------------------------------------------------
// CORS over HTTP
// ------------------------------------------------------------

async function preflight(origin) {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,authorization'
    }
  })
}

test('preflight from production and preview origins succeeds with credentials', async () => {

  for (const origin of [PRODUCTION, PREVIEW]) {

    const response = await preflight(origin)

    assert.equal(response.status, 204, origin)
    assert.equal(response.headers.get('access-control-allow-origin'), origin)
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true')
    assert.match(response.headers.get('access-control-allow-methods'), /POST/)

  }

})

test('preflight from an unknown origin gets no CORS headers and no error status', async () => {

  const response = await preflight('https://evil.example.com')

  assert.ok(response.status < 400, `status ${response.status}`)
  assert.equal(response.headers.get('access-control-allow-origin'), null)

})

test('never answers with a wildcard origin', async () => {
  const response = await fetch(`${baseUrl}/`, { headers: { Origin: PREVIEW } })
  assert.equal(response.headers.get('access-control-allow-origin'), PREVIEW)
})


// ------------------------------------------------------------
// Health + error handling
// ------------------------------------------------------------

test('health endpoint reports database state without secrets', async () => {

  const response = await fetch(`${baseUrl}/api/health`)
  const body = await response.json()

  // No database in this test process
  assert.equal(response.status, 503)
  assert.deepEqual(Object.keys(body).sort(), ['database', 'status', 'uptimeSeconds'])
  assert.equal(body.database, 'disconnected')

})

test('malformed JSON body is a 400, not a 500', async () => {

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"email": '
  })

  assert.equal(response.status, 400)
  assert.equal((await response.json()).message, 'Request body is not valid JSON.')

})


// ------------------------------------------------------------
// Authorization gates (rejected before any DB access)
// ------------------------------------------------------------

function tokenFor(role) {
  return jwt.sign({ id: '64b000000000000000000001', name: 'T', email: 't@example.com', role }, process.env.JWT_SECRET)
}

test('protected endpoints require a token', async () => {
  for (const path of ['/api/complaints', '/api/complaints/priority', '/api/moderation/complaints', '/api/notifications']) {
    const response = await fetch(baseUrl + path)
    assert.equal(response.status, 401, path)
  }
})

test('expired or forged tokens are rejected with 401', async () => {

  const expired = jwt.sign({ id: 'x', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: -10 })
  const forged = jwt.sign({ id: 'x', role: 'admin' }, 'wrong-secret')

  for (const token of [expired, forged]) {
    const response = await fetch(`${baseUrl}/api/moderation/complaints`, { headers: { Authorization: `Bearer ${token}` } })
    assert.equal(response.status, 401)
  }

})

test('citizens cannot use admin-only endpoints', async () => {

  const headers = { Authorization: `Bearer ${tokenFor('citizen')}`, 'Content-Type': 'application/json' }

  const checks = [
    ['GET', '/api/complaints'],
    ['GET', '/api/complaints/priority'],
    ['GET', '/api/complaints/queue'],
    ['PUT', '/api/complaints/CP12345678/status'],
    ['GET', '/api/moderation/complaints'],
    ['POST', '/api/moderation/complaints/CP12345678/approve'],
    ['POST', '/api/moderation/complaints/CP12345678/reject']
  ]

  for (const [method, path] of checks) {
    const response = await fetch(baseUrl + path, { method, headers, body: method === 'GET' ? undefined : '{}' })
    assert.equal(response.status, 403, `${method} ${path}`)
  }

})

test('admins cannot submit complaints as citizens', async () => {
  const response = await fetch(`${baseUrl}/api/complaints`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenFor('admin')}` }
  })
  assert.equal(response.status, 403)
})

test('registration and login reject non-string fields with 400', async () => {

  const bad = [
    ['/api/auth/register', { name: 'A', email: { $gt: '' }, password: 'secret1' }],
    ['/api/auth/register', { name: ['A'], email: 'a@example.com', password: 'secret1' }],
    ['/api/auth/register', { name: 'A', email: 'a@example.com', password: 'secret1', mobile: 9876543210 }],
    ['/api/auth/register', { name: 'A', email: 'a@example.com', password: 'secret1', mobile: '12345' }],
    ['/api/auth/register', { name: 'A', email: 'a@example.com', password: 'secret1', mobile: 'call me' }],
    ['/api/auth/login', { email: { $ne: null }, password: 'x', role: 'citizen' }]
  ]

  for (const [path, body] of bad) {
    const response = await fetch(baseUrl + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    assert.equal(response.status, 400, `${path} ${JSON.stringify(body)}`)
  }

})


// ------------------------------------------------------------
// Mobile number helpers
// ------------------------------------------------------------

test('mobile numbers are normalized to +91XXXXXXXXXX strings', () => {
  assert.equal(normalizeIndianMobile('9876543210'), '+919876543210')
  assert.equal(normalizeIndianMobile(' 98765 43210 '), '+919876543210')
  assert.equal(normalizeIndianMobile('+91-98765-43210'), '+919876543210')
  assert.equal(normalizeIndianMobile('09876543210'), '+919876543210')
  assert.equal(normalizeIndianMobile('919876543210'), '+919876543210')
  assert.equal(normalizeIndianMobile('+91 (600) 000-0000'), '+916000000000')
})

test('invalid mobile numbers are rejected', () => {
  for (const value of ['', '12345', '5876543210', '98765432101', 'ninety', '98765abc10', '+1 415 555 0100', null, undefined, {}]) {
    assert.equal(normalizeIndianMobile(value), null, String(value))
  }
})

test('masked mobile shows only the last four digits', () => {
  assert.equal(maskMobile('+919876543210'), '+91 ******3210')
  assert.equal(maskMobile(undefined), null)
})


// ------------------------------------------------------------
// Moderation engine smoke tests
// ------------------------------------------------------------

test('moderation: genuine civic complaint is approved', () => {
  const result = moderateComplaint({
    title: 'Pothole on main road',
    description: 'There is a large pothole near the bus stop causing accidents every day'
  })
  assert.equal(result.status, 'approved')
})

test('moderation: never rejects on its own — spam and ambiguous text go to admin review', () => {
  const spam = moderateComplaint({ title: 'Buy now', description: 'Click here for free money www.spam.xyz' })
  assert.equal(spam.status, 'needs_review')
  assert.ok(spam.flags.includes('promotional_content'))
  assert.equal(moderateComplaint({ title: 'asdfgh', description: 'qwrtyp zxcvbn' }).status, 'needs_review')
  assert.equal(moderateComplaint({ title: 'Garbage', description: 'Garbage everywhere, visit our site www.x.com' }).status, 'needs_review')
})
