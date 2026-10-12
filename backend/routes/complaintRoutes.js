const express = require('express')
const multer = require('multer')
const Complaint = require('../models/Complaint')
const User = require('../models/User')
const { requireAuth, requireRole } = require('../middleware/auth')
const { rateLimit } = require('../middleware/rateLimit')
const { uploadBuffer } = require('../utils/cloudinary')
const { normalizeIndianMobile, maskMobile } = require('../utils/mobile')
const { moderateComplaint } = require('../services/moderationEngine')
const { assessSubmission } = require('../services/suspicionDetector')
const { notifyCitizen } = require('../services/notificationService')
const {
  calculateBasePriority,
  attachPriority,
  getEffectiveSeverity,
  rankByPriority,
  peekHighestPriority,
  buildHistoryTimeline,
  processQueue
} = require('../dsaEngines')
const { bfsWithinHops } = require('../services/graphEngine')
const {
  civicGraph,
  AVERAGE_SPEED_KMH,
  resolveLocationToNode,
  findBestResponse,
  getGraphSnapshot
} = require('../data/civicGraph')

// High/Critical complaints also get a BFS sweep of nearby areas worth
// inspecting; Medium/Low complaints just get the route.
const BFS_INSPECTION_SEVERITIES = ['High', 'Critical']
const BFS_INSPECTION_HOPS = 2

// Shared by both /:id/route (admin) and /:id/response-status (citizen) —
// resolves the complaint's location on the civic graph and runs Dijkstra
// from the best available response source. Returns null when no honest
// route can be produced (unrecognized location, or a disconnected graph
// component) instead of ever guessing one.
function computeResponse(complaint) {

  const destinationNode = resolveLocationToNode(complaint.location)

  if (!destinationNode) return null

  const best = findBestResponse(destinationNode)

  if (!best) return null

  const etaMinutes = Math.round((best.distance / AVERAGE_SPEED_KMH) * 60)

  const nearbyAreas = BFS_INSPECTION_SEVERITIES.includes(complaint.severity)
    ? bfsWithinHops(civicGraph, destinationNode, BFS_INSPECTION_HOPS)
    : []

  return {
    source: best.source,
    destination: destinationNode,
    path: best.path,
    distanceKm: best.distance,
    etaMinutes,
    nearbyAreas,
    algorithm: 'Dijkstra'
  }

}

const router = express.Router()

const COMPLAINT_ID_REGEX = /^CP\d{8}$/

// Mirrors the exact `value`s the citizen-facing category/severity pickers
// send (see CATEGORIES/SEVERITIES in ReportComplaint.jsx) — kept here too,
// not just as a schema enum, so a malformed direct API request gets a
// clean 400 instead of surfacing a raw Mongoose validation error.
const ALLOWED_CATEGORIES = ['Road', 'Garbage', 'Water', 'Streetlight', 'Drainage', 'Traffic', 'Other']
const ALLOWED_SEVERITIES = ['Low', 'Medium', 'High', 'Critical']

// Parses an optional latitude/longitude form field. Returns:
//   - undefined  when the field was never provided (older complaints, or
//     GPS unavailable/denied at submission time — always allowed)
//   - a finite in-range number when it validly was
//   - null       when the field WAS provided but isn't a valid finite
//     number within range — the caller rejects the request in that case,
//     it never silently drops bad data.
function parseOptionalCoordinate(value, min, max) {

  if (value === undefined || value === null || value === '') return undefined

  const numeric = Number(value)

  if (!Number.isFinite(numeric) || numeric < min || numeric > max) return null

  return numeric

}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per image
    files: 5
  },
  fileFilter(req, file, callback) {

    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      const error = new Error('Only JPEG, PNG, WEBP or GIF images are allowed.')
      error.status = 400
      return callback(error)
    }

    callback(null, true)

  }
})

function validateComplaintIdFormat(req, res, next) {

  if (!COMPLAINT_ID_REGEX.test(req.params.id)) {

    return res.status(400).json({
      message: 'Invalid complaint ID format. Expected CP followed by exactly 8 digits, e.g. CP12880613.'
    })

  }

  next()

}

