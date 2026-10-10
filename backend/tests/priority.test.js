// Unit tests for the priority engine (dsaEngines.js).
// Run: npm test   (uses Node's built-in test runner, no database)

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  MaxHeapPriorityQueue,
  hasSafetyRisk,
  getEffectiveSeverity,
  getEffectiveTier,
  calculateWithinTierScore,
  calculatePriority,
  computePriorityScore,
  rankByPriority,
  peekHighestPriority,
  buildHistoryTimeline,
  processQueue
} = require('../dsaEngines')

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 9, 11, 12, 0, 0)

function daysAgo(days) {
  return new Date(NOW - days * DAY)
}

function complaint(overrides = {}) {
  return {
    id: 'CP00000001',
    title: 'Pothole on main road',
    description: 'Large pothole near the bus stop',
    severity: 'Medium',
    status: 'Pending',
    createdAt: daysAgo(0),
    ...overrides
  }
}


// ------------------------------------------------------------
// Severity + safety detection
// ------------------------------------------------------------

test('safety phrases force Critical regardless of selected severity', () => {

  const phrases = [
    'There is an exposed wire near the school',
    'Live wires hanging over the footpath',
    'Exposed electrical wires at the junction',
    'Strong gas leak smell in the lane',
    'Gas leakage near the market',
    'Garbage dump is on fire',
    'Fire in the transformer',
    'Open manhole on the main road',
    'Two uncovered manholes near the park'
  ]

  for (const description of phrases) {
    const c = complaint({ severity: 'Low', description })
    assert.equal(hasSafetyRisk(c), true, description)
    assert.equal(getEffectiveSeverity(c), 'Critical', description)
    assert.equal(getEffectiveTier(c, NOW), 4, description)
  }

})

test('safety phrase in the title alone is detected', () => {
  const c = complaint({ title: 'Live wire on road', description: 'Please fix quickly', severity: 'Low' })
  assert.equal(getEffectiveSeverity(c), 'Critical')
})

test('words that merely contain a safety term do not force Critical', () => {

  const harmless = [
    'Fireworks debris left on the street',
    'Bonfire ash not cleaned',
    'Wire mesh fence is broken',
    'Manhole cover is noisy when vehicles pass'
  ]

  for (const description of harmless) {
    const c = complaint({ severity: 'Low', description })
    assert.equal(hasSafetyRisk(c), false, description)
    assert.equal(getEffectiveSeverity(c), 'Low', description)
  }

})

test('missing or invalid severity falls back to Medium', () => {
  assert.equal(getEffectiveSeverity(complaint({ severity: undefined })), 'Medium')
  assert.equal(getEffectiveSeverity(complaint({ severity: 'urgent!!' })), 'Medium')
  assert.equal(getEffectiveSeverity(complaint({ severity: ' high ' })), 'High')
})


// ------------------------------------------------------------
// SLA escalation
// ------------------------------------------------------------

test('SLA: Low escalates to Medium only after 14 days', () => {
  assert.equal(getEffectiveTier(complaint({ severity: 'Low', createdAt: daysAgo(14) }), NOW), 1)
  assert.equal(getEffectiveTier(complaint({ severity: 'Low', createdAt: daysAgo(14.5) }), NOW), 2)
})

test('SLA: Medium escalates to High only after 7 days', () => {
  assert.equal(getEffectiveTier(complaint({ severity: 'Medium', createdAt: daysAgo(7) }), NOW), 2)
  assert.equal(getEffectiveTier(complaint({ severity: 'Medium', createdAt: daysAgo(8) }), NOW), 3)
})

test('SLA: age never escalates anything to Critical', () => {
  assert.equal(getEffectiveTier(complaint({ severity: 'High', createdAt: daysAgo(400) }), NOW), 3)
  assert.equal(getEffectiveTier(complaint({ severity: 'Medium', createdAt: daysAgo(400) }), NOW), 3)
})

