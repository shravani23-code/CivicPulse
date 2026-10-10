const express = require('express')
const crypto = require('crypto')
const Notification = require('../models/Notification')
const { rateLimit } = require('../middleware/rateLimit')

const router = express.Router()

// ======================================
// SMS DELIVERY REPORTS (provider -> CivicPulse)
// POST /api/sms/delivery-report?secret=<SMS_WEBHOOK_SECRET>
//
// The ONLY place an SMS is ever marked 'delivered' (or failed after
// being accepted): the provider's own delivery report. Configure it in
// MSG91 under Webhooks -> SMS -> "On Report Received" (JSON).
//
// The endpoint is off (404) until SMS_WEBHOOK_SECRET is set, and every
// call must carry that secret (query ?secret= or X-Webhook-Secret
// header) — otherwise anyone could forge "delivered" receipts.
//
// Reports are matched to notifications by the provider request id
// stored when the message was accepted. Nothing is logged except
// counts; phone numbers in the payload are ignored.
// ======================================

const DELIVERED = new Set(['1', 'delivered', 'delivrd', 'success'])
const FAILED = new Set([
  '2', '9', '16', '17', '25', '26', 'failed', 'failure', 'undelivered', 'undeliv',
  'rejected', 'rejectd', 'blocked', 'ndnc', 'expired'
])

function secretMatches(provided) {

  const expected = process.env.SMS_WEBHOOK_SECRET || ''

  if (!expected || typeof provided !== 'string') return false

  const a = crypto.createHash('sha256').update(provided).digest()
  const b = crypto.createHash('sha256').update(expected).digest()

  return crypto.timingSafeEqual(a, b)

}

function parseMaybeJson(value) {

  if (typeof value !== 'string') return value

  try {
    return JSON.parse(value)
  } catch {
    return value
  }

}

// Flattens the shapes MSG91 has used (a single object, an array, a
// `data` field holding a JSON string, legacy `report` arrays) into
// [{ requestId, status }].
function extractReports(body) {

  const reports = []
  const root = parseMaybeJson(body)
  const items = Array.isArray(root) ? root : [root]

  for (const rawItem of items) {

    const item = parseMaybeJson(rawItem)

    if (!item || typeof item !== 'object') continue

    if (item.data !== undefined) {
      reports.push(...extractReports(item.data))
      continue
    }

    const requestId = item.requestId || item.request_id || item.requestID || item.reqId

    const nested = parseMaybeJson(item.report)

    if (Array.isArray(nested)) {
      for (const entry of nested) {
        if (entry && typeof entry === 'object') {
          reports.push({ requestId, status: entry.status ?? entry.desc })
        }
      }
      continue
    }

    reports.push({ requestId, status: item.status ?? item.desc })

  }

  return reports.filter(report => typeof report.requestId === 'string' && report.requestId && report.status !== undefined)

}

router.post(
  '/delivery-report',
  rateLimit({ name: 'sms-webhook', windowMs: 60 * 1000, max: 600 }),
  async (req, res) => {

    if (!process.env.SMS_WEBHOOK_SECRET) {
      return res.status(404).json({ message: 'Not found.' })
    }

    if (!secretMatches(req.query.secret || req.get('x-webhook-secret'))) {
      return res.status(401).json({ message: 'Invalid webhook secret.' })
    }

    try {

      const reports = extractReports(req.body).slice(0, 500)
      let updated = 0

      for (const { requestId, status } of reports) {

        const raw = String(status).trim().slice(0, 50)
        const normalized = raw.toLowerCase()
        const now = new Date()

        const set = { 'sms.providerStatus': raw, 'sms.lastReportAt': now }

        if (DELIVERED.has(normalized)) {
          set['sms.status'] = 'delivered'
          set['sms.deliveredAt'] = now
        } else if (FAILED.has(normalized)) {
          set['sms.status'] = 'failed'
          set['sms.error'] = `Delivery report: ${raw}`
        }

        // Final states only move forward from 'accepted'; an unknown
        // interim status is just recorded.
        const filter = { 'sms.providerMessageId': requestId.slice(0, 100) }
        if (set['sms.status']) filter['sms.status'] = 'accepted'

        const result = await Notification.updateMany(filter, { $set: set })

        updated += result.modifiedCount

      }

      res.json({ received: reports.length, updated })

    } catch (error) {

      console.error('SMS delivery report error:', error.message)

      res.status(500).json({ message: 'Failed to process delivery report.' })

    }

  }
)

module.exports = router
module.exports.extractReports = extractReports
