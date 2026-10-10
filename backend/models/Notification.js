const mongoose = require('mongoose')

// Persistent in-app notification for one citizen. In-app delivery is the
// source of truth; the optional `sms` block only records what happened
// when an SMS copy was attempted.
const notificationSchema = new mongoose.Schema({

  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  type: {
    type: String,
    required: true,
    enum: [
      'complaint_registered',
      'complaint_under_review',
      'complaint_rejected',
      'complaint_approved',
      'status_in_progress',
      'status_resolved',
      'status_reopened'
    ]
  },

  title: {
    type: String,
    required: true
  },

  message: {
    type: String,
    required: true
  },

  // Human-facing complaint reference (CPxxxxxxxx)
  complaintId: {
    type: String
  },

  // Idempotency key — a retried request that would create the same
  // notification hits the unique index instead of duplicating it.
  dedupeKey: {
    type: String,
    required: true,
    unique: true
  },

  read: {
    type: Boolean,
    default: false
  },

  readAt: {
    type: Date
  },

  sms: {
    // not_configured | no_mobile | unverified | pending | accepted | failed
    // "accepted" = provider accepted it for sending; NOT a delivery receipt.
    status: {
      type: String,
      default: 'not_configured'
    },

    providerMessageId: String,

    error: String,

    attemptedAt: Date
  },

  createdAt: {
    type: Date,
    default: Date.now
  }

})

notificationSchema.index({ recipientId: 1, createdAt: -1 })
notificationSchema.index({ recipientId: 1, read: 1 })

module.exports = mongoose.model('Notification', notificationSchema)
