// Creates persistent in-app notifications for citizens, with an optional
// SMS copy.
//
// - Idempotent: each notification has a dedupeKey with a unique index.
//   Creating the same notification twice (a retried request, a double
//   click) returns the existing one instead of a duplicate — and only a
//   newly created notification can ever trigger an SMS.
// - In-app first: the notification is saved BEFORE any SMS attempt, and
//   SMS results only ever update its `sms` block — a failed or
//   unconfigured SMS can never remove the in-app notification or undo
//   the complaint change that caused it.
// - SMS only goes to a citizen who (1) opted in to SMS updates and
//   (2) verified their number by OTP, and only for message kinds the
//   provider is set up for (DLT template configured).
// - Exactly-once send: before calling the provider the notification is
//   claimed atomically ('pending' -> 'sending'), so two concurrent
//   attempts for the same notification cannot both send.

const Notification = require('../models/Notification')
const User = require('../models/User')
const { isSmsConfigured, isSmsKindEnabled, sendSms } = require('./smsService')

const NOTIFICATION_TEXT = {

  complaint_registered: complaint => ({
    title: 'Complaint registered',
    message: `Your complaint ${complaint.id} ("${complaint.title}") has been received.`
  }),

  // Deliberately neutral: nothing has been decided and nobody is being
  // accused of anything. The internal review reason is for admins only.
  complaint_under_review: complaint => ({
    title: 'Complaint needs additional review',
    message: `Your CivicPulse complaint ${complaint.id} requires additional review because it resembles an existing report or requires clarification. No final decision has been made. You can follow its status under My Complaints.`
  }),

  complaint_rejected: (complaint, reason) => ({
    title: 'Complaint not approved',
    message: `Your CivicPulse complaint ${complaint.id} was not approved. Reason: ${reason || 'It did not meet the complaint guidelines.'} If you believe this is a mistake, you can submit a new complaint with clarified details.`
  }),

  complaint_approved: complaint => ({
    title: 'Complaint accepted for processing',
    message: `Your complaint ${complaint.id} has been accepted and entered the processing queue.`
  }),

  status_in_progress: complaint => ({
    title: 'Work in progress',
    message: `Work has started on your complaint ${complaint.id}.`
  }),

  status_resolved: complaint => ({
    title: 'Complaint resolved',
    message: `Your complaint ${complaint.id} has been marked as resolved.`
  }),

  // An admin moved the complaint back to Pending (e.g. reopened after
  // being marked resolved, or work paused).
  status_reopened: complaint => ({
    title: 'Complaint moved back to pending',
    message: `Your complaint ${complaint.id} has been moved back to Pending and is awaiting action.`
  })

}

// Which SMS template (services/smsService.js) each notification uses.
const SMS_KIND_BY_TYPE = {
  complaint_registered: 'registered',
  complaint_under_review: 'under_review',
  complaint_rejected: 'rejected',
  complaint_approved: 'approved',
  status_in_progress: 'in_progress',
  status_resolved: 'resolved',
  status_reopened: 'reopened'
}

function initialSmsStatus(type, wantSms) {
  if (!wantSms) return 'not_requested'
  if (!isSmsConfigured()) return 'not_configured'
  if (!isSmsKindEnabled(SMS_KIND_BY_TYPE[type])) return 'template_missing'
  return 'pending'
}

// Returns the notification document (new or pre-existing), or null when
// the complaint has no owner to notify. Never throws — notification
// problems are logged and must not fail the main request.
//
//   sms: false   in-app only (e.g. the automatic "accepted" notice that
//                accompanies "registered" — one SMS per event is enough)
async function notifyCitizen({ complaint, type, reason, dedupeKey, sms = true, awaitSms = false }) {

  const key = dedupeKey || (complaint && `${complaint.id}:${type}`)

  try {

    if (!complaint || !complaint.citizenId) return null

    const text = NOTIFICATION_TEXT[type](complaint, reason)

    // Upsert on the unique dedupeKey: inserts once, otherwise returns the
    // existing document untouched.
    const result = await Notification.findOneAndUpdate(
      { dedupeKey: key },
      {
        $setOnInsert: {
          recipientId: complaint.citizenId,
          type,
          title: text.title,
          message: text.message,
          complaintId: complaint.id,
          dedupeKey: key,
          read: false,
          createdAt: new Date(),
          'sms.status': initialSmsStatus(type, sms)
        }
      },
      { upsert: true, returnDocument: 'after', includeResultMetadata: true }
    )

    const notification = result.value
    const wasCreated = Boolean(result.lastErrorObject && result.lastErrorObject.upserted)

    if (wasCreated && notification.sms && notification.sms.status === 'pending') {

      const smsTask = deliverSms(notification)

      if (awaitSms) {
        await smsTask
      } else {
        smsTask.catch(() => {})
      }

    }

    return notification

  } catch (error) {

    // A concurrent duplicate insert loses the unique-index race — that is
    // exactly the dedupe working, so return the winner.
    if (error && error.code === 11000) {
      return Notification.findOne({ dedupeKey: key })
    }

    console.error('Notification error:', error.message)

    return null

  }

}

// Sends the SMS copy of one notification, at most once.
async function deliverSms(notification) {

  // Claim it: only one caller can move 'pending' -> 'sending'.
  const claimed = await Notification.findOneAndUpdate(
    { _id: notification._id, 'sms.status': 'pending' },
    { $set: { 'sms.status': 'sending', 'sms.attemptedAt': new Date() } },
    { returnDocument: 'after' }
  ).catch(() => null)

  if (!claimed) return

  const update = {}

  try {

    const user = await User.findById(notification.recipientId).select('mobile mobileVerified smsConsent')

    if (!user || !user.mobile) {
      update['sms.status'] = 'no_mobile'
    } else if (!user.smsConsent) {
      update['sms.status'] = 'no_consent'
    } else if (!user.mobileVerified) {
      update['sms.status'] = 'unverified'
    } else {

      const outcome = await sendSms(user.mobile, SMS_KIND_BY_TYPE[notification.type], notification.complaintId)

      update['sms.status'] = outcome.status

      if (outcome.provider) update['sms.provider'] = outcome.provider
      if (outcome.attempts !== undefined) update['sms.attempts'] = outcome.attempts
      if (outcome.providerMessageId) update['sms.providerMessageId'] = String(outcome.providerMessageId)
      if (outcome.error) update['sms.error'] = String(outcome.error).slice(0, 300)

    }

  } catch (error) {

    update['sms.status'] = 'failed'
    update['sms.error'] = String(error.message).slice(0, 300)

  }

  // Only the sms sub-fields change; the in-app notification stays.
  await Notification.updateOne({ _id: notification._id }, { $set: update }).catch(() => {})

}

module.exports = { notifyCitizen, NOTIFICATION_TEXT, SMS_KIND_BY_TYPE }