// Generates a unique CP + 8-digit complaint ID, retrying on the rare
// chance of a collision (keeps the exact CPxxxxxxxx format either way).
async function generateUniqueComplaintId() {

  for (let attempt = 0; attempt < 5; attempt++) {

    const candidate = attempt === 0
      ? 'CP' + Date.now().toString().slice(-8)
      : 'CP' + Math.floor(10000000 + Math.random() * 89999999)

    const exists = await Complaint.exists({ id: candidate })

    if (!exists) {
      return candidate
    }

  }

  throw new Error('Could not generate a unique complaint ID.')

}

// Strips citizen contact fields a viewer doesn't need repeated back to
// them (used for the citizen's own complaint on Track Complaint).
function toPublicComplaint(complaint) {

  const obj = complaint.toObject ? complaint.toObject() : complaint

  const { citizenEmail, citizenId, ...publicFields } = obj

  return toOwnerView(publicFields)

}

// Citizen-facing view of their OWN complaint: the mobile number is masked
// and the admin audit trail (admin ids/emails) is removed.
const CITIZEN_REVIEW_NOTE =
  'This complaint needs additional review because it resembles an existing report or requires clarification. No final decision has been made.'

function toOwnerView(obj) {

  const { citizenMobile, moderationHistory, suspicion, moderationFlags, ...rest } = obj

  if (citizenMobile) rest.citizenMobileMasked = maskMobile(citizenMobile)

  // The detector's internal reasons/evidence are for administrators. The
  // citizen gets a neutral note while under review, and the admin's
  // recorded reason once a final decision is made.
  if (rest.moderationStatus === 'needs_review') rest.moderationReason = CITIZEN_REVIEW_NOTE

  return rest

}

// ======================================
// MODERATION GATE
//
// Every complaint is part of the processing workflow (Max Heap ranking,
// FIFO queue, status updates, public statistics) unless an administrator
// REJECTED it during moderation. The admin review panel has been
// retired, so nothing is held back any more: complaints still marked
// "needs_review" from before stay visible and processable instead of
// being silently hidden. Complaints created before moderation existed
// have no moderationStatus and are included too.
// ======================================

const IN_WORKFLOW = { moderationStatus: { $ne: 'rejected' } }

function isInWorkflow(complaint) {
  return complaint.moderationStatus !== 'rejected'
}

const submitRateLimit = rateLimit({
  name: 'complaint-submit',
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'You have submitted too many complaints in a short time. Please try again later.'
})

// Returns a complaint with its live priority attached, without
// persisting it — the base score is fixed, but the effective score grows
// with waiting time on every read. Uses exactly the same fields as the
// Max Heap entries (attachPriority in dsaEngines.js). Pass one `now` per
// request so every complaint in a response is scored at the same moment.

function withLivePriority(complaint, now = Date.now()) {
  return attachPriority(complaint, now)
}


// Ownership check for Track Complaint: a complaint's owner (its
// citizenId, set from the authenticated submitter at creation time — see
// POST /) or an admin. This is the ONLY thing that decides whether a
// citizen can view a complaint by ID — never the complaint ID itself,
// which is not a secret and must not double as an access token.
function isComplaintOwner(complaint, user) {

  if (!user) return false

  if (user.role === 'admin') return true

  return Boolean(complaint.citizenId) && String(complaint.citizenId) === String(user.id)

}

// Track Complaint deliberately answers "not found" and "found but not
// yours" identically — a distinct "forbidden" response would confirm to
// anyone guessing IDs that a given Complaint ID exists and belongs to
// someone else. Same status, same message, either way.
const COMPLAINT_NOT_FOUND_FOR_USER = {
  status: 404,
  message: 'Complaint not found for your account. Please enter a Complaint ID registered under your account.'
}


// ======================================
// CITY STATISTICS (public)
// ======================================

