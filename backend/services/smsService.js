// Optional SMS delivery, behind one small provider-neutral interface.
//
// Supported providers (choose with SMS_PROVIDER):
//
//   msg91  — recommended for India. Every message is sent through a
//            DLT-approved template (TRAI rules: registered entity, sender
//            header and content template), so each message kind needs
//            its own MSG91 template id. A kind without a template id is
//            simply not sent ('template_missing').
//              MSG91_AUTH_KEY, MSG91_SENDER_ID, MSG91_TEMPLATE_<KIND>
//
//   twilio — free-text body. (Sending to Indian numbers through Twilio
//            still requires DLT registration with Twilio.)
//              TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and
//              TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID
//
// SMS is entirely optional: when nothing is configured, isSmsConfigured()
// is false, nothing is sent, and callers record 'not_configured'.
//
// A successful API call only means the provider ACCEPTED the message for
// sending. It is recorded as 'accepted', never 'delivered' — delivery is
// only ever recorded from a provider delivery report (see
// routes/smsWebhookRoutes.js).
//
// sendSms never throws: an SMS failure must never break the request
// that triggered it.

const { maskMobile, toMsg91Number } = require('../utils/mobile')

const DEFAULT_TIMEOUT_MS = 8000
const DEFAULT_MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 1000

// Message kinds and their exact wording. For MSG91 each text must be
// registered as a DLT content template with {#var#} in place of the
// complaint ID (var1) or code — the text below is what to register.
const SMS_TEXT = {
  otp: code => `Your CivicPulse verification code is ${code}. It expires in 5 minutes. Do not share it.`,
  registered: id => `CivicPulse: Your complaint ${id} has been registered. Log in to CivicPulse to track its status.`,
  under_review: id => `CivicPulse: Your complaint ${id} requires additional review. No final decision has been made. Log in to view the details.`,
  approved: id => `CivicPulse: Your complaint ${id} has been approved for further action. Log in to view the latest update.`,
  rejected: id => `CivicPulse: Your complaint ${id} was not approved. Log in to CivicPulse to review the reason.`,
  in_progress: id => `CivicPulse: Work has started on your complaint ${id}. Log in to view the latest update.`,
  resolved: id => `CivicPulse: Your complaint ${id} has been marked resolved. Log in to view the update.`,
  reopened: id => `CivicPulse: Your complaint ${id} has been moved back to Pending. Log in to view the latest update.`
}

const SMS_KINDS = Object.keys(SMS_TEXT)

function getProvider() {
  return (process.env.SMS_PROVIDER || '').trim().toLowerCase()
}

function msg91TemplateId(kind) {
  return (process.env[`MSG91_TEMPLATE_${kind.toUpperCase()}`] || '').trim()
}

function isSmsConfigured() {

  const provider = getProvider()

  if (provider === 'msg91') {
    return Boolean(process.env.MSG91_AUTH_KEY) && Boolean(process.env.MSG91_SENDER_ID)
  }

  if (provider === 'twilio') {
    return (
      Boolean(process.env.TWILIO_ACCOUNT_SID) &&
      Boolean(process.env.TWILIO_AUTH_TOKEN) &&
      Boolean(process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID)
    )
  }

  return false

}

// Whether this particular kind of message can actually be sent.
function isSmsKindEnabled(kind) {

  if (!isSmsConfigured() || !SMS_TEXT[kind]) return false

  if (getProvider() === 'msg91') return Boolean(msg91TemplateId(kind))

  return true

}

function positiveIntFromEnv(name, fallback) {
  const value = parseInt(process.env[name], 10)
  return Number.isInteger(value) && value > 0 ? value : fallback
}


// ======================================
// PROVIDER ADAPTERS
// Each returns { ok, status: 'accepted' | 'failed', transient,
// providerMessageId?, error? } for ONE attempt, or throws on a network
// error / timeout (treated as transient).
// ======================================