test('SLA breach flag is reported for overdue unresolved complaints only', () => {
  assert.equal(calculatePriority(complaint({ severity: 'High', createdAt: daysAgo(4) }), NOW).slaBreached, true)
  assert.equal(calculatePriority(complaint({ severity: 'High', createdAt: daysAgo(2) }), NOW).slaBreached, false)
  assert.equal(calculatePriority(complaint({ severity: 'Critical', createdAt: daysAgo(30) }), NOW).slaBreached, false)
  assert.equal(
    calculatePriority(complaint({ severity: 'High', status: 'Resolved', createdAt: daysAgo(30) }), NOW).slaBreached,
    false
  )
})

test('resolved complaints are never SLA-escalated', () => {
  const resolved = complaint({ severity: 'Low', status: 'Resolved', createdAt: daysAgo(60) })
  assert.equal(getEffectiveTier(resolved, NOW), 1)
})


// ------------------------------------------------------------
// Within-tier score
// ------------------------------------------------------------

test('age score: +2 per full day, capped at 30', () => {
  assert.equal(calculateWithinTierScore(complaint({ createdAt: daysAgo(0.5) }), NOW), 0)
  assert.equal(calculateWithinTierScore(complaint({ createdAt: daysAgo(3) }), NOW), 6)
  assert.equal(calculateWithinTierScore(complaint({ createdAt: daysAgo(100) }), NOW), 30)
})

test('resolved complaints stop ageing at their resolution time', () => {

  const resolved = complaint({
    status: 'Resolved',
    createdAt: daysAgo(40),
    history: [
      { status: 'Pending', timestamp: daysAgo(40) },
      { status: 'Resolved', timestamp: daysAgo(37) }
    ]
  })

  // 3 days between creation and resolution -> 6 points, not 30.
  assert.equal(calculateWithinTierScore(resolved, NOW), 6)

  // Without a usable resolution timestamp the old behaviour remains.
  const noHistory = complaint({ status: 'Resolved', createdAt: daysAgo(40) })
  assert.equal(calculateWithinTierScore(noHistory, NOW), 30)

})

test('duplicate, safety-category and people components follow their caps', () => {
  assert.equal(calculateWithinTierScore(complaint({ duplicateCount: 3 }), NOW), 15)
  assert.equal(calculateWithinTierScore(complaint({ duplicateCount: 100 }), NOW), 40)
  assert.equal(calculateWithinTierScore(complaint({ isSafetyCategory: true }), NOW), 20)
  assert.equal(calculateWithinTierScore(complaint({ affectedPeople: 50 }), NOW), 5)
  assert.equal(calculateWithinTierScore(complaint({ upvotes: 100 }), NOW), 10)
})

test('malformed numeric fields never produce NaN', () => {

  const malformed = [
    { duplicateCount: 'abc' },
    { duplicateCount: -5 },
    { duplicateCount: null },
    { affectedPeople: 'many' },
    { upvotes: {} },
    { createdAt: 'not a date' },
    { createdAt: undefined }
  ]

  for (const fields of malformed) {
    const result = calculatePriority(complaint(fields), NOW)
    assert.ok(Number.isFinite(result.score), JSON.stringify(fields))
    assert.ok(Number.isFinite(result.displayPriority), JSON.stringify(fields))
  }

})

test('calculatePriority fields are mutually consistent', () => {

  const result = calculatePriority(complaint({ severity: 'High', createdAt: daysAgo(2), duplicateCount: 2 }), NOW)

  assert.equal(result.tier, 3)
  assert.equal(result.tierLabel, 'High')
  assert.equal(result.score, 14)
  assert.equal(result.displayPriority, result.tier * 100 + result.score)
  assert.equal(computePriorityScore(complaint({ severity: 'High', createdAt: daysAgo(2), duplicateCount: 2 }), NOW), 314)

})


// ------------------------------------------------------------
// Max heap ordering
// ------------------------------------------------------------

test('higher tier always beats a higher score in a lower tier', () => {

  const ranked = rankByPriority([
    complaint({ id: 'CP00000001', severity: 'High', createdAt: daysAgo(1), duplicateCount: 8 }),
    complaint({ id: 'CP00000002', severity: 'Critical', createdAt: daysAgo(0) })
  ])

  assert.deepEqual(ranked.map(c => c.id), ['CP00000002', 'CP00000001'])

})