router.get('/stats', async (req, res) => {

  try {

    // Counts cover complaints in the processing workflow only — complaints
    // awaiting review or rejected as spam/abuse don't inflate the numbers.
    const [total, pending, inProgress, resolved, severityRows] = await Promise.all([
      Complaint.countDocuments(IN_WORKFLOW),
      Complaint.countDocuments({ ...IN_WORKFLOW, status: 'Pending' }),
      Complaint.countDocuments({ ...IN_WORKFLOW, status: 'In Progress' }),
      Complaint.countDocuments({ ...IN_WORKFLOW, status: 'Resolved' }),
      // Only the fields the severity rule reads — no citizen data.
      Complaint.find(IN_WORKFLOW).select('title description severity -_id').lean()
    ])

    // "Critical" uses the same effective severity as the priority queue,
    // so a complaint escalated by a safety rule (e.g. a live wire filed
    // as Medium) is counted here too.
    const critical = severityRows.filter(row => getEffectiveSeverity(row) === 'Critical').length

    res.json({ total, pending, inProgress, resolved, critical })

  } catch (error) {

    console.error('Statistics error:', error)

    res.status(500).json({ message: 'Failed to fetch complaint statistics.' })

  }

})


// ======================================
// GET ALL COMPLAINTS (admin only — includes citizen contact info)
//
// Returns complaints in the processing workflow (everything except
// complaints an administrator rejected); pass ?moderation=all to include
// rejected ones too.
// ======================================

router.get('/', requireAuth, requireRole('admin'), async (req, res) => {

  try {

    const filter = req.query.moderation === 'all' ? {} : IN_WORKFLOW

    const complaints = await Complaint.find(filter).sort({ createdAt: -1 })

    const now = Date.now()

    // priorityRank = position in the Max Heap drain order (1 = most
    // urgent). Only active, in-workflow complaints get one. The
    // dashboard sorts by this instead of re-implementing the comparator.
    const rankById = new Map(
      rankByPriority(complaints.filter(isInWorkflow), now).map((ranked, index) => [ranked.id, index + 1])
    )

    res.json(complaints.map(complaint => {
      const obj = withLivePriority(complaint, now)
      obj.priorityRank = rankById.get(complaint.id) ?? null
      return obj
    }))

  } catch (error) {

    console.error('Error fetching complaints:', error)

    res.status(500).json({ message: 'Failed to fetch complaints.' })

  }

})


// ======================================
// MY COMPLAINTS (citizen — their own submissions only)
// ======================================

router.get('/mine', requireAuth, async (req, res) => {

  try {

    const complaints = await Complaint.find({ citizenId: req.user.id }).sort({ createdAt: -1 })

    const now = Date.now()

    res.json(complaints.map(complaint => toOwnerView(withLivePriority(complaint, now))))

  } catch (error) {

    console.error('Error fetching citizen complaints:', error)

    res.status(500).json({ message: 'Failed to fetch your complaints.' })

  }

})


// ======================================
// PRIORITY COMPLAINTS — MAX HEAP (admin only)
// The DSA showcase endpoint: eligible complaints are built into a max
// heap keyed by safety escalation, then live priority score (see
// dsaEngines.js), and drained highest-first.
// ======================================

router.get('/priority', requireAuth, requireRole('admin'), async (req, res) => {

  try {

    const includeResolved = req.query.includeResolved === 'true'

    const filter = includeResolved ? { ...IN_WORKFLOW } : { ...IN_WORKFLOW, status: { $ne: 'Resolved' } }

    // Rejected complaints never enter the Max Heap; rankByPriority()
    // also skips resolved ones.
    const complaints = await Complaint.find(filter)

    const now = Date.now()

    const rankedComplaints = rankByPriority(complaints, now)

    const mostUrgent = peekHighestPriority(complaints, now)

    res.json({
      message: 'Complaints ranked using Max Heap Priority Queue',
      complaints: rankedComplaints,
      mostUrgent
    })

  } catch (error) {

    console.error('Priority integration error:', error)

    res.status(500).json({ message: 'Failed to process complaints.' })

  }

})


// ======================================
// COMPLAINT PROCESSING QUEUE — FIFO
// ======================================
//
// FIFO Queue is used for processing order.
//
// Important distinction:
//
// MAX HEAP:
//   Decides which complaint is more urgent.
//
// FIFO QUEUE:
//   Maintains arrival/processing order.
//
// The FIFO queue does NOT replace the Priority Queue.
//
// This endpoint returns active complaints in FIFO order
// and also calculates their CURRENT priority information
// for display.
//
// ======================================

