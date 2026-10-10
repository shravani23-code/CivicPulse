// Optional SMS delivery through Twilio's REST API (uses Node's built-in
// fetch — no SDK dependency).
//
// SMS is entirely optional: when the env vars below are missing,
// isSmsConfigured() is false, nothing is sent, and callers record
// 'not_configured'. A successful API call only means Twilio ACCEPTED the
// message for sending (status "queued"/"accepted"); it is never recorded
// as "delivered", because delivery is not confirmed by that response.
//
//   SMS_PROVIDER=twilio
//   TWILIO_ACCOUNT_SID=ACxxxxxxxx
//   TWILIO_AUTH_TOKEN=xxxxxxxx
//   TWILIO_FROM_NUMBER=+1xxxxxxxxxx   (or TWILIO_MESSAGING_SERVICE_SID=MGxxxx)

const { maskMobile } = require('../utils/mobile')

const SMS_TIMEOUT_MS = 10000

function isSmsConfigured() {

  return (
    (process.env.SMS_PROVIDER || '').toLowerCase() === 'twilio' &&
    Boolean(process.env.TWILIO_ACCOUNT_SID) &&
    Boolean(process.env.TWILIO_AUTH_TOKEN) &&
    Boolean(process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID)
  )

}

// Resolves to { ok, status, providerMessageId?, error? }. Never throws —
// an SMS failure must never break the request that triggered it.
async function sendSms(to, body) {

  if (!isSmsConfigured()) {
    return { ok: false, status: 'not_configured' }
  }

  const sid = process.env.TWILIO_ACCOUNT_SID
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')

  const form = new URLSearchParams({ To: to, Body: body })

  if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
    form.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID)
  } else {
    form.set('From', process.env.TWILIO_FROM_NUMBER)
  }

  try {

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: form,
        signal: AbortSignal.timeout(SMS_TIMEOUT_MS)
      }
    )

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {

      console.warn(`SMS to ${maskMobile(to)} rejected by provider (HTTP ${response.status}).`)

      return { ok: false, status: 'failed', error: data.message || `Provider returned HTTP ${response.status}` }

    }

    return { ok: true, status: 'accepted', providerMessageId: data.sid }

  } catch (error) {

    console.warn(`SMS to ${maskMobile(to)} failed: ${error.message}`)

    return { ok: false, status: 'failed', error: error.message }

  }

}

module.exports = { isSmsConfigured, sendSms }
