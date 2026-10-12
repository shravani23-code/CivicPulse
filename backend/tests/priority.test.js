// Unit tests for the priority engine (dsaEngines.js).
// Run: npm test   (uses Node's built-in test runner, no database)

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  MaxHeapPriorityQueue,
  URGENCY_BANDS,
  hasSafetyRisk,
  hasHealthHazard,
  getEffectiveSeverity,
  getEffectiveTier,
  getUrgencyLevel,
  calculateBasePriority,
  calculateWithinTierScore,
  calculatePriority,
  computePriorityScore,
  attachPriority,
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

const PHOTO = [{ url: 'https://res.cloudinary.com/demo/photo.jpg', publicId: 'p1' }]

const ids = list => list.map(c => c.id)


// ------------------------------------------------------------
// Hazard detection (unchanged safety rules + public health)
// ------------------------------------------------------------

test('safety phrases are detected and shown as Critical severity', () => {

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
    assert.equal(calculatePriority(c, NOW).safetyEscalation, true, description)
  }

})

test('safety phrase in the title alone is detected', () => {
  const c = complaint({ title: 'Live wire on road', description: 'Please fix quickly', severity: 'Low' })
  assert.equal(getEffectiveSeverity(c), 'Critical')
  assert.equal(calculatePriority(c, NOW).safetyEscalation, true)
})

test('words that merely contain a safety term do not escalate', () => {

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
    assert.equal(calculatePriority(c, NOW).safetyEscalation, false, description)
  }

})

test('public-health hazards add points but do not escalate', () => {

  for (const description of [
    'Sewage overflowing onto the street',
    'Contaminated drinking water from the tap',
    'Dead dog lying near the school gate',
    'Mosquito breeding in stagnant water'
  ]) {
    const c = complaint({ description })
    const result = calculatePriority(c, NOW)
    assert.equal(hasHealthHazard(c), true, description)
    assert.equal(result.breakdown.hazard, 15, description)
    assert.equal(result.safetyEscalation, false, description)
  }

  assert.equal(hasHealthHazard(complaint({ description: 'Sewage line repair work is slow' })), false)

})

test('missing or invalid severity falls back to Medium', () => {
  assert.equal(getEffectiveSeverity(complaint({ severity: undefined })), 'Medium')
  assert.equal(getEffectiveSeverity(complaint({ severity: 'urgent!!' })), 'Medium')
  assert.equal(getEffectiveSeverity(complaint({ severity: ' high ' })), 'High')
})


// ------------------------------------------------------------
// Score components
// ------------------------------------------------------------

test('higher severity increases priority in documented steps', () => {

  const scores = ['Low', 'Medium', 'High', 'Critical'].map(
    severity => calculatePriority(complaint({ severity }), NOW).score
  )

  assert.deepEqual(scores, [15, 25, 35, 45])

})

test('safety hazard adds 30 points on top of the selected severity (no double counting)', () => {

  const plain = calculatePriority(complaint({ severity: 'Low' }), NOW)
  const hazard = calculatePriority(complaint({ severity: 'Low', description: 'Exposed live wire on the pole' }), NOW)

  // Severity component still uses the citizen's own "Low", even though
  // the displayed effective severity is Critical.
  assert.equal(hazard.breakdown.severity, 15)
  assert.equal(hazard.breakdown.hazard, 30)
  assert.equal(hazard.score, plain.score + 30)
  assert.equal(hazard.effectiveSeverity, 'Critical')

})

test('photo evidence adds 5 points; no photo is not a penalty', () => {

  const without = calculatePriority(complaint(), NOW)
  const withPhoto = calculatePriority(complaint({ images: PHOTO }), NOW)
  const malformed = calculatePriority(complaint({ images: [null, { url: '' }, 'x'] }), NOW)

  assert.equal(withPhoto.score, without.score + 5)
  assert.equal(without.breakdown.evidence, 0)
  assert.equal(without.score, 25, 'a complaint without photos keeps its full severity score')
  assert.equal(malformed.breakdown.evidence, 0)

})