router.get(
  '/queue',
  requireAuth,
  requireRole('admin'),
  async (req, res) => {

    try {

      // ============================================
      // 1. GET ONLY ACTIVE COMPLAINTS
      // ============================================
      //
      // Resolved complaints should not enter the
      // active processing queue.
      //
      // createdAt ascending means:
      //
      // oldest complaint
      //        ↓
      // newest complaint
      //
      // This gives us the arrival order for FIFO.
      //

      const complaints =
        await Complaint.find({
          ...IN_WORKFLOW,
          status: {
            $ne: 'Resolved'
          }
        }).sort({
          createdAt: 1
        })


      // ============================================
      // 2. SEND COMPLAINTS THROUGH FIFO QUEUE
      // ============================================
      //
      // processQueue() uses ComplaintQueue.
      //
      // First complaint entered
      //        ↓
      // first complaint processed
      //
      // ============================================

      const processedComplaints =
        processQueue(
          complaints
        )


      // ============================================
      // 3. PREPARE QUEUE RESPONSE
      // ============================================
      //
      // IMPORTANT:
      //
      // We calculate priority LIVE here.
      //
      // We do NOT use:
      //
      // complaint.priority
      //
      // because that value may be the old stored
      // priority from the time the complaint was created.
      //
      // ============================================

      const now = Date.now()

      const queueComplaints =
        processedComplaints.map(
          (
            complaint,
            index
          ) => {

            // Same priority fields as the Max Heap entries.
            const {
              priority,
              priorityScore,
              basePriorityScore,
              priorityTier,
              urgencyLevel,
              safetyEscalation,
              effectiveSeverity
            } = attachPriority(complaint, now)


            return {

              // FIFO position
              position:
                index + 1,


              // Complaint information
              id:
                complaint.id,

              title:
                complaint.title,

              category:
                complaint.category,


              // Original citizen-selected severity
              severity:
                complaint.severity,


              // Severity after safety-rule checking
              //
              // Example:
              //
              // severity = Medium
              // description = "exposed live wire"
              //
              // effectiveSeverity = Critical
              //
              effectiveSeverity,


              // Effective priority score, 0-100
              priority,

              priorityScore,

              basePriorityScore,


              // Urgency band
              //
              // Critical = 4 (80-100)
              // High     = 3 (60-79)
              // Medium   = 2 (35-59)
              // Low      = 1 (0-34)
              //
              priorityTier,

              urgencyLevel,

              safetyEscalation,


              // Current status
              status:
                complaint.status,


              // Used to show arrival time
              createdAt:
                complaint.createdAt

            }

          }
        )


      // ============================================
      // 4. SEND RESPONSE
      // ============================================

      res.json({

        message:
          'Complaints processed using FIFO Queue',

        queue:
          queueComplaints

      })


    } catch (error) {

      console.error(
        'Queue integration error:',
        error
      )


      res.status(500).json({

        message:
          'Failed to process complaint queue.'

      })

    }

  }
)

// ======================================
// SUBMIT COMPLAINT (citizen only, multipart with optional images)
// ======================================

