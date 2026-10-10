const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({

  name: {
    type: String,
    required: true
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },

  passwordHash: {
    type: String,
    required: true
  },

  role: {
    type: String,
    enum: ['citizen', 'admin'],
    default: 'citizen'
  },

  // Optional — added after launch, so older accounts simply don't have
  // it. Stored normalized as "+91XXXXXXXXXX" (see utils/mobile.js).
  mobile: {
    type: String
  },

  // Only ever set true by a successful server-side OTP check.
  mobileVerified: {
    type: Boolean,
    default: false
  },

  mobileVerifiedAt: {
    type: Date
  },

  // Explicit opt-in to SMS status updates. Off unless the citizen ticks
  // it; withdrawing keeps the timestamps as a record. Older accounts have
  // no value, which counts as "not consented".
  smsConsent: {
    type: Boolean,
    default: false
  },

  smsConsentAt: {
    type: Date
  },

  smsConsentWithdrawnAt: {
    type: Date
  },

  createdAt: {
    type: Date,
    default: Date.now
  }

})

module.exports = mongoose.model('User', userSchema)