test('equal tier and score: older complaint first, then complaint ID', () => {

  const sameTime = daysAgo(1)

  const input = [
    complaint({ id: 'CP00000009', severity: 'High', createdAt: sameTime }),
    complaint({ id: 'CP00000003', severity: 'High', createdAt: sameTime }),
    complaint({ id: 'CP00000005', severity: 'High', createdAt: new Date(sameTime.getTime() - 1000) })
  ]

  const expected = ['CP00000005', 'CP00000003', 'CP00000009']

  assert.deepEqual(rankByPriority(input).map(c => c.id), expected)

  // Same answer for any insertion order.
  assert.deepEqual(rankByPriority([...input].reverse()).map(c => c.id), expected)
  assert.deepEqual(rankByPriority([input[1], input[2], input[0]]).map(c => c.id), expected)

})

test('invalid createdAt never jumps ahead of a valid one', () => {

  const ranked = rankByPriority([
    complaint({ id: 'CP00000001', createdAt: 'garbage' }),
    complaint({ id: 'CP00000002', createdAt: new Date(NOW + DAY) }) // clock skew: still a real date
  ])

  assert.equal(ranked[ranked.length - 1].id, 'CP00000001')

})

test('rankByPriority excludes resolved complaints and tolerates bad input', () => {

  const ranked = rankByPriority([
    complaint({ id: 'CP00000001', status: 'Resolved', severity: 'Critical' }),
    null,
    complaint({ id: 'CP00000002', status: 'In Progress' })
  ])

  assert.deepEqual(ranked.map(c => c.id), ['CP00000002'])
  assert.deepEqual(rankByPriority(undefined), [])
  assert.deepEqual(rankByPriority('nope'), [])
  assert.equal(peekHighestPriority(null), null)

})

test('heap drains in exactly the same order as a full comparator sort', () => {

  // Deterministic pseudo-random data set
  let seed = 42
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648

  const severities = ['Low', 'Medium', 'High', 'Critical']

  const data = Array.from({ length: 300 }, (_, i) => complaint({
    id: `CP${String(10000000 + i)}`,
    severity: severities[Math.floor(random() * 4)],
    createdAt: daysAgo(Math.floor(random() * 30)),
    duplicateCount: Math.floor(random() * 4),
    description: random() < 0.05 ? 'gas leak near houses' : 'routine issue'
  }))

  const ranked = rankByPriority(data)

  const heap = new MaxHeapPriorityQueue()

  for (let i = 1; i < ranked.length; i++) {
    assert.equal(
      heap.isHigherPriority(ranked[i], ranked[i - 1]),
      false,
      `item ${i} outranks item ${i - 1}`
    )
  }

  assert.equal(ranked.length, 300)
  assert.equal(peekHighestPriority(data).id, ranked[0].id)

})

test('heap entries carry the same fields as the live calculation', () => {

  const c = complaint({ severity: 'Medium', description: 'exposed wire', createdAt: daysAgo(2) })
  const [entry] = rankByPriority([c])
  const live = calculatePriority(c)

  assert.equal(entry.priorityTier, live.tier)
  assert.equal(entry.priorityScore, live.score)
  assert.equal(entry.priority, live.displayPriority)
  assert.equal(entry.displayPriority, live.displayPriority)
  assert.equal(entry.effectiveSeverity, 'Critical')
  assert.equal(entry.effectiveTierLabel, 'Critical')

})


// ------------------------------------------------------------
// Linked list + FIFO queue (unchanged behaviour)
// ------------------------------------------------------------

test('history timeline preserves order and tolerates non-arrays', () => {

  const history = [
    { status: 'Pending', timestamp: daysAgo(3), description: 'a' },
    { status: 'In Progress', timestamp: daysAgo(2), description: 'b' },
    { status: 'Resolved', timestamp: daysAgo(1), description: 'c' }
  ]

  assert.deepEqual(buildHistoryTimeline(history).map(h => h.status), ['Pending', 'In Progress', 'Resolved'])
  assert.deepEqual(buildHistoryTimeline(undefined), [])

})

test('FIFO queue keeps arrival order', () => {
  assert.deepEqual(processQueue([1, 2, 3]), [1, 2, 3])
})