router.post('/', requireAuth, requireRole('citizen'), submitRateLimit, upload.array('images', 5), async (req, res) => {

  try {

    const { title, category, description, location, severity, latitude, longitude, mobile } = req.body

    if (!title || !category || !description || !location || !severity) {

      return res.status(400).json({ message: 'Please provide all required complaint details.' })

    }

    if ([title, description, location].some(value => typeof value !== 'string') ||
        (mobile !== undefined && typeof mobile !== 'string')) {
      return res.status(400).json({ message: 'Complaint details must be plain text.' })
    }

    if (!ALLOWED_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: 'Invalid category selected.' })
    }

    if (!ALLOWED_SEVERITIES.includes(severity)) {
      return res.status(400).json({ message: 'Invalid severity level selected.' })
    }

    const latitudeValue = parseOptionalCoordinate(latitude, -90, 90)
    const longitudeValue = parseOptionalCoordinate(longitude, -180, 180)

    if (latitudeValue === null) {
      return res.status(400).json({ message: 'Latitude must be a valid number between -90 and 90.' })
    }

    if (longitudeValue === null) {
      return res.status(400).json({ message: 'Longitude must be a valid number between -180 and 180.' })
    }

    // ==================================
    // CITIZEN MOBILE NUMBER
    //
    // A number typed on the form is validated and normalized. When the
    // form sends none, the number already saved on the citizen's account
    // is reused, so it is never collected twice. Optional at the API
    // level so older clients keep working; the form asks for it.
    // ==================================

    let citizenMobile

    const hasMobileInput = typeof mobile === 'string' && mobile.trim() !== ''

    if (hasMobileInput) {

      citizenMobile = normalizeIndianMobile(mobile)

      if (!citizenMobile) {
        return res.status(400).json({
          message: 'Please enter a valid 10-digit Indian mobile number (starting with 6, 7, 8 or 9).'
        })
      }

    }

    const citizen = await User.findById(req.user.id).select('mobile mobileVerified')

    if (citizen) {

      if (!citizenMobile) {

        citizenMobile = citizen.mobile

      } else if (!citizen.mobile || (!citizen.mobileVerified && citizen.mobile !== citizenMobile)) {

        // Save the number to the profile for reuse. A VERIFIED profile
        // number is never silently replaced by an unverified one.
        await User.updateOne(
          { _id: citizen._id },
          { $set: { mobile: citizenMobile, mobileVerified: false }, $unset: { mobileVerifiedAt: 1 } }
        )

      }

    }

    const citizenMobileVerified = Boolean(
      citizen && citizenMobile && citizen.mobileVerified && citizen.mobile === citizenMobile
    )

    // ==================================
    // MODERATION + SUSPICIOUS-SUBMISSION CHECK (separate from priority)
    //
    // Content checks plus duplicate / burst / location rules. The result
    // is recorded on the complaint as advisory audit information only:
    // the admin review panel has been retired, so a signal no longer
    // holds the complaint back. Every complaint enters the workflow, and
    // nothing here ever rejects a complaint or changes its priority.
    // ==================================

    const contentCheck = moderateComplaint({ title, description })

    const suspicion = await assessSubmission(Complaint, {
      candidate: { title, description, category, location, latitude: latitudeValue, longitude: longitudeValue },
      citizenId: req.user.id,
      moderation: contentCheck
    })

    const moderation = {
      status: 'approved',
      reason: suspicion.flagged
        ? `Admitted automatically. Advisory signals recorded: ${suspicion.signals.map(signal => signal.reason).join(' ')}`
        : '',
      flags: [...new Set([...contentCheck.flags, ...suspicion.signals.map(signal => signal.rule)])]
    }

    // ==================================
    // UPLOAD IMAGES TO CLOUDINARY
    // ==================================

    const files = req.files || []

    const images = await Promise.all(
      files.map(file => uploadBuffer(file.buffer, 'civicpulse/complaints'))
    )

    const complaintId = await generateUniqueComplaintId()

    // Base priority (severity + hazard + evidence, 0-100) fixed at
    // submission. Waiting time is added live on every read.
    const priority = calculateBasePriority({ title, description, severity, images }).score

    const complaint = new Complaint({

      id: complaintId,
      title,
      category,
      description,
      location,
      latitude: latitudeValue,
      longitude: longitudeValue,
      severity,
      status: 'Pending',
      priority,
      images,

      citizenId: req.user.id,
      citizenName: req.user.name,
      citizenEmail: req.user.email,
      citizenMobile,
      citizenMobileVerified: citizenMobile ? citizenMobileVerified : undefined,

      moderationStatus: moderation.status,
      moderationReason: moderation.reason,
      moderationFlags: moderation.flags,
      suspicion,
      moderationHistory: [
        {
          decision: moderation.status,
          reason: moderation.reason,
          actor: 'system',
          timestamp: new Date()
        }
      ],
      workflowEnteredAt: new Date(),

      history: [
        {
          status: 'Pending',
          timestamp: new Date(),
          description: 'Complaint submitted by citizen.'
        }
      ]

    })

    await complaint.save()

    // ==================================
    // IN-APP NOTIFICATIONS (dedupe keys make these idempotent)
    // ==================================

    // At most one SMS per submission ("registered").
    await notifyCitizen({ complaint, type: 'complaint_registered', sms: true })

    await notifyCitizen({ complaint, type: 'complaint_approved', sms: false })

    const responseComplaint = complaint.toObject()

    if (responseComplaint.citizenMobile) {
      responseComplaint.citizenMobileMasked = maskMobile(responseComplaint.citizenMobile)
    }

    res.status(201).json({
      message: 'Complaint submitted successfully.',
      complaint: toOwnerView(responseComplaint),
      moderation: { status: moderation.status, reason: '' }
    })

  } catch (error) {

    console.error('Error saving complaint:', error)

    res.status(500).json({ message: 'Failed to save complaint.' })

  }

})


