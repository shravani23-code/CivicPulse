const express = require('express')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const OtpChallenge = require('../models/OtpChallenge')
const { requireAuth, requireRole } = require('../middleware/auth')
const { rateLimit } = require('../middleware/rateLimit')
const { normalizeIndianMobile, maskMobile } = require('../utils/mobile')

const MAX_NAME_LENGTH = 100
const MAX_EMAIL_LENGTH = 254
const MAX_PASSWORD_LENGTH = 128
const { isSmsConfigured, sendSms } = require('../services/smsService')

const router = express.Router()

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function issueToken(user) {

  return jwt.sign(
    {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )

}

function publicUser(user) {

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role
  }

}


// ======================================
// CITIZEN REGISTRATION
// (Admin accounts are seeded from env vars, not self-registered.)
// ======================================

router.post('/register', async (req, res) => {

  try {

    const { name, email, password, mobile } = req.body || {}

    // Type checks first: a non-string value (e.g. an object in a crafted
    // request) must get a 400, never reach .trim()/.toLowerCase() or a query.
    if (typeof name !== 'string' || !name.trim() || name.trim().length > MAX_NAME_LENGTH) {
      return res.status(400).json({ message: 'Please enter your name (up to 100 characters).' })
    }

    if (typeof email !== 'string' || email.trim().length > MAX_EMAIL_LENGTH || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ message: 'Please enter a valid email address.' })
    }

    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' })
    }

    if (password.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ message: 'Password must be at most 128 characters.' })
    }

    // Mobile number is OPTIONAL at registration (it was never required);
    // when given it must be a valid Indian mobile number and is stored in
    // the same normalized "+91XXXXXXXXXX" string form as everywhere else.
    // It starts unverified — only the OTP flow can verify a number.
    let normalizedMobile

    if (mobile !== undefined && mobile !== null && mobile !== '') {

      if (typeof mobile !== 'string') {
        return res.status(400).json({ message: 'Mobile number must be text.' })
      }

      if (mobile.trim() !== '') {

        normalizedMobile = normalizeIndianMobile(mobile)

        if (!normalizedMobile) {
          return res.status(400).json({
            message: 'Please enter a valid 10-digit Indian mobile number (starting with 6, 7, 8 or 9), or leave it blank.'
          })
        }

      }

    }

    const normalizedEmail = email.trim().toLowerCase()

    const existingUser = await User.findOne({ email: normalizedEmail })

    if (existingUser) {
      return res.status(409).json({ message: 'An account with this email already exists.' })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: 'citizen',
      ...(normalizedMobile ? { mobile: normalizedMobile, mobileVerified: false } : {})
    })

    const token = issueToken(user)

    res.status(201).json({
      message: 'Account created successfully.',
      token,
      user: publicUser(user)
    })

  } catch (error) {

    console.error('Registration error:', error)

    // Two simultaneous sign-ups with the same email: the unique index
    // rejects the second one — report it as the duplicate it is.
    if (error && error.code === 11000) {
      return res.status(409).json({ message: 'An account with this email already exists.' })
    }

    res.status(500).json({ message: 'Failed to create account.' })

  }

})


// ======================================
// LOGIN (citizen and admin share this endpoint; the requested `role`
// must match the account's actual role, keeping the two portals separate)
// ======================================

router.post('/login', async (req, res) => {

  try {

    const { email, password, role } = req.body || {}

    if (!email || !password || !role) {
      return res.status(400).json({ message: 'Please provide email, password and role.' })
    }

    if (typeof email !== 'string' || typeof password !== 'string' || typeof role !== 'string') {
      return res.status(400).json({ message: 'Email, password and role must be text.' })
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() })

    if (!user || user.role !== role) {
      return res.status(401).json({ message: 'Invalid email, password, or account type.' })
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash)

    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid email, password, or account type.' })
    }

    const token = issueToken(user)

    res.json({
      message: 'Logged in successfully.',
      token,
      user: publicUser(user)
    })

  } catch (error) {

    console.error('Login error:', error)

    res.status(500).json({ message: 'Failed to log in.' })

  }

})


// ======================================
// CURRENT USER PROFILE
// GET /api/auth/me
//
// Lets the complaint form reuse a saved mobile number without the full
// number ever leaving the server (only a masked form is returned).
// ======================================

router.get('/me', requireAuth, async (req, res) => {

  try {

    const user = await User.findById(req.user.id)

    if (!user) {
      return res.status(404).json({ message: 'Account not found.' })
    }

    res.json({
      user: publicUser(user),
      hasMobile: Boolean(user.mobile),
      mobileMasked: maskMobile(user.mobile),
      mobileVerified: Boolean(user.mobile && user.mobileVerified),
      smsVerificationAvailable: isSmsConfigured()
    })

  } catch (error) {

    console.error('Profile error:', error)

    res.status(500).json({ message: 'Failed to load profile.' })

  }

})


// ======================================
// MOBILE NUMBER VERIFICATION (OTP over SMS)
//
// Only works when an SMS provider is configured (see
// services/smsService.js). Without one, these endpoints answer 503 and
// no number is ever marked verified — verification is never faked.
//
// - 6-digit code from crypto.randomInt, stored only as an HMAC
// - expires after 5 minutes; 5 wrong attempts invalidates it
// - 60-second resend cooldown; at most 5 sends per hour per account
// - plus per-account request rate limits on both endpoints
// ======================================

const OTP_TTL_MS = 5 * 60 * 1000
const OTP_RESEND_COOLDOWN_MS = 60 * 1000
const OTP_MAX_ATTEMPTS = 5
const OTP_MAX_SENDS_PER_WINDOW = 5
const OTP_SEND_WINDOW_MS = 60 * 60 * 1000

