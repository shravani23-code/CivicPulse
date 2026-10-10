const express = require('express')
const Complaint = require('../models/Complaint')
const { requireAuth, requireRole } = require('../middleware/auth')
const { rateLimit } = require('../middleware/rateLimit')
const { notifyCitizen } = require('../services/notificationService')

const router = express.Router()

const COMPLAINT_ID_REGEX = /^CP\d{8}$/
const REVIEWABLE_FILTERS = ['needs_review', 'rejected']
const MIN_REASON_LENGTH = 5
const MIN_REASON_LETTERS = 4
const MAX_REASON_LENGTH = 500

// Admin only. The role comes from the signed JWT (requireRole), never
// from anything the frontend sends.
router.use(requireAuth, requireRole('admin'))

router.use(rateLimit({
  name: 'moderation',
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many moderation requests. Please slow down.'
}))

function validateComplaintId(req, res, next) {

  if (!COMPLAINT_ID_REGEX.test(req.params.id)) {
    return res.status(400).json({ message: 'Invalid complaint ID format.' })
  }

  next()

}

function cleanReason(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

// Explains why a conditional update matched nothing: missing complaint,
// or another admin (or a double click) already decided it.
async function conflictResponse(res, complaintId, action) {

  const current = await Complaint.findOne({ id: complaintId }).select('moderationStatus')

  if (!current) {
    return res.status(404).json({ message: 'Complaint not found.' })
  }

  const state = current.moderationStatus || 'approved'

  return res.status(409).json({
    message: `This complaint cannot be ${action} because it is already ${state.replace('_', ' ')}.`,
    moderationStatus: state
  })

}


// ======================================
// LIST COMPLAINTS FOR MODERATION
// GET /api/moderation/complaints?status=needs_review|rejected
// ======================================

router.get('/complaints', async (req, res) => {

  try {

    const status = REVIEWABLE_FILTERS.includes(req.query.status) ? req.query.status : 'needs_review'

    const [complaints, needsReview, rejected] = await Promise.all([
      Complaint.find({ moderationStatus: status }).sort({ createdAt: 1 }).limit(200),
      Complaint.countDocuments({ moderationStatus: 'needs_review' }),
      Complaint.countDocuments({ moderationStatus: 'rejected' })
    ])

    res.json({ status, counts: { needsReview, rejected }, complaints })

  } catch (error) {

    console.error('Moderation list error:', error)

    res.status(500).json({ message: 'Failed to fetch complaints for moderation.' })

  }

})


// ======================================
// APPROVE / DISMISS FLAG
// POST /api/moderation/complaints/:id/approve   { note?: string }
// POST /api/moderation/complaints/:id/dismiss   { note?: string }
//
// Both let the complaint into the processing workflow. "Dismiss" records
// that the automatic flag was a false positive; "approve" records an
// admin approval (also used to overturn a rejection). Neither sends the
// citizen anything accusatory — they get the normal "accepted" notice.
//
// The conditional update only matches a complaint that is still under
// review (or, for approve, was rejected and is being overturned). Once
// approved it no longer matches, so concurrent or repeated approvals
// cannot enter it into the workflow twice — the losers get 409.
// ======================================

function admitToWorkflow({ dismiss }) {

  return async (req, res) => {

    try {

      const note = cleanReason(req.body && req.body.note).slice(0, MAX_REASON_LENGTH)
      const now = new Date()

      const auditReason = dismiss
        ? `Automatic flag dismissed as a false positive.${note ? ` ${note}` : ''}`
        : note

      const complaint = await Complaint.findOneAndUpdate(
        {
          id: req.params.id,
          moderationStatus: dismiss ? 'needs_review' : { $in: ['needs_review', 'rejected'] }
        },
        {
          $set: {
            moderationStatus: 'approved',
            moderationReason: auditReason,
            workflowEnteredAt: now,
            'suspicion.level': 'normal',
            'suspicion.reviewStatus': dismiss ? 'dismissed' : 'approved',
            'suspicion.reviewedAt': now,
            'suspicion.reviewedBy': req.user.id,
            'suspicion.reviewerEmail': req.user.email,
            'suspicion.reviewReason': auditReason
          },
          $push: {
            moderationHistory: {
              decision: 'approved',
              reason: auditReason,
              actor: 'admin',
              adminId: req.user.id,
              adminEmail: req.user.email,
              timestamp: now
            },
            history: {
              status: 'Pending',
              timestamp: now,
              description: 'Complaint approved after review and entered the processing queue.'
            }
          }
        },
        { returnDocument: 'after' }
      )

      if (!complaint) {
        return conflictResponse(res, req.params.id, dismiss ? 'dismissed' : 'approved')
      }

      const decision = complaint.moderationHistory[complaint.moderationHistory.length - 1]

      // Keyed by this decision's audit entry: one notification (and at
      // most one SMS) per decision, however often the request is retried.
      await notifyCitizen({
        complaint,
        type: 'complaint_approved',
        dedupeKey: `${complaint.id}:moderation:${decision._id}`
      })

      res.json({
        message: dismiss
          ? `Flag dismissed. Complaint ${complaint.id} added to the processing queue.`
          : `Complaint ${complaint.id} approved and added to the processing queue.`,
        complaint
      })

    } catch (error) {

      console.error('Moderation approve error:', error)

      res.status(500).json({ message: dismiss ? 'Failed to dismiss the flag.' : 'Failed to approve complaint.' })

    }

  }

}

router.post('/complaints/:id/approve', validateComplaintId, admitToWorkflow({ dismiss: false }))

router.post('/complaints/:id/dismiss', validateComplaintId, admitToWorkflow({ dismiss: true }))


// ======================================
// REJECT
// POST /api/moderation/complaints/:id/reject   { reason: string }
// ======================================

router.post('/complaints/:id/reject', validateComplaintId, async (req, res) => {

  try {

    const reason = cleanReason(req.body && req.body.reason)

    // The reason is shown to the citizen, so it must be real text, not
    // filler like "....." or "12345".
    const letters = (reason.match(/\p{L}/gu) || []).length

    if (reason.length < MIN_REASON_LENGTH || reason.length > MAX_REASON_LENGTH || letters < MIN_REASON_LETTERS) {
      return res.status(400).json({
        message: `Please give the citizen a clear reason for rejection (${MIN_REASON_LENGTH}-${MAX_REASON_LENGTH} characters, written in words).`
      })
    }

    const now = new Date()

    const complaint = await Complaint.findOneAndUpdate(
      { id: req.params.id, moderationStatus: 'needs_review' },
      {
        $set: {
          moderationStatus: 'rejected',
          moderationReason: reason,
          // Only an administrator can confirm a complaint is invalid.
          'suspicion.level': 'confirmed_invalid',
          'suspicion.reviewStatus': 'confirmed_invalid',
          'suspicion.reviewedAt': now,
          'suspicion.reviewedBy': req.user.id,
          'suspicion.reviewerEmail': req.user.email,
          'suspicion.reviewReason': reason
        },
        $push: {
          moderationHistory: {
            decision: 'rejected',
            reason,
            actor: 'admin',
            adminId: req.user.id,
            adminEmail: req.user.email,
            timestamp: now
          },
          history: {
            status: 'Pending',
            timestamp: now,
            description: `Complaint was not accepted after review: ${reason}`
          }
        }
      },
      { returnDocument: 'after' }
    )

    if (!complaint) {
      return conflictResponse(res, req.params.id, 'rejected')
    }

    const decision = complaint.moderationHistory[complaint.moderationHistory.length - 1]

    // Sent only now that the decision is persisted.
    await notifyCitizen({
      complaint,
      type: 'complaint_rejected',
      reason,
      dedupeKey: `${complaint.id}:moderation:${decision._id}`
    })

    res.json({ message: `Complaint ${complaint.id} rejected.`, complaint })

  } catch (error) {

    console.error('Moderation reject error:', error)

    res.status(500).json({ message: 'Failed to reject complaint.' })

  }

})

module.exports = router
