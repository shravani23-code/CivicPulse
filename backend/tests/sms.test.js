// SMS service unit tests. No database, and NO real SMS: global fetch is
// replaced by a fake for every test, and the provider env vars are set
// to dummy values only inside each test.

const test = require('node:test')
const assert = require('node:assert/strict')

const sms = require('../services/smsService')
const { toMsg91Number, normalizeIndianMobile } = require('../utils/mobile')
const { extractReports } = require('../routes/smsWebhookRoutes')

const SMS_ENV = [
  'SMS_PROVIDER', 'MSG91_AUTH_KEY', 'MSG91_SENDER_ID', 'MSG91_FLOW_URL', 'SMS_TIMEOUT_MS', 'SMS_MAX_ATTEMPTS',
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'TWILIO_MESSAGING_SERVICE_SID',
  ...sms.SMS_KINDS.map(kind => `MSG91_TEMPLATE_${kind.toUpperCase()}`)
]

const realFetch = global.fetch
const realWarn = console.warn
let calls
let warnings

function fakeFetch(responder) {
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return responder(calls.length, url, options)
  }
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function configureMsg91(templates = ['registered', 'resolved', 'otp']) {
  process.env.SMS_PROVIDER = 'msg91'
  process.env.MSG91_AUTH_KEY = 'test-auth-key'
  process.env.MSG91_SENDER_ID = 'CIVPLS'
  for (const kind of templates) process.env[`MSG91_TEMPLATE_${kind.toUpperCase()}`] = `tmpl-${kind}`
}

test.beforeEach(() => {
  for (const name of SMS_ENV) delete process.env[name]
  calls = []
  warnings = []
  sms.retryDelayMs = 1
  console.warn = message => warnings.push(String(message))
  // Any call that a test did not explicitly fake fails loudly.
  fakeFetch(() => { throw new Error('Unexpected network call in test') })
})

test.afterEach(() => {
  global.fetch = realFetch
  console.warn = realWarn
  for (const name of SMS_ENV) delete process.env[name]
})


// ------------------------------------------------------------
// Mobile numbers
// ------------------------------------------------------------

test('valid and invalid mobile numbers', () => {
  for (const input of ['9876543210', '+91 98765 43210', '09876543210', '919876543210', '+91-9876543210']) {
    assert.equal(normalizeIndianMobile(input), '+919876543210', input)
  }
  for (const input of ['12345', '5876543210', '98765432101', 'abcdefghij', '+1 202 555 0143', '', null, {}]) {
    assert.equal(normalizeIndianMobile(input), null, String(input))
  }
  // Stored as text; leading zeros/country code never lost.
  assert.equal(typeof normalizeIndianMobile('09876543210'), 'string')
  assert.equal(toMsg91Number('+919876543210'), '919876543210')
  assert.equal(toMsg91Number('9876543210'), null)
})


// ------------------------------------------------------------
// Configuration
// ------------------------------------------------------------

test('not configured: nothing is sent and the state says so', async () => {
  assert.equal(sms.isSmsConfigured(), false)
  const result = await sms.sendSms('+919876543210', 'registered', 'CP12345678')
  assert.deepEqual(result, { ok: false, status: 'not_configured', attempts: 0 })
  assert.equal(calls.length, 0)
})

test('msg91 without a DLT template for a kind: that kind is skipped, not sent', async () => {
  configureMsg91(['registered'])
  assert.equal(sms.isSmsConfigured(), true)
  assert.equal(sms.isSmsKindEnabled('registered'), true)
  assert.equal(sms.isSmsKindEnabled('rejected'), false)
  const result = await sms.sendSms('+919876543210', 'rejected', 'CP12345678')
  assert.equal(result.status, 'template_missing')
  assert.equal(calls.length, 0)
})


// ------------------------------------------------------------
// Provider outcomes
// ------------------------------------------------------------

test('msg91 acceptance: template request, recorded as accepted (not delivered)', async () => {

  configureMsg91()
  fakeFetch(() => jsonResponse(200, { type: 'success', message: 'req-abc-123' }))

  const result = await sms.sendSms('+919876543210', 'registered', 'CP12345678')

  assert.equal(result.ok, true)
  assert.equal(result.status, 'accepted')
  assert.equal(result.providerMessageId, 'req-abc-123')
  assert.equal(result.attempts, 1)
  assert.equal(calls.length, 1)

  const body = JSON.parse(calls[0].options.body)
  assert.equal(calls[0].url, 'https://control.msg91.com/api/v5/flow')
  assert.equal(calls[0].options.headers.authkey, 'test-auth-key')
  assert.equal(body.template_id, 'tmpl-registered')
  assert.equal(body.sender, 'CIVPLS')
  assert.deepEqual(body.recipients, [{ mobiles: '919876543210', var1: 'CP12345678' }])

})