// ======================================
// UPDATE COMPLAINT STATUS (admin only)
// ======================================

router.put('/:id/status', requireAuth, requireRole('admin'), validateComplaintIdFormat, async (req, res) => {

  try {

    const { status } = req.body

    const allowedStatuses = ['Pending', 'In Progress', 'Resolved']

    if (!allowedStatuses.includes(status)) {

      return res.status(400).json({ message: 'Invalid status. Use Pending, In Progress or Resolved.' })

    }

    const complaint = await Complaint.findOne({ id: req.params.id })

    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found.' })
    }

    // An administrator's earlier rejection is respected.
    if (!isInWorkflow(complaint)) {
      return res.status(409).json({
        message: 'This complaint was rejected during moderation and cannot be processed.'
      })
    }

    const isRealTransition = complaint.status !== status

    // A complaint still marked "needs_review" from before the review
    // panel was retired is admitted the first time an administrator
    // actually changes its status, with an audit entry. Its priority is
    // untouched.
    if (complaint.moderationStatus === 'needs_review' && isRealTransition) {

      const now = new Date()
      const reason = `Admitted to processing when an administrator changed its status to ${status}.`

      complaint.moderationStatus = 'approved'
      complaint.moderationReason = reason

      if (!complaint.workflowEnteredAt) complaint.workflowEnteredAt = now

      complaint.moderationHistory.push({
        decision: 'approved',
        reason,
        actor: 'admin',
        adminId: req.user.id,
        adminEmail: req.user.email,
        timestamp: now
      })

    }

    complaint.status = status

    if (!Array.isArray(complaint.history)) {
      complaint.history = []
    }

    // Only a genuine status change gets a history entry — re-selecting
    // the status a complaint is already in (e.g. Pending -> Pending)
    // would otherwise log a fake transition that never happened.
    if (isRealTransition) {

      complaint.history.push({
        status,
        timestamp: new Date(),
        description: `Complaint status changed to ${status}.`
      })

    }

    await complaint.save()

    // Notify only on a genuine transition. Keyed by the new history
    // entry's id, so a retried request (which creates no new entry)
    // can't produce a duplicate notification.
    const statusNotification = {
      Pending: 'status_reopened',
      'In Progress': 'status_in_progress',
      Resolved: 'status_resolved'
    }[status]

    if (isRealTransition && statusNotification) {

      const entry = complaint.history[complaint.history.length - 1]

      await notifyCitizen({
        complaint,
        type: statusNotification,
        dedupeKey: `${complaint.id}:status:${entry._id}`
      })

    }

    res.json({ message: 'Complaint status updated successfully.', complaint })

  } catch (error) {

    console.error('Status update error:', error)

    res.status(500).json({ message: 'Failed to update complaint status.' })

  }

})


// ======================================
// COMPLAINT HISTORY — LINKED LIST (Track Complaint — owner or admin only)
// ======================================

router.get('/:id/history', requireAuth, validateComplaintIdFormat, async (req, res) => {

  try {

    const complaint = await Complaint.findOne({ id: req.params.id })

    if (!complaint || !isComplaintOwner(complaint, req.user)) {
      return res.status(COMPLAINT_NOT_FOUND_FOR_USER.status).json({ message: COMPLAINT_NOT_FOUND_FOR_USER.message })
    }

    if (!Array.isArray(complaint.history) || complaint.history.length === 0) {

      complaint.history = [
        {
          status: 'Pending',
          timestamp: complaint.createdAt || new Date(),
          description: 'Complaint was submitted.'
        }
      ]

      await complaint.save()

    }

    const historyResult = buildHistoryTimeline(complaint.history)

    res.json({ message: 'Complaint history processed using Linked List', history: historyResult })

  } catch (error) {

    console.error('History integration error:', error)

    res.status(500).json({ message: 'Failed to process complaint history.' })

  }

})


