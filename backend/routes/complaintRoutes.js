const express = require('express')
const multer = require('multer')
const Complaint = require('../models/Complaint')
const { requireAuth, requireRole } = require('../middleware/auth')
const { uploadBuffer } = require('../utils/cloudinary')
const {
  severityScore,
  computePriorityScore,
  calculatePriority,
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
      return callback(new Error('Only JPEG, PNG, WEBP or GIF images are allowed.'))
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

  return publicFields

}

// Returns a complaint's live priority score without persisting it —
// severity is fixed, but priority grows with waiting time on every read.
function withLivePriority(complaint) {

  const obj = complaint.toObject()

  obj.priority = computePriorityScore(complaint)

  return obj

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

    const total = await Complaint.countDocuments()
    const pending = await Complaint.countDocuments({ status: 'Pending' })
    const inProgress = await Complaint.countDocuments({ status: 'In Progress' })
    const resolved = await Complaint.countDocuments({ status: 'Resolved' })
    const critical = await Complaint.countDocuments({ severity: 'Critical' })

    res.json({ total, pending, inProgress, resolved, critical })

  } catch (error) {

    console.error('Statistics error:', error)

    res.status(500).json({ message: 'Failed to fetch complaint statistics.', error: error.message })

  }

})


// ======================================
// GET ALL COMPLAINTS (admin only — includes citizen contact info)
// ======================================

router.get('/', requireAuth, requireRole('admin'), async (req, res) => {

  try {

    const complaints = await Complaint.find().sort({ createdAt: -1 })

    res.json(complaints.map(withLivePriority))

  } catch (error) {

    console.error('Error fetching complaints:', error)

    res.status(500).json({ message: 'Failed to fetch complaints.', error: error.message })

  }

})


// ======================================
// MY COMPLAINTS (citizen — their own submissions only)
// ======================================

router.get('/mine', requireAuth, async (req, res) => {

  try {

    const complaints = await Complaint.find({ citizenId: req.user.id }).sort({ createdAt: -1 })

    res.json(complaints.map(withLivePriority))

  } catch (error) {

    console.error('Error fetching citizen complaints:', error)

    res.status(500).json({ message: 'Failed to fetch your complaints.', error: error.message })

  }

})


// ======================================
// PRIORITY COMPLAINTS — MAX HEAP (admin only)
// The DSA showcase endpoint: complaints are pushed into a max heap keyed
// by their live priority score and drained highest-first.
// ======================================

router.get('/priority', requireAuth, requireRole('admin'), async (req, res) => {

  try {

    const includeResolved = req.query.includeResolved === 'true'

    const filter = includeResolved ? {} : { status: { $ne: 'Resolved' } }

    const complaints = await Complaint.find(filter)

    const rankedComplaints = rankByPriority(complaints)

    const mostUrgent = peekHighestPriority(
      complaints.filter(c => c.status !== 'Resolved')
    )

    res.json({
      message: 'Complaints ranked using Max Heap Priority Queue',
      complaints: rankedComplaints,
      mostUrgent
    })

  } catch (error) {

    console.error('Priority integration error:', error)

    res.status(500).json({ message: 'Failed to process complaints.', error: error.message })

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

      const queueComplaints =
        processedComplaints.map(
          (
            complaint,
            index
          ) => {

            const priority =
              calculatePriority(
                complaint
              )


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
              effectiveSeverity:
                priority.effectiveSeverity,


              // Convenient display value
              //
              // Example:
              //
              // Critical + score 20 = 420
              // High + score 20     = 320
              //
              priority:
                priority.displayPriority,


              // Actual priority tier
              //
              // Critical = 4
              // High     = 3
              // Medium   = 2
              // Low      = 1
              //
              priorityTier:
                priority.tier,


              // Score within the tier
              priorityScore:
                priority.score,


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
          'Failed to process complaint queue.',

        error:
          error.message

      })

    }

  }
)

// ======================================
// SUBMIT COMPLAINT (citizen only, multipart with optional images)
// ======================================

router.post('/', requireAuth, requireRole('citizen'), upload.array('images', 5), async (req, res) => {

  try {

    const { title, category, description, location, severity, latitude, longitude } = req.body

    if (!title || !category || !description || !location || !severity) {

      return res.status(400).json({ message: 'Please provide all required complaint details.' })

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
    // UPLOAD IMAGES TO CLOUDINARY
    // ==================================

    const files = req.files || []

    const images = await Promise.all(
      files.map(file => uploadBuffer(file.buffer, 'civicpulse/complaints'))
    )

    const complaintId = await generateUniqueComplaintId()

    const priority = severityScore(severity)

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

      history: [
        {
          status: 'Pending',
          timestamp: new Date(),
          description: 'Complaint submitted by citizen.'
        }
      ]

    })

    await complaint.save()

    res.status(201).json({
      message: 'Complaint submitted successfully.',
      complaint
    })

  } catch (error) {

    console.error('Error saving complaint:', error)

    res.status(500).json({ message: 'Failed to save complaint.', error: error.message })

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

    const isRealTransition = complaint.status !== status

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

    res.json({ message: 'Complaint status updated successfully.', complaint })

  } catch (error) {

    console.error('Status update error:', error)

    res.status(500).json({ message: 'Failed to update complaint status.', error: error.message })

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

    res.status(500).json({ message: 'Failed to process complaint history.', error: error.message })

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

    res.status(500).json({ message: 'Failed to calculate response route.', error: error.message })

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

    res.status(500).json({ message: 'Failed to calculate response status.', error: error.message })

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

    res.json(toPublicComplaint(withLivePriority(complaint)))

  } catch (error) {

    console.error('GET COMPLAINT ERROR:', error)

    res.status(500).json({ message: 'Failed to fetch complaint.', error: error.message })

  }

})

module.exports = router
