// End-to-end route tests against a THROWAWAY local MongoDB.
//
// Skipped unless MONGODB_TEST_URI is set, and refuses to run against
// anything that is not on localhost / 127.0.0.1 — these tests create
// and drop data, so they must never touch the real database.
//
//   MONGODB_TEST_URI=mongodb://127.0.0.1:27017/civicpulse-test npm test

const test = require('node:test')
const assert = require('node:assert/strict')

const TEST_URI = process.env.MONGODB_TEST_URI || ''
const IS_LOCAL = /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(TEST_URI)

if (!IS_LOCAL) {

  test('integration tests (skipped: set MONGODB_TEST_URI to a local test database)', { skip: true }, () => {})

} else {

  process.env.JWT_SECRET = 'integration-test-secret'

  // Never send SMS or upload images from tests.
  delete process.env.SMS_PROVIDER

  const mongoose = require('mongoose')
  const jwt = require('jsonwebtoken')
  const app = require('../server')
  const User = require('../models/User')
  const Complaint = require('../models/Complaint')
  const Notification = require('../models/Notification')
  const { resetRateLimits } = require('../middleware/rateLimit')

  let server
  let baseUrl
  let admin
  let citizenA
  let citizenB

  const tokenOf = user => jwt.sign(
    { id: user._id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET
  )

  async function api(method, path, { token, json, form } = {}) {

    const headers = {}

    if (token) headers.Authorization = `Bearer ${token}`

    let body

    if (json !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(json)
    } else if (form) {
      body = new FormData()
      for (const [key, value] of Object.entries(form)) body.append(key, value)
    }

    const response = await fetch(baseUrl + path, { method, headers, body })
    const data = await response.json().catch(() => null)

    return { status: response.status, data }

  }

  const submit = (user, fields) => api('POST', '/api/complaints', {
    token: tokenOf(user),
    form: {
      title: 'Pothole on main road',
      category: 'Road',
      description: 'There is a large pothole near the bus stop causing accidents for two wheelers',
      location: 'Shivaji Nagar',
      severity: 'Medium',
      ...fields
    }
  })

  test.before(async () => {

    await mongoose.connect(TEST_URI)
    await mongoose.connection.dropDatabase()
    await Promise.all([User.init(), Complaint.init(), Notification.init()])

    admin = await User.create({ name: 'Admin', email: 'admin@test.local', passwordHash: 'x', role: 'admin' })
    citizenA = await User.create({ name: 'Asha', email: 'asha@test.local', passwordHash: 'x', role: 'citizen' })
    citizenB = await User.create({ name: 'Bala', email: 'bala@test.local', passwordHash: 'x', role: 'citizen' })

    server = app.listen(0)
    await new Promise(resolve => server.once('listening', resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}`

  })

  test.beforeEach(() => resetRateLimits())

  test.after(async () => {
    await new Promise(resolve => server.close(resolve))
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
  })


  // ----------------------------------------------------------
  // Health
  // ----------------------------------------------------------

  test('health endpoint reports a connected database', async () => {
    const { status, data } = await api('GET', '/api/health')
    assert.equal(status, 200)
    assert.equal(data.database, 'connected')
  })


  // ----------------------------------------------------------
  // Registration + login + mobile
  // ----------------------------------------------------------

  test('registration: optional mobile is normalized, stored as a string, unverified', async () => {

    const withMobile = await api('POST', '/api/auth/register', {
      json: { name: 'Ravi', email: 'Ravi@Test.local', password: 'secret1', mobile: ' 098765 43210 ' }
    })

    assert.equal(withMobile.status, 201)
    assert.equal(withMobile.data.user.email, 'ravi@test.local')
    assert.equal(withMobile.data.user.mobile, undefined, 'mobile is not echoed back')

    const saved = await User.findOne({ email: 'ravi@test.local' }).lean()
    assert.equal(saved.mobile, '+919876543210')
    assert.equal(typeof saved.mobile, 'string')
    assert.equal(saved.mobileVerified, false)

    const blank = await api('POST', '/api/auth/register', {
      json: { name: 'Meera', email: 'meera@test.local', password: 'secret1', mobile: '   ' }
    })

    assert.equal(blank.status, 201)
    assert.equal((await User.findOne({ email: 'meera@test.local' }).lean()).mobile, undefined)

    const noField = await api('POST', '/api/auth/register', {
      json: { name: 'Old Client', email: 'old@test.local', password: 'secret1' }
    })

    assert.equal(noField.status, 201)

  })

  test('registration: invalid mobile and duplicate email are rejected', async () => {

    const invalid = await api('POST', '/api/auth/register', {
      json: { name: 'X', email: 'x@test.local', password: 'secret1', mobile: '12345' }
    })

    assert.equal(invalid.status, 400)
    assert.equal(await User.exists({ email: 'x@test.local' }), null)

    const duplicate = await api('POST', '/api/auth/register', {
      json: { name: 'Ravi 2', email: 'RAVI@test.local', password: 'secret1' }
    })

    assert.equal(duplicate.status, 409)

  })

  test('login works for registered users and keeps citizen/admin portals separate', async () => {

    const ok = await api('POST', '/api/auth/login', { json: { email: 'ravi@test.local', password: 'secret1', role: 'citizen' } })
    assert.equal(ok.status, 200)
    assert.ok(ok.data.token)

    const wrongRole = await api('POST', '/api/auth/login', { json: { email: 'ravi@test.local', password: 'secret1', role: 'admin' } })
    assert.equal(wrongRole.status, 401)

    const wrongPassword = await api('POST', '/api/auth/login', { json: { email: 'ravi@test.local', password: 'nope', role: 'citizen' } })
    assert.equal(wrongPassword.status, 401)

  })

  test('existing user records without mobile fields still work with /me', async () => {

    const legacy = await User.collection.insertOne({
      name: 'Legacy', email: 'legacy@test.local', passwordHash: 'x', role: 'citizen', createdAt: new Date()
    })

    const { status, data } = await api('GET', '/api/auth/me', {
      token: tokenOf({ _id: legacy.insertedId, name: 'Legacy', email: 'legacy@test.local', role: 'citizen' })
    })

    assert.equal(status, 200)
    assert.equal(data.hasMobile, false)
    assert.equal(data.mobileMasked, null)

  })


  // ----------------------------------------------------------
  // Complaint submission + tracking + notifications
  // ----------------------------------------------------------

  let approvedId
  let reviewId

  test('genuine complaint is approved, masked, tracked and notified', async () => {

    const { status, data } = await submit(citizenA, { mobile: '9876543210' })

    assert.equal(status, 201)
    assert.equal(data.moderation.status, 'approved')
    assert.match(data.complaint.id, /^CP\d{8}$/)
    assert.equal(data.complaint.citizenMobile, undefined)
    assert.equal(data.complaint.citizenMobileMasked, '+91 ******3210')

    approvedId = data.complaint.id

    const stored = await Complaint.findOne({ id: approvedId }).lean()
    assert.equal(stored.citizenMobile, '+919876543210')

    // Owner can track; full mobile never returned to the citizen
    const own = await api('GET', `/api/complaints/${approvedId}`, { token: tokenOf(citizenA) })
    assert.equal(own.status, 200)
    assert.equal(own.data.citizenMobile, undefined)
    assert.equal(own.data.citizenMobileMasked, '+91 ******3210')

    // Another citizen gets the same 404 as a nonexistent ID
    const other = await api('GET', `/api/complaints/${approvedId}`, { token: tokenOf(citizenB) })
    const missing = await api('GET', '/api/complaints/CP99999999', { token: tokenOf(citizenB) })
    assert.equal(other.status, 404)
    assert.deepEqual(other.data, missing.data)

    const history = await api('GET', `/api/complaints/${approvedId}/history`, { token: tokenOf(citizenA) })
    assert.equal(history.status, 200)
    assert.equal(history.data.history[0].status, 'Pending')

    const notifications = await Notification.find({ complaintId: approvedId }).lean()
    assert.deepEqual(notifications.map(n => n.type).sort(), ['complaint_approved', 'complaint_registered'])
    assert.ok(notifications.every(n => String(n.recipientId) === String(citizenA._id)))

  })

  test('invalid mobile on the complaint form is rejected', async () => {
    const { status } = await submit(citizenA, { mobile: 'call me maybe' })
    assert.equal(status, 400)
  })

  test('complaint with promotional link is held for review, not ranked', async () => {

    const { status, data } = await submit(citizenB, {
      title: 'Garbage pile',
      description: 'Garbage not collected for a week near the market, see www.example.com for photos of the area'
    })

    assert.equal(status, 201)
    assert.equal(data.moderation.status, 'needs_review')

    reviewId = data.complaint.id

    const priority = await api('GET', '/api/complaints/priority', { token: tokenOf(admin) })
    assert.ok(!priority.data.complaints.some(c => c.id === reviewId))

    const statusChange = await api('PUT', `/api/complaints/${reviewId}/status`, { token: tokenOf(admin), json: { status: 'In Progress' } })
    assert.equal(statusChange.status, 409)

  })


  // ----------------------------------------------------------
  // Moderation
  // ----------------------------------------------------------

  test('moderation list returns real counts and the held complaint', async () => {

    const { status, data } = await api('GET', '/api/moderation/complaints?status=needs_review', { token: tokenOf(admin) })

    assert.equal(status, 200)
    assert.equal(data.counts.needsReview, 1)
    assert.equal(data.counts.rejected, 0)
    assert.deepEqual(data.complaints.map(c => c.id), [reviewId])

  })

  test('reject requires a reason; approve persists once and enters the heap', async () => {

    const noReason = await api('POST', `/api/moderation/complaints/${reviewId}/reject`, { token: tokenOf(admin), json: { reason: 'no' } })
    assert.equal(noReason.status, 400)

    const approve = await api('POST', `/api/moderation/complaints/${reviewId}/approve`, { token: tokenOf(admin), json: {} })
    assert.equal(approve.status, 200)

    const again = await api('POST', `/api/moderation/complaints/${reviewId}/approve`, { token: tokenOf(admin), json: {} })
    assert.equal(again.status, 409)

    const stored = await Complaint.findOne({ id: reviewId }).lean()
    assert.equal(stored.moderationStatus, 'approved')
    assert.ok(stored.workflowEnteredAt)
    assert.equal(stored.moderationHistory.at(-1).actor, 'admin')

    const priority = await api('GET', '/api/complaints/priority', { token: tokenOf(admin) })
    assert.ok(priority.data.complaints.some(c => c.id === reviewId))

    const approvedNotes = await Notification.countDocuments({ complaintId: reviewId, type: 'complaint_approved' })
    assert.equal(approvedNotes, 1, 'exactly one approval notification despite the repeated request')

  })

  test('rejecting a held complaint persists the reason and notifies the owner', async () => {

    const { data } = await submit(citizenB, {
      title: 'Drain issue',
      description: 'Drain overflowing near school, click here www.promo.example.com'
    })

    assert.equal(data.moderation.status, 'needs_review')

    const reject = await api('POST', `/api/moderation/complaints/${data.complaint.id}/reject`, {
      token: tokenOf(admin),
      json: { reason: 'Please remove the promotional link and resubmit.' }
    })

    assert.equal(reject.status, 200)

    const stored = await Complaint.findOne({ id: data.complaint.id }).lean()
    assert.equal(stored.moderationStatus, 'rejected')
    assert.equal(stored.moderationReason, 'Please remove the promotional link and resubmit.')

    const note = await Notification.findOne({ complaintId: data.complaint.id, type: 'complaint_rejected' }).lean()
    assert.match(note.message, /promotional link/)

    const list = await api('GET', '/api/moderation/complaints?status=rejected', { token: tokenOf(admin) })
    assert.equal(list.data.counts.rejected, 1)

  })


  // ----------------------------------------------------------
  // Status changes -> notifications
  // ----------------------------------------------------------

  test('status changes notify once per real transition', async () => {

    const token = tokenOf(admin)

    assert.equal((await api('PUT', `/api/complaints/${approvedId}/status`, { token, json: { status: 'In Progress' } })).status, 200)
    assert.equal((await api('PUT', `/api/complaints/${approvedId}/status`, { token, json: { status: 'In Progress' } })).status, 200)
    assert.equal((await api('PUT', `/api/complaints/${approvedId}/status`, { token, json: { status: 'Resolved' } })).status, 200)
    assert.equal((await api('PUT', `/api/complaints/${approvedId}/status`, { token, json: { status: 'Pending' } })).status, 200)
    assert.equal((await api('PUT', `/api/complaints/${approvedId}/status`, { token, json: { status: 'Closed' } })).status, 400)

    const types = (await Notification.find({ complaintId: approvedId }).sort({ createdAt: 1 }).lean()).map(n => n.type)

    assert.equal(types.filter(t => t === 'status_in_progress').length, 1)
    assert.equal(types.filter(t => t === 'status_resolved').length, 1)
    assert.equal(types.filter(t => t === 'status_reopened').length, 1)

  })


  // ----------------------------------------------------------
  // Notifications authorization
  // ----------------------------------------------------------

  test('citizens only see and modify their own notifications', async () => {

    const listA = await api('GET', '/api/notifications', { token: tokenOf(citizenA) })
    const listB = await api('GET', '/api/notifications', { token: tokenOf(citizenB) })

    assert.equal(listA.status, 200)
    assert.ok(listA.data.notifications.length > 0)
    assert.ok(listA.data.notifications.every(n => n.complaintId === approvedId))
    assert.ok(listB.data.notifications.every(n => n.complaintId !== approvedId))

    const aNotification = listA.data.notifications[0]

    const steal = await api('PATCH', `/api/notifications/${aNotification._id}/read`, { token: tokenOf(citizenB) })
    assert.equal(steal.status, 404)
    assert.equal((await Notification.findById(aNotification._id).lean()).read, false)

    const own = await api('PATCH', `/api/notifications/${aNotification._id}/read`, { token: tokenOf(citizenA) })
    assert.equal(own.status, 200)
    assert.equal(own.data.notification.read, true)

    const before = (await api('GET', '/api/notifications/unread-count', { token: tokenOf(citizenA) })).data.unreadCount
    await api('PATCH', '/api/notifications/read-all', { token: tokenOf(citizenA) })
    const after = (await api('GET', '/api/notifications/unread-count', { token: tokenOf(citizenA) })).data.unreadCount

    assert.ok(before > 0)
    assert.equal(after, 0)

    const badId = await api('PATCH', '/api/notifications/not-an-id/read', { token: tokenOf(citizenA) })
    assert.equal(badId.status, 404)

  })

  test('a user with no notifications gets an empty list, not an error', async () => {
    const lonely = await User.create({ name: 'New', email: 'new@test.local', passwordHash: 'x', role: 'citizen' })
    const { status, data } = await api('GET', '/api/notifications', { token: tokenOf(lonely) })
    assert.equal(status, 200)
    assert.deepEqual(data, { notifications: [], unreadCount: 0 })
  })


  // ----------------------------------------------------------
  // Priority consistency across endpoints
  // ----------------------------------------------------------

  test('dashboard list, priority endpoint and most-urgent card agree', async () => {

    // A Medium complaint describing a live wire must rank as Critical.
    const { data } = await submit(citizenA, {
      title: 'Wire problem',
      description: 'There is an exposed live wire hanging over the road near the school gate',
      severity: 'Low',
      category: 'Streetlight'
    })

    const safetyId = data.complaint.id

    const token = tokenOf(admin)
    const [all, priority, stats] = await Promise.all([
      api('GET', '/api/complaints', { token }),
      api('GET', '/api/complaints/priority', { token }),
      api('GET', '/api/complaints/stats')
    ])

    const ranked = priority.data.complaints

    assert.equal(priority.data.mostUrgent.id, ranked[0].id)
    assert.equal(ranked[0].id, safetyId)
    assert.equal(ranked[0].effectiveSeverity, 'Critical')

    // priorityRank on the dashboard list follows the heap drain order
    const byRank = all.data.filter(c => c.priorityRank !== null).sort((a, b) => a.priorityRank - b.priorityRank)
    assert.deepEqual(byRank.map(c => c.id), ranked.map(c => c.id))

    // The same complaint carries identical priority fields everywhere
    for (const heapEntry of ranked) {
      const listed = all.data.find(c => c.id === heapEntry.id)
      assert.equal(listed.priorityTier, heapEntry.priorityTier)
      assert.equal(listed.priority, heapEntry.priority)
      assert.equal(listed.effectiveSeverity, heapEntry.effectiveSeverity)
      assert.equal(listed.effectiveTierLabel, heapEntry.effectiveTierLabel)
    }

    // Public stats: real counts, workflow-only, effective Critical
    const workflow = await Complaint.countDocuments({ moderationStatus: { $nin: ['needs_review', 'rejected'] } })
    assert.equal(stats.status, 200)
    assert.equal(stats.data.total, workflow)
    assert.equal(stats.data.critical, 1)
    assert.equal(stats.data.pending + stats.data.inProgress + stats.data.resolved, stats.data.total)

  })

}
