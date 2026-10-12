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

  // A complaint stored as "needs_review" — the state the retired admin
  // review panel used to hold complaints in. Only legacy data can be in
  // this state now; the moderation API still handles it.
  let heldCounter = 0

  async function seedHeld(user, fields = {}) {
    heldCounter += 1
    return Complaint.create({
      id: `CP7${String(heldCounter).padStart(7, '0')}`,
      title: 'Garbage pile',
      category: 'Garbage',
      description: 'Garbage not collected for a week near the market',
      location: 'Shivaji Nagar',
      severity: 'Medium',
      status: 'Pending',
      citizenId: user._id,
      citizenName: user.name,
      citizenEmail: user.email,
      moderationStatus: 'needs_review',
      moderationReason: 'The text contains a link.',
      moderationFlags: ['contains_link'],
      suspicion: {
        level: 'review_required',
        flagged: true,
        signals: [{ rule: 'content_check', reason: 'The text contains a link.', evidence: 'www.example.com' }],
        reviewStatus: 'pending',
        detectedAt: new Date()
      },
      moderationHistory: [{ decision: 'needs_review', reason: 'The text contains a link.', actor: 'system' }],
      history: [{ status: 'Pending', description: 'Complaint submitted by citizen.' }],
      ...fields
    })
  }

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

  test('complaint with a promotional link is admitted and ranked; the content flag is kept as advisory data', async () => {

    const { status, data } = await submit(citizenB, {
      title: 'Garbage pile',
      description: 'Garbage not collected for a week near the market, see www.example.com for photos of the area'
    })

    assert.equal(status, 201)
    assert.equal(data.moderation.status, 'approved')
    assert.equal(data.message, 'Complaint submitted successfully.')

    const linkedId = data.complaint.id

    const stored = await Complaint.findOne({ id: linkedId }).lean()
    assert.ok(stored.moderationFlags.includes('contains_link'))
    assert.equal(stored.suspicion.flagged, true)
    assert.ok(stored.workflowEnteredAt)

    const priority = await api('GET', '/api/complaints/priority', { token: tokenOf(admin) })
    assert.ok(priority.data.complaints.some(c => c.id === linkedId))

    const statusChange = await api('PUT', `/api/complaints/${linkedId}/status`, { token: tokenOf(admin), json: { status: 'In Progress' } })
    assert.equal(statusChange.status, 200)

    const notes = await Notification.find({ complaintId: linkedId }).lean()
    assert.equal(notes.filter(n => n.type === 'complaint_under_review').length, 0)

  })

  test('a legacy held complaint is visible to admins, ranked, and admitted on its first status change', async () => {

    const legacy = await seedHeld(citizenB, { severity: 'High' })
    const token = tokenOf(admin)

    const all = await api('GET', '/api/complaints', { token })
    const listed = all.data.find(c => c.id === legacy.id)
    assert.ok(listed, 'not hidden from the admin list')
    assert.equal(typeof listed.priorityRank, 'number')

    const priority = await api('GET', '/api/complaints/priority', { token })
    assert.ok(priority.data.complaints.some(c => c.id === legacy.id))

    const change = await api('PUT', `/api/complaints/${legacy.id}/status`, { token, json: { status: 'In Progress' } })
    assert.equal(change.status, 200)

    const stored = await Complaint.findOne({ id: legacy.id }).lean()
    assert.equal(stored.moderationStatus, 'approved')
    assert.ok(stored.workflowEnteredAt)
    assert.equal(stored.moderationHistory.at(-1).actor, 'admin')
    assert.equal(stored.moderationHistory.at(-1).adminEmail, 'admin@test.local')
    assert.equal(stored.history.at(-1).status, 'In Progress')
    assert.ok(stored.suspicion.signals.length > 0, 'original evidence is kept')

  })

  test('a complaint rejected by an administrator stays out of the queue and cannot be processed', async () => {

    const rejected = await seedHeld(citizenB, { moderationStatus: 'rejected', severity: 'Critical', description: 'Exposed live wire, visit www.example.com' })
    const token = tokenOf(admin)

    const all = await api('GET', '/api/complaints', { token })
    assert.ok(!all.data.some(c => c.id === rejected.id))

    const priority = await api('GET', '/api/complaints/priority', { token })
    assert.ok(!priority.data.complaints.some(c => c.id === rejected.id))

    const change = await api('PUT', `/api/complaints/${rejected.id}/status`, { token, json: { status: 'In Progress' } })
    assert.equal(change.status, 409)

    // Still available on request, and still in the database
    const withRejected = await api('GET', '/api/complaints?moderation=all', { token })
    assert.ok(withRejected.data.some(c => c.id === rejected.id))

    await Complaint.deleteOne({ _id: rejected._id })

  })


  // ----------------------------------------------------------
  // Moderation API (routes kept; the admin panel was retired)
  // ----------------------------------------------------------

  test('moderation list returns real counts and the held complaint', async () => {

    await Complaint.updateMany({ moderationStatus: 'needs_review' }, { $set: { moderationStatus: 'approved' } })

    reviewId = (await seedHeld(citizenB)).id

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

    const held = await seedHeld(citizenB, {
      title: 'Drain issue',
      description: 'Drain overflowing near school, click here www.promo.example.com'
    })

    const data = { complaint: { id: held.id } }

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

    // Priority fields are the 0-100 score with its urgency band
    for (const heapEntry of ranked) {
      assert.ok(heapEntry.priority >= 0 && heapEntry.priority <= 100)
      assert.equal(typeof heapEntry.urgencyLevel, 'string')
      assert.equal(typeof heapEntry.priorityExplanation, 'string')
    }
    assert.equal(ranked[0].safetyEscalation, true)

    // Stored base priority excludes waiting time: Low 15 + safety hazard 30
    assert.equal((await Complaint.findOne({ id: safetyId }).lean()).priority, 45)

    // Public stats: real counts, workflow-only (everything not rejected), effective Critical
    const workflow = await Complaint.countDocuments({ moderationStatus: { $ne: 'rejected' } })
    assert.equal(stats.status, 200)
    assert.equal(stats.data.total, workflow)
    assert.equal(stats.data.critical, 1)
    assert.equal(stats.data.pending + stats.data.inProgress + stats.data.resolved, stats.data.total)

  })



  // ----------------------------------------------------------
  // SMS consent
  // ----------------------------------------------------------

  test('SMS consent: off by default, needs a mobile, can be granted and withdrawn', async () => {

    const noMobile = await api('POST', '/api/auth/register', {
      json: { name: 'Consent', email: 'consent-nomobile@test.local', password: 'secret1', smsConsent: true }
    })
    assert.equal(noMobile.status, 400)

    const badType = await api('POST', '/api/auth/register', {
      json: { name: 'Consent', email: 'consent-badtype@test.local', password: 'secret1', mobile: '9812345678', smsConsent: 'yes' }
    })
    assert.equal(badType.status, 400)

    const defaultOff = await api('POST', '/api/auth/register', {
      json: { name: 'Off', email: 'consent-off@test.local', password: 'secret1', mobile: '9812345678' }
    })
    assert.equal(defaultOff.status, 201)
    assert.equal((await User.findOne({ email: 'consent-off@test.local' }).lean()).smsConsent, false)

    const optedIn = await api('POST', '/api/auth/register', {
      json: { name: 'On', email: 'consent-on@test.local', password: 'secret1', mobile: '9812345679', smsConsent: true }
    })
    assert.equal(optedIn.status, 201)

    const token = optedIn.data.token
    const me = await api('GET', '/api/auth/me', { token })
    assert.equal(me.data.smsConsent, true)
    assert.ok(me.data.smsConsentAt)
    assert.equal(me.data.mobileMasked, '+91 ******5679')
    assert.ok(!JSON.stringify(me.data).includes('9812345679'), 'full number never returned')
    assert.equal(me.data.smsUpdatesAvailable, false, 'no provider configured in this test run')

    const withdraw = await api('PUT', '/api/auth/me/sms-consent', { token, json: { consent: false } })
    assert.equal(withdraw.status, 200)
    assert.equal(withdraw.data.smsConsent, false)
    assert.ok(withdraw.data.smsConsentWithdrawnAt)

    const stored = await User.findOne({ email: 'consent-on@test.local' }).lean()
    assert.equal(stored.smsConsent, false)
    assert.ok(stored.smsConsentAt && stored.smsConsentWithdrawnAt)

    assert.equal((await api('PUT', '/api/auth/me/sms-consent', { token, json: { consent: 'true' } })).status, 400)
    assert.equal((await api('PUT', '/api/auth/me/sms-consent', { json: { consent: true } })).status, 401)
    assert.equal((await api('PUT', '/api/auth/me/sms-consent', { token: tokenOf(admin), json: { consent: true } })).status, 403)

    const lonely = await User.create({ name: 'No Mobile', email: 'consent-lonely@test.local', passwordHash: 'x', role: 'citizen' })
    assert.equal((await api('PUT', '/api/auth/me/sms-consent', { token: tokenOf(lonely), json: { consent: true } })).status, 400)

  })

  test('with no SMS provider configured, notifications record not_configured and still work', async () => {
    const { data } = await submit(citizenB, { title: 'Streetlight off', description: 'Streetlight not working on the lane behind the temple for three nights', category: 'Streetlight', location: 'Kothrud' })
    const notes = await Notification.find({ complaintId: data.complaint.id }).lean()
    assert.ok(notes.length >= 1)
    assert.ok(notes.every(n => ['not_configured', 'not_requested'].includes(n.sms.status)))
  })


  // ----------------------------------------------------------
  // SMS delivery against a FAKE local provider (never a real SMS)
  // ----------------------------------------------------------

  test('SMS: only consenting + verified citizens get messages; once per event; failures never undo the change', async () => {

    const http = require('node:http')

    const received = []
    let mode = 'accept'

    const fakeProvider = http.createServer((req, res) => {
      let raw = ''
      req.on('data', chunk => { raw += chunk })
      req.on('end', () => {
        received.push(JSON.parse(raw))
        res.setHeader('Content-Type', 'application/json')
        if (mode === 'accept') {
          res.end(JSON.stringify({ type: 'success', message: `req-${received.length}` }))
        } else {
          res.statusCode = 400
          res.end(JSON.stringify({ type: 'error', message: 'Invalid template' }))
        }
      })
    })

    await new Promise(resolve => fakeProvider.listen(0, '127.0.0.1', resolve))

    const envBackup = { ...process.env }

    Object.assign(process.env, {
      SMS_PROVIDER: 'msg91',
      MSG91_AUTH_KEY: 'fake-key',
      MSG91_SENDER_ID: 'CIVPLS',
      MSG91_FLOW_URL: `http://127.0.0.1:${fakeProvider.address().port}/flow`,
      MSG91_TEMPLATE_REGISTERED: 't-registered',
      MSG91_TEMPLATE_UNDER_REVIEW: 't-review',
      MSG91_TEMPLATE_APPROVED: 't-approved',
      MSG91_TEMPLATE_REJECTED: 't-rejected',
      MSG91_TEMPLATE_IN_PROGRESS: 't-progress',
      MSG91_TEMPLATE_RESOLVED: 't-resolved',
      MSG91_TEMPLATE_REOPENED: 't-reopened',
      SMS_WEBHOOK_SECRET: 'webhook-test-secret',
      SMS_MAX_ATTEMPTS: '1'
    })

    async function settledSms(complaintId, type) {
      for (let i = 0; i < 100; i++) {
        const note = await Notification.findOne({ complaintId, type }).lean()
        if (note && !['pending', 'sending'].includes(note.sms.status)) return note
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      throw new Error(`SMS for ${complaintId}/${type} never settled`)
    }

    try {

      const consenting = await User.create({
        name: 'Sms Yes', email: 'sms-yes@test.local', passwordHash: 'x', role: 'citizen',
        mobile: '+919811111111', mobileVerified: true, smsConsent: true, smsConsentAt: new Date()
      })
      const declined = await User.create({
        name: 'Sms No', email: 'sms-no@test.local', passwordHash: 'x', role: 'citizen',
        mobile: '+919822222222', mobileVerified: true, smsConsent: false
      })
      const unverified = await User.create({
        name: 'Sms Unverified', email: 'sms-unverified@test.local', passwordHash: 'x', role: 'citizen',
        mobile: '+919833333333', mobileVerified: false, smsConsent: true
      })

      const issue = { title: 'Water leakage', description: 'Main water pipe leaking on the footpath outside building 7 since morning', category: 'Water', location: 'Aundh' }

      // Registration SMS: one message, accepted (not "delivered")
      const yes = await submit(consenting, issue)
      assert.equal(yes.status, 201)
      const registered = await settledSms(yes.data.complaint.id, 'complaint_registered')
      assert.equal(registered.sms.status, 'accepted')
      assert.equal(registered.sms.provider, 'msg91')
      assert.ok(registered.sms.providerMessageId)
      // The automatic "accepted" in-app note does not send a second SMS
      assert.equal((await Notification.findOne({ complaintId: yes.data.complaint.id, type: 'complaint_approved' }).lean()).sms.status, 'not_requested')
      assert.equal(received.length, 1)
      assert.deepEqual(received[0].recipients, [{ mobiles: '919811111111', var1: yes.data.complaint.id }])
      assert.equal(received[0].template_id, 't-registered')

      // No consent / unverified: in-app notification yes, SMS no
      const no = await submit(declined, { ...issue, location: 'Baner' })
      assert.equal((await settledSms(no.data.complaint.id, 'complaint_registered')).sms.status, 'no_consent')
      const unv = await submit(unverified, { ...issue, location: 'Wakad' })
      assert.equal((await settledSms(unv.data.complaint.id, 'complaint_registered')).sms.status, 'unverified')
      assert.equal(received.length, 1, 'nothing sent to non-consenting or unverified citizens')

      // Status change: one SMS; unchanged status and retries send nothing more
      const token = tokenOf(admin)
      const id = yes.data.complaint.id
      await api('PUT', `/api/complaints/${id}/status`, { token, json: { status: 'In Progress' } })
      await api('PUT', `/api/complaints/${id}/status`, { token, json: { status: 'In Progress' } })
      await settledSms(id, 'status_in_progress')
      assert.equal(received.length, 2)
      assert.equal(received[1].template_id, 't-progress')
      assert.equal(await Notification.countDocuments({ complaintId: id, type: 'status_in_progress' }), 1)

      // Pending -> Pending (unchanged): no notification, no SMS
      await api('PUT', `/api/complaints/${no.data.complaint.id}/status`, { token, json: { status: 'Pending' } })
      assert.equal(await Notification.countDocuments({ complaintId: no.data.complaint.id, type: 'status_reopened' }), 0)

      // Provider failure: complaint update still succeeds and is stored
      mode = 'fail'
      const resolve = await api('PUT', `/api/complaints/${id}/status`, { token, json: { status: 'Resolved' } })
      assert.equal(resolve.status, 200)
      assert.equal((await Complaint.findOne({ id }).lean()).status, 'Resolved')
      const failed = await settledSms(id, 'status_resolved')
      assert.equal(failed.sms.status, 'failed')
      assert.match(failed.sms.error, /Invalid template/)
      mode = 'accept'

      // Withdrawn consent applies to the very next message
      await api('PUT', '/api/auth/me/sms-consent', { token: tokenOf(consenting), json: { consent: false } })
      await api('PUT', `/api/complaints/${id}/status`, { token, json: { status: 'Pending' } })
      assert.equal((await settledSms(id, 'status_reopened')).sms.status, 'no_consent')
      assert.equal(received.length, 3, 'the failed attempt was the only other call')

      // Delivery reports: secret required, only then "delivered"
      const requestId = registered.sms.providerMessageId
      const noSecret = await api('POST', '/api/sms/delivery-report', { json: { requestId, status: 'Delivered' } })
      assert.equal(noSecret.status, 401)
      const wrongSecret = await api('POST', '/api/sms/delivery-report?secret=nope', { json: { requestId, status: 'Delivered' } })
      assert.equal(wrongSecret.status, 401)
      assert.equal((await Notification.findById(registered._id).lean()).sms.status, 'accepted')

      const report = await api('POST', '/api/sms/delivery-report?secret=webhook-test-secret', {
        json: { data: JSON.stringify([{ requestId, report: [{ status: '1', number: '919811111111' }] }]) }
      })
      assert.equal(report.status, 200)
      assert.equal(report.data.updated, 1)
      const delivered = await Notification.findById(registered._id).lean()
      assert.equal(delivered.sms.status, 'delivered')
      assert.ok(delivered.sms.deliveredAt)

      // A late "failed" report cannot overwrite a confirmed delivery
      await api('POST', '/api/sms/delivery-report?secret=webhook-test-secret', { json: { requestId, status: 'failed' } })
      assert.equal((await Notification.findById(registered._id).lean()).sms.status, 'delivered')

      // Citizens see a status, never provider ids or numbers
      const list = await api('GET', '/api/notifications', { token: tokenOf(consenting) })
      const listed = list.data.notifications.find(n => n._id === String(registered._id))
      assert.equal(listed.smsStatus, 'delivered')
      assert.ok(!JSON.stringify(list.data).includes('919811111111'))
      assert.ok(!JSON.stringify(list.data).includes(requestId))

    } finally {

      for (const key of Object.keys(process.env)) if (!(key in envBackup)) delete process.env[key]
      Object.assign(process.env, envBackup)
      await new Promise(resolve => fakeProvider.close(resolve))

    }

  })

  test('delivery-report endpoint is disabled when no webhook secret is configured', async () => {
    const { status } = await api('POST', '/api/sms/delivery-report', { json: { requestId: 'x', status: '1' } })
    assert.equal(status, 404)
  })


  // ----------------------------------------------------------
  // Suspicious-submission detection + admin review
  // ----------------------------------------------------------

  let flaggedId
  let originalId

  test('same-account near-duplicate is admitted with the evidence recorded for admins only', async () => {

    const repeater = await User.create({ name: 'Repeat', email: 'repeat@test.local', passwordHash: 'x', role: 'citizen' })
    const issue = { title: 'Broken footpath', description: 'Footpath tiles broken and uneven near the bakery, people tripping at night', category: 'Road', location: 'Model Colony Lane 3' }

    const first = await submit(repeater, issue)
    assert.equal(first.data.moderation.status, 'approved')
    originalId = first.data.complaint.id

    const second = await submit(repeater, { ...issue, description: issue.description + '!!' })
    assert.equal(second.status, 201)
    assert.equal(second.data.moderation.status, 'approved')
    const duplicateId = second.data.complaint.id

    // Nothing internal leaks to the citizen
    assert.equal(second.data.complaint.suspicion, undefined)
    assert.equal(second.data.complaint.moderationFlags, undefined)

    const stored = await Complaint.findOne({ id: duplicateId }).lean()
    assert.equal(stored.suspicion.level, 'review_required')
    assert.equal(stored.suspicion.reviewStatus, 'pending')
    assert.ok(stored.suspicion.detectedAt)
    const signal = stored.suspicion.signals.find(s => s.rule === 'same_account_duplicate')
    assert.deepEqual(signal.matchedComplaintIds, [originalId])
    assert.ok(signal.evidence)

    // The duplicate is ranked, and repeating a report does not raise
    // either complaint's priority above a single report's.
    const priority = await api('GET', '/api/complaints/priority', { token: tokenOf(admin) })
    const rankedOriginal = priority.data.complaints.find(c => c.id === originalId)
    const rankedDuplicate = priority.data.complaints.find(c => c.id === duplicateId)
    assert.ok(rankedDuplicate)
    assert.equal(rankedOriginal.priorityScore, rankedDuplicate.priorityScore)
    assert.equal(rankedOriginal.priorityScore, 25, 'Medium severity, no hazard, no photo, not waiting')

    const notes = await Notification.find({ complaintId: duplicateId }).lean()
    assert.deepEqual(notes.map(n => n.type).sort(), ['complaint_approved', 'complaint_registered'])
    assert.ok(notes.every(n => !/fake|fraud|spam|abuse|suspicious/i.test(n.message)))

    const own = await api('GET', `/api/complaints/${duplicateId}`, { token: tokenOf(repeater) })
    assert.equal(own.data.suspicion, undefined)

    // Admin sees the full evidence on the complaint itself
    const all = await api('GET', '/api/complaints', { token: tokenOf(admin) })
    assert.ok(all.data.find(c => c.id === duplicateId).suspicion.signals.length > 0)

    // Legacy held complaint used by the moderation-API tests below
    flaggedId = (await seedHeld(repeater)).id

  })

  test('different citizens reporting the same issue are all accepted and linked, not flagged', async () => {

    const reporters = await User.insertMany([1, 2, 3].map(n => ({ name: `Neighbour ${n}`, email: `neighbour${n}@test.local`, passwordHash: 'x', role: 'citizen' })))
    const issue = { title: 'Streetlight not working', description: 'The streetlight outside gate 2 of Green Park society has been off for a week', category: 'Streetlight', location: 'Green Park Society, Baner' }

    const ids = []

    for (const reporter of reporters) {
      const { data } = await submit(reporter, issue)
      assert.equal(data.moderation.status, 'approved')
      ids.push(data.complaint.id)
    }

    const last = await Complaint.findOne({ id: ids[2] }).lean()
    assert.equal(last.suspicion.level, 'normal')
    assert.equal(last.suspicion.flagged, false)
    assert.deepEqual([...last.suspicion.relatedComplaintIds].sort(), ids.slice(0, 2).sort())

  })

  test('rapid submissions from one account are admitted with the signal recorded', async () => {

    const busy = await User.create({ name: 'Busy', email: 'busy@test.local', passwordHash: 'x', role: 'citizen' })
    const issues = [
      ['Garbage pile', 'Garbage not collected near the vegetable market for days', 'Garbage', 'Hadapsar'],
      ['Leaking pipe', 'Water pipe leaking at the corner of the main road', 'Water', 'Kharadi'],
      ['Blocked drain', 'Drain blocked and overflowing after the rain', 'Drainage', 'Viman Nagar'],
      ['Signal off', 'Traffic signal at the junction is not working since morning', 'Traffic', 'Yerawada'],
      ['Fallen tree', 'A tree branch has fallen across the lane blocking vehicles', 'Other', 'Kalyani Nagar']
    ]

    const outcomes = []

    for (const [title, description, category, location] of issues) {
      const { data } = await submit(busy, { title, description, category, location })
      outcomes.push(data.moderation.status)
    }

    assert.deepEqual(outcomes, ['approved', 'approved', 'approved', 'approved', 'approved'])

    const fifth = await Complaint.findOne({ citizenId: busy._id }).sort({ createdAt: -1 }).lean()
    assert.ok(fifth.suspicion.signals.some(s => s.rule === 'rapid_submissions'))

  })

  test('review actions are admin-only', async () => {
    for (const action of ['approve', 'dismiss', 'reject']) {
      const anonymous = await api('POST', `/api/moderation/complaints/${flaggedId}/${action}`, { json: { reason: 'Some reason here' } })
      assert.equal(anonymous.status, 401)
      const citizen = await api('POST', `/api/moderation/complaints/${flaggedId}/${action}`, { token: tokenOf(citizenA), json: { reason: 'Some reason here' } })
      assert.equal(citizen.status, 403)
    }
    assert.equal((await api('GET', '/api/moderation/complaints', { token: tokenOf(citizenA) })).status, 403)
    assert.equal((await Complaint.findOne({ id: flaggedId }).lean()).moderationStatus, 'needs_review')
  })

  test('rejection needs a real reason written in words', async () => {
    for (const reason of ['', 'no', '.....', '12345 678', '   ']) {
      const { status } = await api('POST', `/api/moderation/complaints/${flaggedId}/reject`, { token: tokenOf(admin), json: { reason } })
      assert.equal(status, 400, JSON.stringify(reason))
    }
  })

  test('dismissing a false-positive flag admits the complaint once, audits it, and sends no accusation', async () => {

    const token = tokenOf(admin)

    const dismiss = await api('POST', `/api/moderation/complaints/${flaggedId}/dismiss`, { token, json: { note: 'Different spot on the same lane.' } })
    assert.equal(dismiss.status, 200)

    const again = await api('POST', `/api/moderation/complaints/${flaggedId}/dismiss`, { token, json: {} })
    assert.equal(again.status, 409)

    const stored = await Complaint.findOne({ id: flaggedId }).lean()
    assert.equal(stored.moderationStatus, 'approved')
    assert.equal(stored.suspicion.level, 'normal')
    assert.equal(stored.suspicion.reviewStatus, 'dismissed')
    assert.equal(stored.suspicion.reviewerEmail, 'admin@test.local')
    assert.match(stored.suspicion.reviewReason, /false positive/)
    assert.ok(stored.suspicion.signals.length > 0, 'original evidence is kept for the audit trail')
    assert.equal(stored.moderationHistory.at(-1).actor, 'admin')
    assert.ok(stored.workflowEnteredAt)

    const notes = await Notification.find({ complaintId: flaggedId }).lean()
    assert.equal(notes.filter(n => n.type === 'complaint_approved').length, 1)
    assert.equal(notes.filter(n => n.type === 'complaint_rejected').length, 0)

    const priority = await api('GET', '/api/complaints/priority', { token })
    assert.ok(priority.data.complaints.some(c => c.id === flaggedId))

  })

  test('spam is never auto-rejected; a confirmed-invalid decision is recorded only after an admin rejects with a reason', async () => {

    const spammer = await User.create({ name: 'Promo', email: 'promo@test.local', passwordHash: 'x', role: 'citizen' })
    const submitted = await submit(spammer, { title: 'Buy now', description: 'Click here for free money and cashback www.spam-offer.xyz', category: 'Other', location: 'Camp' })

    assert.equal(submitted.data.moderation.status, 'approved', 'never auto-rejected')
    const admitted = await Complaint.findOne({ id: submitted.data.complaint.id }).lean()
    assert.equal(admitted.suspicion.level, 'review_required')
    assert.equal(await Notification.countDocuments({ complaintId: admitted.id, type: 'complaint_rejected' }), 0)

    // An administrator can still reject a legacy held complaint through the API
    const data = { complaint: { id: (await seedHeld(spammer, { title: 'Buy now', description: 'Click here for free money www.spam-offer.xyz' })).id } }

    const reason = 'Advertising content, not a civic complaint.'
    const reject = await api('POST', `/api/moderation/complaints/${data.complaint.id}/reject`, { token: tokenOf(admin), json: { reason } })
    assert.equal(reject.status, 200)
    const retry = await api('POST', `/api/moderation/complaints/${data.complaint.id}/reject`, { token: tokenOf(admin), json: { reason } })
    assert.equal(retry.status, 409)

    const stored = await Complaint.findOne({ id: data.complaint.id }).lean()
    assert.equal(stored.suspicion.level, 'confirmed_invalid')
    assert.equal(stored.suspicion.reviewReason, reason)

    const notes = await Notification.find({ complaintId: data.complaint.id, type: 'complaint_rejected' }).lean()
    assert.equal(notes.length, 1, 'one rejection notice despite the retry')
    assert.match(notes[0].message, /was not approved/)
    assert.match(notes[0].message, /Advertising content/)
    assert.match(notes[0].message, /submit a new complaint/)

    // The account itself is untouched
    const account = await User.findById(spammer._id).lean()
    assert.equal(account.role, 'citizen')

  })

  test('another citizen cannot read someone else\'s phone number through any complaint route', async () => {
    for (const path of [`/api/complaints/${originalId}`, `/api/complaints/${originalId}/history`]) {
      const { status, data } = await api('GET', path, { token: tokenOf(citizenB) })
      assert.equal(status, 404)
      assert.ok(!JSON.stringify(data).includes('+91'))
    }
    const mine = await api('GET', '/api/complaints/mine', { token: tokenOf(citizenA) })
    assert.ok(mine.data.every(c => c.citizenMobile === undefined))
  })

}