test('waiting time: +2 per full day, capped at 20', () => {

  const at = days => calculatePriority(complaint({ createdAt: daysAgo(days) }), NOW)

  assert.equal(at(0.5).breakdown.waiting, 0)
  assert.equal(at(1).breakdown.waiting, 2)
  assert.equal(at(3).breakdown.waiting, 6)
  assert.equal(at(9.9).breakdown.waiting, 18)
  assert.equal(at(10).breakdown.waiting, 20)
  assert.equal(at(400).breakdown.waiting, 20)

  // Gradual: never decreases as time passes
  let previous = -1
  for (let day = 0; day <= 30; day++) {
    const score = at(day).score
    assert.ok(score >= previous)
    previous = score
  }

})

test('waiting time alone never outranks a genuine immediate safety hazard', () => {

  const oldest = complaint({ id: 'CP00000001', severity: 'Critical', createdAt: daysAgo(365), images: PHOTO })
  const hazard = complaint({ id: 'CP00000002', severity: 'Low', description: 'Gas leak near houses', createdAt: daysAgo(0) })

  assert.equal(calculatePriority(oldest, NOW).score, 70, 'max non-hazard score')
  assert.deepEqual(ids(rankByPriority([oldest, hazard], NOW)), ['CP00000002', 'CP00000001'])

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

  // 3 days between creation and resolution -> 6 points, not 20.
  assert.equal(calculatePriority(resolved, NOW).breakdown.waiting, 6)

  // Without a usable resolution timestamp the old behaviour remains.
  const noHistory = complaint({ status: 'Resolved', createdAt: daysAgo(40) })
  assert.equal(calculatePriority(noHistory, NOW).breakdown.waiting, 20)

  // Resolved complaints are never escalated or SLA-breached
  const resolvedHazard = complaint({ status: 'Resolved', description: 'open manhole', createdAt: daysAgo(40) })
  assert.equal(calculatePriority(resolvedHazard, NOW).safetyEscalation, false)
  assert.equal(calculatePriority(resolvedHazard, NOW).slaBreached, false)

})

test('score is always within 0-100 and the base score excludes waiting time', () => {

  const max = calculatePriority(complaint({ severity: 'Critical', description: 'fire', images: PHOTO, createdAt: daysAgo(99) }), NOW)

  assert.equal(max.score, 100)
  assert.equal(max.baseScore, 80)
  assert.equal(max.score, max.baseScore + max.breakdown.waiting)

  const fresh = calculatePriority(complaint({ severity: 'High', images: PHOTO }), NOW)
  assert.equal(fresh.baseScore, fresh.score)
  assert.equal(calculateBasePriority(complaint({ severity: 'High', images: PHOTO })).score, 40)

})


// ------------------------------------------------------------
// Urgency bands
// ------------------------------------------------------------

test('urgency bands: Critical 80+, High 60-79, Medium 35-59, Low 0-34', () => {

  const cases = [[100, 'Critical'], [80, 'Critical'], [79, 'High'], [60, 'High'], [59, 'Medium'], [35, 'Medium'], [34, 'Low'], [0, 'Low']]

  for (const [score, label] of cases) {
    assert.equal(getUrgencyLevel(score), label, String(score))
  }

  assert.equal(getUrgencyLevel(NaN), 'Low')
  assert.equal(getUrgencyLevel(250), 'Critical')
  assert.deepEqual(URGENCY_BANDS.map(b => b.min), [80, 60, 35, 0])

})

test('calculatePriority fields are mutually consistent', () => {

  const c = complaint({ severity: 'High', createdAt: daysAgo(2), description: 'Exposed wire', images: PHOTO })
  const result = calculatePriority(c, NOW)

  // 35 severity + 30 hazard + 4 waiting + 5 evidence
  assert.equal(result.score, 74)
  assert.equal(result.tier, 3)
  assert.equal(result.tierLabel, 'High')
  assert.equal(result.urgencyLevel, 'High')
  assert.equal(result.displayPriority, result.score)
  assert.equal(computePriorityScore(c, NOW), 74)
  assert.equal(getEffectiveTier(c, NOW), 3)
  assert.equal(calculateWithinTierScore(c, NOW), 74)
  assert.equal(result.explanation, 'Severity High +35 · Immediate safety hazard +30 · Waiting 2 days +4 · Photo evidence +5')

  const sum = Object.values(result.breakdown).reduce((a, b) => a + b, 0)
  assert.equal(sum, result.score)

})

