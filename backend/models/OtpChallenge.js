const mongoose = require('mongoose')

// One active mobile-verification challenge per user. Only an HMAC of the
// code is stored — never the code itself. MongoDB's TTL index removes the
// document automatically after `purgeAt`.
const otpChallengeSchema = new mongoose.Schema({

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },

  mobile: {
    type: String,
    required: true
  },

  codeHash: {
    type: String,
    required: true
  },

  expiresAt: {
    type: Date,
    required: true
  },

  attempts: {
    type: Number,
    default: 0
  },

  lastSentAt: {
    type: Date,
    required: true
  },

  // Sends within the current hourly window (abuse / cost protection)
  sendsInWindow: {
    type: Number,
    default: 1
  },

  windowStartedAt: {
    type: Date,
    required: true
  },

  purgeAt: {
    type: Date,
    required: true
  }

})

otpChallengeSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 })

module.exports = mongoose.model('OtpChallenge', otpChallengeSchema)