async function attemptMsg91(to, kind, value, timeoutMs) {

  const mobiles = toMsg91Number(to)

  if (!mobiles) {
    return { ok: false, status: 'failed', transient: false, error: 'Number is not a valid Indian mobile number.' }
  }

  const response = await fetch(process.env.MSG91_FLOW_URL || 'https://control.msg91.com/api/v5/flow', {
    method: 'POST',
    headers: {
      authkey: process.env.MSG91_AUTH_KEY,
      'Content-Type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({
      template_id: msg91TemplateId(kind),
      sender: process.env.MSG91_SENDER_ID,
      short_url: '0',
      recipients: [{ mobiles, var1: String(value) }]
    }),
    signal: AbortSignal.timeout(timeoutMs)
  })

  const data = await response.json().catch(() => ({}))

  // MSG91 answers { type: 'success', message: '<request id>' } or
  // { type: 'error', message: '<reason>' }.
  if (response.ok && data && data.type === 'success') {
    return { ok: true, status: 'accepted', providerMessageId: data.request_id || data.message }
  }

  return {
    ok: false,
    status: 'failed',
    transient: response.status === 429 || response.status >= 500,
    error: (data && data.message) || `Provider returned HTTP ${response.status}`
  }

}

async function attemptTwilio(to, kind, value, timeoutMs) {

  const sid = process.env.TWILIO_ACCOUNT_SID
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')

  const form = new URLSearchParams({ To: to, Body: SMS_TEXT[kind](value) })

  if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
    form.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID)
  } else {
    form.set('From', process.env.TWILIO_FROM_NUMBER)
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form,
      signal: AbortSignal.timeout(timeoutMs)
    }
  )

  const data = await response.json().catch(() => ({}))

  if (response.ok) {
    return { ok: true, status: 'accepted', providerMessageId: data.sid }
  }

  return {
    ok: false,
    status: 'failed',
    transient: response.status === 429 || response.status >= 500,
    error: data.message || `Provider returned HTTP ${response.status}`
  }

}

const ADAPTERS = { msg91: attemptMsg91, twilio: attemptTwilio }

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))


// ======================================
// sendSms(to, kind, value)
//
// `to` is a normalized "+91XXXXXXXXXX" number, `kind` one of SMS_KINDS,
// `value` the complaint ID (or OTP code). Retries only transient
// failures (timeouts, network errors, HTTP 429/5xx), at most
// SMS_MAX_ATTEMPTS times with exponential backoff. Resolves to
// { ok, status, attempts, provider, providerMessageId?, error? }.
// ======================================

async function sendSms(to, kind, value) {

  const provider = getProvider()

  if (!isSmsConfigured()) {
    return { ok: false, status: 'not_configured', attempts: 0 }
  }

  if (!isSmsKindEnabled(kind)) {
    return { ok: false, status: 'template_missing', attempts: 0, provider }
  }

  const timeoutMs = positiveIntFromEnv('SMS_TIMEOUT_MS', DEFAULT_TIMEOUT_MS)
  const maxAttempts = Math.min(positiveIntFromEnv('SMS_MAX_ATTEMPTS', DEFAULT_MAX_ATTEMPTS), 5)
  const retryDelayMs = module.exports.retryDelayMs

  let outcome
  let attemptsMade = 0

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {

    attemptsMade = attempt

    try {
      outcome = await ADAPTERS[provider](to, kind, value, timeoutMs)
    } catch (error) {
      const timedOut = error && (error.name === 'TimeoutError' || error.name === 'AbortError')
      outcome = { ok: false, status: 'failed', transient: true, error: timedOut ? 'Provider request timed out.' : 'Could not reach the SMS provider.' }
    }

    if (outcome.ok) {
      return { ...outcome, attempts: attempt, provider }
    }

    if (!outcome.transient || attempt === maxAttempts) break

    await sleep(retryDelayMs * 2 ** (attempt - 1))

  }

  // Masked number only — a full number never reaches the logs.
  console.warn(`SMS (${kind}) to ${maskMobile(to)} failed: ${outcome.error}`)

  return {
    ok: false,
    status: 'failed',
    provider,
    attempts: attemptsMade,
    error: String(outcome.error || 'Unknown provider error').slice(0, 300)
  }

}

module.exports = {
  isSmsConfigured,
  isSmsKindEnabled,
  sendSms,
  getProvider,
  SMS_TEXT,
  SMS_KINDS,
  // Exposed so tests can shorten the backoff.
  retryDelayMs: RETRY_BASE_DELAY_MS
}