test('missing severity uses a conservative documented default and says so', () => {
  const result = calculatePriority(complaint({ severity: undefined }), NOW)
  assert.equal(result.breakdown.severity, 25)
  assert.match(result.explanation, /Medium assumed/)
})


// ------------------------------------------------------------
// Fairness rules
// ------------------------------------------------------------

test('identity, tone, capitals, length and category never change the score', () => {

  const base = calculatePriority(complaint(), NOW).score

  const variants = [
    { citizenName: 'Someone Else', citizenEmail: 'x@y.z', citizenMobile: '+919999999999', citizenMobileVerified: true },
    { title: 'POTHOLE ON MAIN ROAD!!!', description: 'LARGE POTHOLE NEAR THE BUS STOP' },
    { description: 'Useless idiots, I will kill you if this pothole is not fixed' },
    { description: 'Pothole' },
    { category: 'Traffic' },
    { latitude: 18.5, longitude: 73.8, location: 'Somewhere very long and descriptive' }
  ]

  for (const fields of variants) {
    assert.equal(calculatePriority(complaint(fields), NOW).score, base, JSON.stringify(fields))
  }

})

test('repeated submissions do not inflate priority', () => {

  const original = complaint({ id: 'CP00000001', createdAt: daysAgo(2) })
  const repeats = [2, 3, 4].map(n => complaint({ id: `CP0000000${n}`, createdAt: daysAgo(1) }))

  const alone = calculatePriority(original, NOW).score
  const ranked = rankByPriority([original, ...repeats], NOW)

  assert.equal(ranked.find(c => c.id === 'CP00000001').priorityScore, alone)
  assert.ok(ranked.every(c => c.priorityScore <= alone))

  // Legacy counters that the schema never stored have no effect either
  assert.equal(calculatePriority(complaint({ duplicateCount: 50, upvotes: 999, affectedPeople: 5000 }), NOW).score, 25)

})

test('suspicious or held flags never lower priority', () => {

  const plain = complaint({ severity: 'High', description: 'Exposed live wire' })
  const flagged = {
    ...plain,
    moderationStatus: 'needs_review',
    moderationFlags: ['same_account_duplicate'],
    suspicion: { level: 'review_required', flagged: true, signals: [{ rule: 'rapid_submissions' }] }
  }

  assert.deepEqual(calculatePriority(flagged, NOW), calculatePriority(plain, NOW))
  assert.equal(rankByPriority([flagged], NOW).length, 1, 'held complaints stay in the queue')

})

test('malformed fields never produce NaN or crash', () => {

  const malformed = [
    { severity: null },
    { severity: 42 },
    { title: 123, description: { text: 'fire' } },
    { images: 'not an array' },
    { createdAt: 'not a date' },
    { createdAt: undefined },
    { status: undefined, history: 'nope' }
  ]

  for (const fields of malformed) {
    const result = calculatePriority(complaint(fields), NOW)
    assert.ok(Number.isFinite(result.score), JSON.stringify(fields))
    assert.ok(result.score >= 0 && result.score <= 100, JSON.stringify(fields))
  }

  assert.doesNotThrow(() => calculatePriority(undefined, NOW))
  assert.doesNotThrow(() => calculatePriority({}, NOW))

})

test('scoring is deterministic for identical inputs and time', () => {
  const c = complaint({ severity: 'High', createdAt: daysAgo(4.2), images: PHOTO })
  assert.deepEqual(calculatePriority(c, NOW), calculatePriority({ ...c }, NOW))
})


// ------------------------------------------------------------
// Max heap behaviour
// ------------------------------------------------------------

const entry = (id, priorityScore, extra = {}) => ({ id, priorityScore, createdAt: daysAgo(1), ...extra })

