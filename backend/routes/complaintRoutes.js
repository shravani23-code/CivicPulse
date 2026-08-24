const express = require('express')
const multer = require('multer')
const Complaint = require('../models/Complaint')
const { requireAuth, requireRole } = require('../middleware/auth')
const { uploadBuffer } = require('../utils/cloudinary')
const {
  severityScore,
  computePriorityScore,
  rankByPriority,
  peekHighestPriority,
  buildHistoryTimeline,
  processQueue
} = require('../dsaEngines')

const router = express.Router()

const COMPLAINT_ID_REGEX = /^CP\d{8}$/

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

// Strips fields that shouldn't be exposed on public (unauthenticated) routes.
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
// COMPLAINT PROCESSING QUEUE — FIFO (admin only)
// ======================================

router.get('/queue', requireAuth, requireRole('admin'), async (req, res) => {

  try {

    const complaints = await Complaint.find({ status: { $ne: 'Resolved' } }).sort({ createdAt: 1 })

    const queueComplaints = processQueue(complaints).map((complaint, index) => ({
      position: index + 1,
      id: complaint.id,
      title: complaint.title,
      category: complaint.category,
      severity: complaint.severity,
      priority: complaint.priority,
      status: complaint.status,
      createdAt: complaint.createdAt
    }))

    res.json({ message: 'Complaints processed using FIFO Queue', queue: queueComplaints })

  } catch (error) {

    console.error('Queue integration error:', error)

    res.status(500).json({ message: 'Failed to process complaint queue.', error: error.message })

  }

})


// ======================================
// SUBMIT COMPLAINT (citizen only, multipart with optional images)
// ======================================

router.post('/', requireAuth, upload.array('images', 5), async (req, res) => {

  try {

    const { title, category, description, location, severity, latitude, longitude } = req.body

    if (!title || !category || !description || !location || !severity) {

      return res.status(400).json({ message: 'Please provide all required complaint details.' })

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

    const latitudeValue = latitude !== undefined && latitude !== '' ? Number(latitude) : undefined
    const longitudeValue = longitude !== undefined && longitude !== '' ? Number(longitude) : undefined

    const complaint = new Complaint({

      id: complaintId,
      title,
      category,
      description,
      location,
      latitude: Number.isFinite(latitudeValue) ? latitudeValue : undefined,
      longitude: Number.isFinite(longitudeValue) ? longitudeValue : undefined,
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

    complaint.status = status

    if (!Array.isArray(complaint.history)) {
      complaint.history = []
    }

    complaint.history.push({
      status,
      timestamp: new Date(),
      description: `Complaint status changed to ${status}.`
    })

    await complaint.save()

    res.json({ message: 'Complaint status updated successfully.', complaint })

  } catch (error) {

    console.error('Status update error:', error)

    res.status(500).json({ message: 'Failed to update complaint status.', error: error.message })

  }

})


// ======================================
// COMPLAINT HISTORY — LINKED LIST (public)
// ======================================

router.get('/:id/history', validateComplaintIdFormat, async (req, res) => {

  try {

    const complaint = await Complaint.findOne({ id: req.params.id })

    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found.' })
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
// GET COMPLAINT BY ID (public — citizen contact info stripped)
// ======================================

router.get('/:id', validateComplaintIdFormat, async (req, res) => {

  try {

    const complaint = await Complaint.findOne({ id: req.params.id })

    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found.' })
    }

    res.json(toPublicComplaint(withLivePriority(complaint)))

  } catch (error) {

    console.error('GET COMPLAINT ERROR:', error)

    res.status(500).json({ message: 'Failed to fetch complaint.', error: error.message })

  }

})

module.exports = router
