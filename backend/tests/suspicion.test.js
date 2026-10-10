// Suspicious-submission detector unit tests (no database).

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  evaluateSuspicion,
  textSimilarity,
  sameLocation,
  isUnusableLocation
} = require('../services/suspicionDetector')
const { moderateComplaint } = require('../services/moderationEngine')
const { calculatePriority, rankByPriority } = require('../dsaEngines')

const NOW = Date.UTC(2026, 9, 11, 12, 0, 0)
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

const candidate = {
  title: 'Pothole on main road',
  description: 'Large pothole near the bus stop on FC Road is causing accidents for two wheelers',
  category: 'Road',
  location: 'FC Road, Shivaji Nagar'
}

function previous(overrides = {}) {
  return {
    id: 'CP00000001',
    ...candidate,
    status: 'Pending',
    moderationStatus: 'approved',
    createdAt: new Date(NOW - 2 * HOUR),
    ...overrides
  }
}

function evaluate(args) {
  return evaluateSuspicion({ candidate, moderation: moderateComplaint(candidate), now: NOW, ...args })
}


test('text similarity: identical, misspelt, reordered, unrelated', () => {
  assert.equal(textSimilarity('Pothole on Main Road!', 'pothole   main road'), 1)
  assert.ok(textSimilarity(candidate.description, 'Large pothol near the bus stop on FC Rd causing accidents for two wheelers') >= 0.8)
  assert.ok(textSimilarity('Garbage not collected for a week in lane 4', 'Streetlight broken outside the temple') < 0.3)
  assert.equal(textSimilarity('', 'anything'), 0)
})

test('location matching uses GPS when both have it, otherwise text', () => {
  assert.equal(sameLocation({ latitude: 18.5304, longitude: 73.8475 }, { latitude: 18.5310, longitude: 73.8478 }), true)
  assert.equal(sameLocation({ latitude: 18.5304, longitude: 73.8475 }, { latitude: 18.6000, longitude: 73.9000 }), false)
  assert.equal(sameLocation({ location: 'FC Road, Shivaji Nagar' }, { location: 'fc road shivaji nagar' }), true)
  assert.equal(sameLocation({ location: 'Kothrud' }, { location: 'Hadapsar' }), false)
})

test('normal complaint with no history is not flagged', () => {
  const result = evaluate({})
  assert.equal(result.level, 'normal')
  assert.equal(result.flagged, false)
  assert.deepEqual(result.signals, [])
  assert.equal(result.reviewStatus, 'not_required')
})

test('near-duplicate from the same account is flagged with the matching complaint ID and evidence', () => {

  const result = evaluate({ ownRecent: [previous({ description: candidate.description.replace('accidents', 'accident') })] })

  assert.equal(result.level, 'review_required')
  const signal = result.signals.find(item => item.rule === 'same_account_duplicate')
  assert.ok(signal)
  assert.deepEqual(signal.matchedComplaintIds, ['CP00000001'])
  assert.match(signal.evidence, /similarity \d+%/)

})

test('same account re-reporting a RESOLVED or old issue is not a duplicate', () => {
  assert.equal(evaluate({ ownRecent: [previous({ status: 'Resolved' })] }).flagged, false)
  assert.equal(evaluate({ ownRecent: [previous({ moderationStatus: 'rejected' })] }).flagged, false)
  assert.equal(evaluate({ ownRecent: [previous({ createdAt: new Date(NOW - 5 * 24 * HOUR) })] }).flagged, false)
  assert.equal(evaluate({ ownRecent: [previous({ category: 'Water' })] }).flagged, false)
})

test('several citizens reporting the same issue is NOT suspicious — only linked for the admin', () => {

  const others = [
    previous({ id: 'CP00000011' }),
    previous({ id: 'CP00000012', description: 'Huge pothole near bus stop FC road, two wheelers falling' })
  ]

  const result = evaluate({ othersRecent: others })

  assert.equal(result.level, 'normal')
  assert.equal(result.flagged, false)
  assert.deepEqual(result.relatedComplaintIds.sort(), ['CP00000011', 'CP00000012'])

})

test('rapid submissions from one account are flagged; a few are fine', () => {

  const recent = n => Array.from({ length: n }, (_, index) => previous({
    id: `CP0000010${index}`,
    title: `Issue ${index}`,
    description: ['Garbage dump', 'Broken streetlight', 'Water leakage', 'Blocked drain', 'Traffic signal off'][index % 5] + ' in my lane',
    category: 'Other',
    createdAt: new Date(NOW - (index + 1) * 5 * MINUTE)
  }))

  assert.equal(evaluate({ ownRecent: recent(3) }).flagged, false)

  const burst = evaluate({ ownRecent: recent(4) })
  assert.equal(burst.flagged, true)
  assert.ok(burst.signals.some(item => item.rule === 'rapid_submissions'))

})

test('unusable location is flagged; short real places and numbers are fine', () => {
  assert.equal(isUnusableLocation('...'), true)
  assert.equal(isUnusableLocation('x'), true)
  assert.equal(isUnusableLocation('zxcvbnm'), true)
  assert.equal(isUnusableLocation('Aundh'), false)
  assert.equal(isUnusableLocation('Ward 12'), false)
  assert.equal(isUnusableLocation('शिवाजीनगर'), false)
})

test('short but valid reports, spelling mistakes and missing photos are not penalised', () => {
  const short = { title: 'Pothole', description: 'Big pothole', category: 'Road', location: 'Baner' }
  assert.equal(moderateComplaint(short).status, 'approved')
  assert.equal(evaluateSuspicion({ candidate: short, moderation: moderateComplaint(short), now: NOW }).flagged, false)

  const misspelt = { title: 'Garbge not colected', description: 'garbge lying on rode since 3 days', category: 'Garbage', location: 'Wakad' }
  assert.equal(moderateComplaint(misspelt).status, 'approved')
})

test('content problems become a content_check signal (review), never a rejection', () => {
  const spam = { title: 'Buy now', description: 'Click here for free money www.spam.xyz', category: 'Other', location: 'Pune' }
  const result = evaluateSuspicion({ candidate: spam, moderation: moderateComplaint(spam), now: NOW })
  assert.equal(result.level, 'review_required')
  assert.ok(result.signals.some(item => item.rule === 'content_check'))
})

test('suspicion data never changes priority scoring or ranking', () => {

  const base = { id: 'CP00000001', title: 'Live wire', description: 'Exposed live wire', severity: 'High', status: 'Pending', createdAt: new Date(NOW - 3 * 24 * HOUR) }
  const flagged = { ...base, suspicion: { level: 'review_required', flagged: true, signals: [{ rule: 'same_account_duplicate' }], relatedComplaintIds: ['CP1', 'CP2', 'CP3'] } }

  const a = calculatePriority(base)
  const b = calculatePriority(flagged)

  assert.equal(a.tier, b.tier)
  assert.equal(a.score, b.score)
  assert.equal(a.displayPriority, b.displayPriority)
  assert.deepEqual(rankByPriority([base]).map(item => item.priorityScore), rankByPriority([flagged]).map(item => item.priorityScore))

})