test('insertion keeps max-heap order and peek does not remove', () => {

  const heap = new MaxHeapPriorityQueue()

  for (const [id, score] of [['A', 10], ['B', 50], ['C', 30], ['D', 90], ['E', 70]]) {
    assert.equal(heap.push(entry(id, score)), true)
  }

  for (let i = 1; i < heap.heap.length; i++) {
    const parent = heap.heap[Math.floor((i - 1) / 2)]
    assert.equal(heap.isHigherPriority(heap.heap[i], parent), false, `child ${i} beats its parent`)
  }

  assert.equal(heap.peek().id, 'D')
  assert.equal(heap.top().id, 'D')
  assert.equal(heap.size(), 5, 'peek does not remove')

  const order = []
  while (!heap.isEmpty()) order.push(heap.dequeue().id)

  assert.deepEqual(order, ['D', 'E', 'B', 'C', 'A'])

})

test('empty queue is handled safely', () => {

  const heap = new MaxHeapPriorityQueue()

  assert.equal(heap.peek(), null)
  assert.equal(heap.pop(), null)
  assert.equal(heap.remove('CP1'), null)
  assert.equal(heap.update(entry('CP1', 5)), false)
  assert.equal(heap.isEmpty(), true)
  assert.equal(heap.size(), 0)
  assert.equal(heap.push(null), false)
  assert.equal(heap.size(), 0)

})

test('safety escalation outranks a higher score', () => {

  const heap = new MaxHeapPriorityQueue()
  heap.push(entry('HIGH', 70))
  heap.push(entry('ESC', 40, { safetyEscalation: true }))

  assert.equal(heap.pop().id, 'ESC')
  assert.equal(heap.pop().id, 'HIGH')

})

test('equal scores: older complaint first, then complaint ID', () => {

  const sameTime = daysAgo(1)

  const input = [
    complaint({ id: 'CP00000009', severity: 'High', createdAt: sameTime }),
    complaint({ id: 'CP00000003', severity: 'High', createdAt: sameTime }),
    complaint({ id: 'CP00000005', severity: 'High', createdAt: new Date(sameTime.getTime() - 1000) })
  ]

  const expected = ['CP00000005', 'CP00000003', 'CP00000009']

  assert.deepEqual(ids(rankByPriority(input, NOW)), expected)

  // Same answer for any insertion order.
  assert.deepEqual(ids(rankByPriority([...input].reverse(), NOW)), expected)
  assert.deepEqual(ids(rankByPriority([input[1], input[2], input[0]], NOW)), expected)

})

test('missing or invalid priority keeps the entry, sorted as score 0', () => {

  const heap = new MaxHeapPriorityQueue()
  heap.push(entry('BAD', 'abc'))
  heap.push(entry('NONE', undefined))
  heap.push(entry('OK', 5))

  assert.equal(heap.size(), 3)
  assert.equal(heap.pop().id, 'OK')
  assert.deepEqual([heap.pop().id, heap.pop().id].sort(), ['BAD', 'NONE'])

})

test('invalid createdAt never jumps ahead of a valid one', () => {

  const ranked = rankByPriority([
    complaint({ id: 'CP00000001', createdAt: 'garbage' }),
    complaint({ id: 'CP00000002', createdAt: new Date(NOW + DAY) }) // clock skew: still a real date
  ], NOW)

  assert.equal(ranked[ranked.length - 1].id, 'CP00000001')

})

test('duplicate insertion replaces the queued entry instead of adding a second one', () => {

  const heap = new MaxHeapPriorityQueue()

  assert.equal(heap.push(entry('CP1', 10)), true)
  assert.equal(heap.push(entry('CP2', 20)), true)
  assert.equal(heap.push(entry('CP1', 90)), false)

  assert.equal(heap.size(), 2)
  assert.equal(heap.peek().id, 'CP1')
  assert.equal(heap.peek().priorityScore, 90)

})

test('updating a priority and removing an entry keep the heap valid', () => {

  const heap = new MaxHeapPriorityQueue()

  for (let i = 0; i < 20; i++) heap.push(entry(`CP${i}`, i * 3))

  assert.equal(heap.update(entry('CP0', 1000)), true)
  assert.equal(heap.peek().id, 'CP0')

  assert.equal(heap.update(entry('CP0', 1)), true)
  assert.notEqual(heap.peek().id, 'CP0')

  assert.equal(heap.remove('CP19').id, 'CP19')
  assert.equal(heap.has('CP19'), false)
  assert.equal(heap.size(), 19)

  const scores = []
  while (!heap.isEmpty()) scores.push(heap.pop().priorityScore)

  assert.deepEqual(scores, [...scores].sort((a, b) => b - a))
  assert.equal(scores.length, 19)

})