function hashOtp(userId, mobile, code) {

  const secret = process.env.OTP_SECRET || process.env.JWT_SECRET

  return crypto.createHmac('sha256', secret).update(`${userId}:${mobile}:${code}`).digest('hex')

}

function smsNotConfigured(res) {

  return res.status(503).json({
    code: 'SMS_NOT_CONFIGURED',
    message: 'Mobile verification is not available yet because no SMS provider is configured. Your number has been saved but is not verified.'
  })

}

router.post(
  '/mobile/send-otp',
  requireAuth,
  requireRole('citizen'),
  rateLimit({ name: 'otp-send', windowMs: 15 * 60 * 1000, max: 5, message: 'Too many verification code requests. Please try again later.' }),
  async (req, res) => {

    try {

      if (!isSmsConfigured()) return smsNotConfigured(res)

      const user = await User.findById(req.user.id)

      if (!user) {
        return res.status(404).json({ message: 'Account not found.' })
      }

      const requested = req.body && typeof req.body.mobile === 'string' && req.body.mobile.trim()
        ? normalizeIndianMobile(req.body.mobile)
        : user.mobile

      if (!requested) {
        return res.status(400).json({ message: 'Please enter a valid 10-digit Indian mobile number.' })
      }

      const now = Date.now()
      const existing = await OtpChallenge.findOne({ userId: user._id })

      if (existing && now - existing.lastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS) {

        const retryAfterSeconds = Math.ceil((OTP_RESEND_COOLDOWN_MS - (now - existing.lastSentAt.getTime())) / 1000)

        return res.status(429).json({ message: `Please wait ${retryAfterSeconds} seconds before requesting a new code.`, retryAfterSeconds })

      }

      const windowActive = existing && now - existing.windowStartedAt.getTime() < OTP_SEND_WINDOW_MS
      const sendsInWindow = windowActive ? existing.sendsInWindow : 0

      if (sendsInWindow >= OTP_MAX_SENDS_PER_WINDOW) {
        return res.status(429).json({ message: 'Too many verification codes requested. Please try again in an hour.' })
      }

      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0')

      const outcome = await sendSms(requested, `Your CivicPulse verification code is ${code}. It expires in 5 minutes. Do not share it.`)

      if (!outcome.ok) {
        return res.status(502).json({ message: 'Could not send the verification code. Please try again later.' })
      }

      await OtpChallenge.findOneAndUpdate(
        { userId: user._id },
        {
          $set: {
            mobile: requested,
            codeHash: hashOtp(user._id, requested, code),
            expiresAt: new Date(now + OTP_TTL_MS),
            attempts: 0,
            lastSentAt: new Date(now),
            sendsInWindow: sendsInWindow + 1,
            windowStartedAt: windowActive ? existing.windowStartedAt : new Date(now),
            purgeAt: new Date(now + OTP_SEND_WINDOW_MS)
          }
        },
        { upsert: true }
      )

      res.json({
        message: `Verification code sent to ${maskMobile(requested)}.`,
        mobileMasked: maskMobile(requested),
        expiresInSeconds: OTP_TTL_MS / 1000,
        resendAfterSeconds: OTP_RESEND_COOLDOWN_MS / 1000
      })

    } catch (error) {

      console.error('OTP send error:', error.message)

      res.status(500).json({ message: 'Failed to send verification code.' })

    }

  }
)

router.post(
  '/mobile/verify-otp',
  requireAuth,
  requireRole('citizen'),
  rateLimit({ name: 'otp-verify', windowMs: 15 * 60 * 1000, max: 15, message: 'Too many verification attempts. Please try again later.' }),
  async (req, res) => {

    try {

      if (!isSmsConfigured()) return smsNotConfigured(res)

      const code = req.body && typeof req.body.code === 'string' ? req.body.code.trim() : ''

      if (!/^\d{6}$/.test(code)) {
        return res.status(400).json({ message: 'Please enter the 6-digit code.' })
      }

      // Claim one attempt atomically BEFORE comparing, so parallel guesses
      // can never exceed OTP_MAX_ATTEMPTS.
      const challenge = await OtpChallenge.findOneAndUpdate(
        { userId: req.user.id, expiresAt: { $gt: new Date() }, attempts: { $lt: OTP_MAX_ATTEMPTS } },
        { $inc: { attempts: 1 } },
        { returnDocument: 'after' }
      )

      if (!challenge) {
        return res.status(400).json({ message: 'The code has expired, was never requested, or has had too many wrong attempts. Please request a new code.' })
      }

      const expected = Buffer.from(challenge.codeHash, 'hex')
      const actual = Buffer.from(hashOtp(req.user.id, challenge.mobile, code), 'hex')

      if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {

        const attemptsRemaining = Math.max(OTP_MAX_ATTEMPTS - challenge.attempts, 0)

        if (attemptsRemaining === 0) {
          // Invalidate the code but keep the doc so the cooldown/window still apply.
          await OtpChallenge.updateOne({ _id: challenge._id }, { $set: { expiresAt: new Date(0) } })
        }

        return res.status(400).json({ message: 'Incorrect code.', attemptsRemaining })

      }

      // Single use: invalidate before marking verified.
      await OtpChallenge.updateOne({ _id: challenge._id }, { $set: { expiresAt: new Date(0) } })

      await User.updateOne(
        { _id: req.user.id },
        { $set: { mobile: challenge.mobile, mobileVerified: true, mobileVerifiedAt: new Date() } }
      )

      res.json({ message: 'Mobile number verified.', mobileMasked: maskMobile(challenge.mobile), mobileVerified: true })

    } catch (error) {

      console.error('OTP verify error:', error.message)

      res.status(500).json({ message: 'Failed to verify code.' })

    }

  }
)

module.exports = router