// ======================================
// RESPONSE ROUTE — DIJKSTRA SHORTEST PATH (admin only)
//
// Full technical detail for the admin's "Response Route" panel: the
// resolved source/destination, the Dijkstra path, distance/ETA, and a
// snapshot of the graph itself so the frontend can draw the real
// network. Scoped entirely to THIS complaint — the response source is
// always the Municipal Office and the destination is always this
// complaint's own location; no other complaint's data is ever computed,
// stored, or returned here.
// ======================================

router.get('/:id/route', requireAuth, requireRole('admin'), validateComplaintIdFormat, async (req, res) => {

  try {

    const complaint = await Complaint.findOne({ id: req.params.id })

    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found.' })
    }

    const response = computeResponse(complaint)

    if (!response) {

      return res.json({
        message: 'Route unavailable for this location.',
        route: null,
        graph: getGraphSnapshot()
      })

    }

    res.json({
      message: 'Route calculated using Dijkstra shortest path',
      route: response,
      graph: getGraphSnapshot()
    })

  } catch (error) {

    console.error('Route calculation error:', error)

    res.status(500).json({ message: 'Failed to calculate response route.' })

  }

})


// ======================================
// RESPONSE STATUS (citizen-facing — no graph/route internals)
//
// Same Dijkstra/BFS computation as /:id/route, but the response is
// reduced to what a citizen actually needs: is a response route
// available, how far, how soon. No node names, no path, no algorithm
// terminology — the graph stays entirely behind the scenes here.
//
// Owner-or-admin only, same as GET /:id and /:id/history — response
// timing is still complaint-specific information, so a Complaint ID
// alone must not unlock it for anyone who isn't the owner.
// ======================================

router.get('/:id/response-status', requireAuth, validateComplaintIdFormat, async (req, res) => {

  try {

    const complaint = await Complaint.findOne({ id: req.params.id })

    if (!complaint || !isComplaintOwner(complaint, req.user)) {
      return res.status(COMPLAINT_NOT_FOUND_FOR_USER.status).json({ message: COMPLAINT_NOT_FOUND_FOR_USER.message })
    }

    const response = computeResponse(complaint)

    res.json({
      message: 'Response status calculated',
      status: response
        ? { available: true, distanceKm: response.distanceKm, etaMinutes: response.etaMinutes }
        : { available: false }
    })

  } catch (error) {

    console.error('Response status error:', error)

    res.status(500).json({ message: 'Failed to calculate response status.' })

  }

})


// ======================================
// GET COMPLAINT BY ID (Track Complaint — owner or admin only)
//
// Complaint ID alone is NOT authorization: it's a human-shareable
// tracking number, not a secret token. Every request here must carry a
// valid JWT (requireAuth), and the requester must either own the
// complaint (citizenId matches) or be an admin — enforced entirely on
// the backend, never left to the frontend to hide fields. A complaint
// that exists but belongs to someone else is answered identically to
// one that doesn't exist at all (see COMPLAINT_NOT_FOUND_FOR_USER) so
// the response never confirms another user's Complaint ID is real.
// ======================================

router.get('/:id', requireAuth, validateComplaintIdFormat, async (req, res) => {

  try {

    const complaint = await Complaint.findOne({ id: req.params.id })

    if (!complaint || !isComplaintOwner(complaint, req.user)) {
      return res.status(COMPLAINT_NOT_FOUND_FOR_USER.status).json({ message: COMPLAINT_NOT_FOUND_FOR_USER.message })
    }

    res.json(toPublicComplaint(withLivePriority(complaint, Date.now())))

  } catch (error) {

    console.error('GET COMPLAINT ERROR:', error)

    res.status(500).json({ message: 'Failed to fetch complaint.' })

  }

})

module.exports = router