test('rebuild is idempotent and never creates duplicates', () => {

  const data = [entry('A', 1), entry('B', 2), entry('A', 9), entry('C', 3)]
  const heap = new MaxHeapPriorityQueue()

  heap.rebuild(data)
  heap.rebuild(data)

  assert.equal(heap.size(), 3)
  assert.equal(heap.peek().id, 'A')
  assert.equal(heap.peek().priorityScore, 9, 'the latest data for a duplicate ID wins')

  const ranked = rankByPriority([complaint({ id: 'X' }), complaint({ id: 'X', severity: 'High' })], NOW)
  assert.deepEqual(ids(ranked), ['X'])

})

test('rankByPriority excludes resolved and rejected complaints and tolerates bad input', () => {

  const ranked = rankByPriority([
    complaint({ id: 'CP00000001', status: 'Resolved', severity: 'Critical' }),
    null,
    complaint({ id: 'CP00000002', status: 'In Progress' }),
    complaint({ id: 'CP00000003', moderationStatus: 'rejected', severity: 'Critical' }),
    complaint({ id: 'CP00000004', moderationStatus: 'needs_review' })
  ], NOW)

  assert.deepEqual(ids(ranked).sort(), ['CP00000002', 'CP00000004'])
  assert.deepEqual(rankByPriority(undefined), [])
  assert.deepEqual(rankByPriority('nope'), [])
  assert.equal(peekHighestPriority(null), null)

})

test('critical safety complaint ranks above ordinary low-severity complaints', () => {

  const ranked = rankByPriority([
    complaint({ id: 'CP00000001', severity: 'Low', createdAt: daysAgo(30) }),
    complaint({ id: 'CP00000002', severity: 'Medium', createdAt: daysAgo(5), images: PHOTO }),
    complaint({ id: 'CP00000003', severity: 'Critical', description: 'Open manhole outside the school', createdAt: daysAgo(0) })
  ], NOW)

  assert.equal(ranked[0].id, 'CP00000003')
  assert.equal(ranked[0].safetyEscalation, true)

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
    images: random() < 0.3 ? PHOTO : [],
    description: random() < 0.05 ? 'gas leak near houses' : random() < 0.05 ? 'sewage overflow' : 'routine issue'
  }))

  const ranked = rankByPriority(data, NOW)

  const heap = new MaxHeapPriorityQueue()

  for (let i = 1; i < ranked.length; i++) {
    assert.equal(
      heap.isHigherPriority(ranked[i], ranked[i - 1]),
      false,
      `item ${i} outranks item ${i - 1}`
    )
  }

  assert.equal(ranked.length, 300)
  assert.equal(peekHighestPriority(data, NOW).id, ranked[0].id)

  // Incremental pushes give the same order as the O(n) rebuild
  const pushed = new MaxHeapPriorityQueue()
  for (const c of data) pushed.push(attachPriority(c, NOW))
  const drained = []
  while (!pushed.isEmpty()) drained.push(pushed.pop().id)
  assert.deepEqual(drained, ids(ranked))

})

test('heap entries carry the same fields as the live calculation', () => {

  const c = complaint({ severity: 'Medium', description: 'exposed wire', createdAt: daysAgo(2) })
  const [heapEntry] = rankByPriority([c], NOW)
  const live = calculatePriority(c, NOW)

  assert.equal(heapEntry.priorityTier, live.tier)
  assert.equal(heapEntry.priorityScore, live.score)
  assert.equal(heapEntry.priority, live.score)
  assert.equal(heapEntry.displayPriority, live.score)
  assert.equal(heapEntry.basePriorityScore, live.baseScore)
  assert.equal(heapEntry.urgencyLevel, live.urgencyLevel)
  assert.equal(heapEntry.effectiveTierLabel, live.tierLabel)
  assert.equal(heapEntry.safetyEscalation, true)
  assert.equal(heapEntry.priorityExplanation, live.explanation)
  assert.equal(heapEntry.effectiveSeverity, 'Critical')

  // The original complaint object is not mutated
  assert.equal(c.priority, undefined)

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
