// Creates persistent in-app notifications for citizens, with an optional
// SMS copy.
//
// - Idempotent: each notification has a dedupeKey with a unique index.
//   Creating the same notification twice (a retried request, a double
//   click) returns the existing one instead of a duplicate.
// - In-app first: the notification is saved BEFORE any SMS attempt, and
//   SMS results only ever update its `sms` block — a failed or
//   unconfigured SMS can never remove or block the in-app notification.
// - SMS only goes to a number the citizen verified by OTP.

const Notification = require('../models/Notification')
const User = require('../models/User')
const { isSmsConfigured, sendSms } = require('./smsService')

const NOTIFICATION_TEXT = {

  complaint_registered: complaint => ({
    title: 'Complaint registered',
    message: `Your complaint ${complaint.id} ("${complaint.title}") has been received.`
  }),

  complaint_under_review: (complaint, reason) => ({
    title: 'Complaint under review',
    message: `Your complaint ${complaint.id} is being reviewed by an administrator before processing. ${reason || ''}`.trim()
  }),

  complaint_rejected: (complaint, reason) => ({
    title: 'Complaint not accepted',
    message: `Your complaint ${complaint.id} was not accepted. Reason: ${reason || 'It did not meet the complaint guidelines.'}`
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

// Returns the notification document (new or pre-existing), or null when
// the complaint has no owner to notify. Never throws — notification
// problems are logged and must not fail the main request.
async function notifyCitizen({ complaint, type, reason, dedupeKey, awaitSms = false }) {

  try {

    if (!complaint || !complaint.citizenId) return null

    const text = NOTIFICATION_TEXT[type](complaint, reason)

    const key = dedupeKey || `${complaint.id}:${type}`

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
          'sms.status': isSmsConfigured() ? 'pending' : 'not_configured'
        }
      },
      { upsert: true, returnDocument: 'after', includeResultMetadata: true }
    )

    const notification = result.value
    const wasCreated = Boolean(result.lastErrorObject && result.lastErrorObject.upserted)

    if (wasCreated && isSmsConfigured()) {

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
      return Notification.findOne({ dedupeKey: dedupeKey || `${complaint.id}:${type}` })
    }

    console.error('Notification error:', error.message)

    return null

  }

}

async function deliverSms(notification) {

  const update = { 'sms.attemptedAt': new Date() }

  try {

    const user = await User.findById(notification.recipientId).select('mobile mobileVerified')

    if (!user || !user.mobile) {
      update['sms.status'] = 'no_mobile'
    } else if (!user.mobileVerified) {
      update['sms.status'] = 'unverified'
    } else {

      const outcome = await sendSms(user.mobile, `CivicPulse: ${notification.message}`)

      update['sms.status'] = outcome.status

      if (outcome.providerMessageId) update['sms.providerMessageId'] = outcome.providerMessageId
      if (outcome.error) update['sms.error'] = String(outcome.error).slice(0, 300)

    }

  } catch (error) {

    update['sms.status'] = 'failed'
    update['sms.error'] = String(error.message).slice(0, 300)

  }

  // Only the sms sub-fields change; the in-app notification stays.
  await Notification.updateOne({ _id: notification._id }, { $set: update }).catch(() => {})

}

module.exports = { notifyCitizen }