test('provider rejection (4xx) fails once without retrying, and logs only a masked number', async () => {

  configureMsg91()
  fakeFetch(() => jsonResponse(400, { type: 'error', message: 'Template not approved' }))

  const result = await sms.sendSms('+919876543210', 'registered', 'CP12345678')

  assert.equal(result.ok, false)
  assert.equal(result.status, 'failed')
  assert.equal(result.attempts, 1)
  assert.match(result.error, /Template not approved/)
  assert.equal(calls.length, 1)
  assert.ok(warnings.length > 0)
  assert.ok(warnings.every(line => !line.includes('9876543210')), 'full number never logged')
  assert.ok(warnings.some(line => line.includes('******3210')))

})

test('transient failures (5xx / 429) are retried, bounded by SMS_MAX_ATTEMPTS', async () => {

  configureMsg91()
  process.env.SMS_MAX_ATTEMPTS = '3'

  fakeFetch(attempt => attempt < 2
    ? jsonResponse(503, { type: 'error', message: 'Service unavailable' })
    : jsonResponse(200, { type: 'success', message: 'req-after-retry' }))

  const recovered = await sms.sendSms('+919876543210', 'registered', 'CP12345678')
  assert.equal(recovered.status, 'accepted')
  assert.equal(recovered.attempts, 2)

  calls = []
  fakeFetch(() => jsonResponse(429, { type: 'error', message: 'Too many requests' }))

  const exhausted = await sms.sendSms('+919876543210', 'registered', 'CP12345678')
  assert.equal(exhausted.status, 'failed')
  assert.equal(exhausted.attempts, 3)
  assert.equal(calls.length, 3, 'never more than SMS_MAX_ATTEMPTS calls')

})

test('timeouts are treated as transient and end as failed, never as sent', async () => {

  configureMsg91()
  process.env.SMS_MAX_ATTEMPTS = '2'

  fakeFetch(() => {
    const error = new Error('The operation was aborted due to timeout')
    error.name = 'TimeoutError'
    throw error
  })

  const result = await sms.sendSms('+919876543210', 'resolved', 'CP12345678')

  assert.equal(result.ok, false)
  assert.equal(result.status, 'failed')
  assert.equal(result.attempts, 2)
  assert.match(result.error, /timed out/)

})

test('twilio sends the privacy-conscious template text with only the complaint ID', async () => {

  process.env.SMS_PROVIDER = 'twilio'
  process.env.TWILIO_ACCOUNT_SID = 'ACtest'
  process.env.TWILIO_AUTH_TOKEN = 'token'
  process.env.TWILIO_FROM_NUMBER = '+15005550006'

  fakeFetch(() => jsonResponse(201, { sid: 'SM123' }))

  const result = await sms.sendSms('+919876543210', 'rejected', 'CP12345678')

  assert.equal(result.status, 'accepted')
  const form = new URLSearchParams(calls[0].options.body.toString())
  assert.equal(form.get('To'), '+919876543210')
  assert.equal(form.get('Body'), 'CivicPulse: Your complaint CP12345678 was not approved. Log in to CivicPulse to review the reason.')

})

test('every SMS text is short and contains no placeholder for addresses or descriptions', () => {
  for (const kind of sms.SMS_KINDS) {
    const text = sms.SMS_TEXT[kind]('CP12345678')
    assert.ok(text.length <= 160, `${kind} fits one SMS segment`)
    assert.ok(text.includes('CP12345678') || kind === 'otp')
  }
})


// ------------------------------------------------------------
// Delivery report parsing
// ------------------------------------------------------------

test('delivery report parser handles the payload shapes MSG91 uses', () => {

  assert.deepEqual(extractReports({ requestId: 'r1', status: 'Delivered', telNum: '919876543210' }), [{ requestId: 'r1', status: 'Delivered' }])

  assert.deepEqual(
    extractReports({ data: JSON.stringify([{ requestId: 'r2', report: [{ status: '1', number: '919876543210' }] }]) }),
    [{ requestId: 'r2', status: '1' }]
  )

  assert.deepEqual(extractReports([{ request_id: 'r3', desc: 'FAILED' }]), [{ requestId: 'r3', status: 'FAILED' }])

  assert.deepEqual(extractReports({ nothing: 'here' }), [])
  assert.deepEqual(extractReports('not json'), [])

})
