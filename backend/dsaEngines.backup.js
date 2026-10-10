// ============================================================
// CivicPulse - DSA Engine
// ============================================================

// ============================================================
// PRIORITY CONFIGURATION
// ============================================================

const PRIORITY_TIER = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4
}

const SLA_DAYS = {
  Low: 14,
  Medium: 7,
  High: 3
}

// Safety phrases that should immediately make a complaint Critical
const SAFETY_PATTERNS = [
  /\bexposed\s+(?:electrical\s+)?wire\b/i,
  /\blive\s+wire\b/i,
  /\bgas\s+leak\b/i,
  /\bactive\s+fire\b/i,
  /\bfire\s+outbreak\b/i,
  /\bbuilding\s+on\s+fire\b/i,
  /\belectrical\s+fire\b/i,
  /\bopen\s+manhole\b/i
]


// ============================================================
// SEVERITY
// ============================================================

function normalizeSeverity(severity) {
  if (typeof severity !== 'string') {
    return 'Low'
  }

  const value = severity.trim().toLowerCase()

  if (value === 'critical') return 'Critical'
  if (value === 'high') return 'High'
  if (value === 'medium') return 'Medium'

  return 'Low'
}


// Kept for compatibility with existing backend code.
// Do NOT use this alone to rank complaints.
function severityScore(severity) {
  const severityName =
    normalizeSeverity(severity)

  if (severityName === 'Critical') return 400
  if (severityName === 'High') return 300
  if (severityName === 'Medium') return 200

  return 100
}


// ============================================================
// SAFETY CHECK
// ============================================================

function hasSafetyRisk(complaint) {
  const title =
    typeof complaint?.title === 'string'
      ? complaint.title
      : ''

  const description =
    typeof complaint?.description === 'string'
      ? complaint.description
      : ''

  const category =
    typeof complaint?.category === 'string'
      ? complaint.category
      : ''

  const text =
    `${title} ${description} ${category}`

  return SAFETY_PATTERNS.some(
    pattern => pattern.test(text)
  )
}


// ============================================================
// AGE
// ============================================================

function getAgeDays(createdAt) {
  const created =
    new Date(createdAt).getTime()

  if (!Number.isFinite(created)) {
    return 0
  }

  const age =
    Math.max(
      0,
      Date.now() - created
    )

  const oneDay =
    24 * 60 * 60 * 1000

  return age / oneDay
}


// ============================================================
// EFFECTIVE SEVERITY
// ============================================================

function getEffectiveSeverity(complaint) {
  const originalSeverity =
    normalizeSeverity(
      complaint?.severity
    )

  // Safety emergency → Critical
  if (hasSafetyRisk(complaint)) {
    return 'Critical'
  }

  // Already Critical
  if (originalSeverity === 'Critical') {
    return 'Critical'
  }

  // Already High
  if (originalSeverity === 'High') {
    return 'High'
  }

  const ageDays =
    getAgeDays(
      complaint?.createdAt
    )

  // Medium → High after 7 days
  if (
    originalSeverity === 'Medium' &&
    ageDays >= SLA_DAYS.Medium
  ) {
    return 'High'
  }

  // Low → Medium after 14 days
  if (
    originalSeverity === 'Low' &&
    ageDays >= SLA_DAYS.Low
  ) {
    return 'Medium'
  }

  return originalSeverity
}


// ============================================================
// PRIORITY TIER
// ============================================================

function getEffectiveTier(complaint) {
  const severity =
    getEffectiveSeverity(
      complaint
    )

  return (
    PRIORITY_TIER[severity] || 1
  )
}


// ============================================================
// TIER LABEL
// ============================================================

function getTierLabel(tier) {
  if (tier === 4) return 'Critical'
  if (tier === 3) return 'High'
  if (tier === 2) return 'Medium'

  return 'Low'
}


// ============================================================
// SCORE WITHIN TIER
// ============================================================
//
// +2 points per completed day
// Maximum 30
//

function calculateWithinTierScore(complaint) {
  const ageDays =
    Math.floor(
      getAgeDays(
        complaint?.createdAt
      )
    )

  return Math.min(
    ageDays * 2,
    30
  )
}


// ============================================================
// FINAL PRIORITY
// ============================================================

function calculatePriority(complaint) {
  const effectiveSeverity =
    getEffectiveSeverity(
      complaint
    )

  const tier =
    getEffectiveTier(
      complaint
    )

  const score =
    calculateWithinTierScore(
      complaint
    )

  const displayPriority =
    (tier * 100) + score

  return {
    effectiveSeverity,
    tier,
    score,
    displayPriority
  }
}


// ============================================================
// COMPATIBILITY FUNCTION
// ============================================================

function computePriorityScore(complaint) {
  return calculatePriority(
    complaint
  ).displayPriority
}


// ============================================================
// PRIORITY COMPARATOR
// ============================================================
//
// 1. Higher tier wins
// 2. Higher score wins
// 3. Older complaint wins
//

function hasHigherPriority(a, b) {
  const priorityA =
    calculatePriority(a)

  const priorityB =
    calculatePriority(b)

  // Higher tier
  if (
    priorityA.tier !==
    priorityB.tier
  ) {
    return (
      priorityA.tier >
      priorityB.tier
    )
  }

  // Higher score
  if (
    priorityA.score !==
    priorityB.score
  ) {
    return (
      priorityA.score >
      priorityB.score
    )
  }

  // Older complaint
  const dateA =
    new Date(
      a?.createdAt
    ).getTime()

  const dateB =
    new Date(
      b?.createdAt
    ).getTime()

  return dateA < dateB
}


// ============================================================
// MAX HEAP PRIORITY QUEUE
// ============================================================

class MaxHeapPriorityQueue {

  constructor() {
    this.heap = []
  }

  swap(i, j) {
    const temp =
      this.heap[i]

    this.heap[i] =
      this.heap[j]

    this.heap[j] =
      temp
  }

  bubbleUp(index) {
    while (index > 0) {

      const parent =
        Math.floor(
          (index - 1) / 2
        )

      if (
        !hasHigherPriority(
          this.heap[index],
          this.heap[parent]
        )
      ) {
        break
      }

      this.swap(
        index,
        parent
      )

      index =
        parent
    }
  }

  bubbleDown(index) {
    const length =
      this.heap.length

    while (true) {

      const left =
        index * 2 + 1

      const right =
        index * 2 + 2

      let highest =
        index

      if (
        left < length &&
        hasHigherPriority(
          this.heap[left],
          this.heap[highest]
        )
      ) {
        highest =
          left
      }

      if (
        right < length &&
        hasHigherPriority(
          this.heap[right],
          this.heap[highest]
        )
      ) {
        highest =
          right
      }

      if (
        highest === index
      ) {
        break
      }

      this.swap(
        index,
        highest
      )

      index =
        highest
    }
  }

  // O(log n)
  push(complaint) {
    this.heap.push(
      complaint
    )

    this.bubbleUp(
      this.heap.length - 1
    )
  }

  // O(1)
  top() {
    return (
      this.heap[0] || null
    )
  }

  // O(log n)
  pop() {
    if (
      this.heap.length === 0
    ) {
      return null
    }

    if (
      this.heap.length === 1
    ) {
      return this.heap.pop()
    }

    const top =
      this.heap[0]

    this.heap[0] =
      this.heap.pop()

    this.bubbleDown(0)

    return top
  }

  size() {
    return this.heap.length
  }
}


// ============================================================
// ADD PRIORITY INFORMATION TO COMPLAINT
// ============================================================

function decorateWithPriority(complaint) {
  const priority =
    calculatePriority(
      complaint
    )

  const obj =
    complaint?.toObject
      ? complaint.toObject()
      : { ...complaint }

  obj.effectiveSeverity =
    priority.effectiveSeverity

  obj.priorityTier =
    priority.tier

  obj.priorityScore =
    priority.score

  obj.priority =
    priority.displayPriority

  return obj
}


// ============================================================
// RANK COMPLAINTS USING MAX HEAP
// ============================================================

function rankByPriority(complaints) {
  const heap =
    new MaxHeapPriorityQueue()

  for (
    const complaint
    of complaints || []
  ) {

    if (
      complaint.status ===
      'Resolved'
    ) {
      continue
    }

    heap.push(
      complaint
    )
  }

  const ranked = []

  while (
    heap.size() > 0
  ) {

    ranked.push(
      decorateWithPriority(
        heap.pop()
      )
    )
  }

  return ranked
}


// ============================================================
// PEEK HIGHEST PRIORITY
// ============================================================

function peekHighestPriority(complaints) {
  const heap =
    new MaxHeapPriorityQueue()

  for (
    const complaint
    of complaints || []
  ) {

    if (
      complaint.status ===
      'Resolved'
    ) {
      continue
    }

    heap.push(
      complaint
    )
  }

  const highest =
    heap.top()

  if (!highest) {
    return null
  }

  return decorateWithPriority(
    highest
  )
}


// ============================================================
// LINKED LIST - HISTORY
// ============================================================

class HistoryNode {

  constructor(data) {
    this.data = data
    this.next = null
  }

}


class HistoryLinkedList {

  constructor() {
    this.head = null
    this.tail = null
    this.length = 0
  }

  append(data) {
    const node =
      new HistoryNode(
        data
      )

    if (!this.head) {

      this.head =
        node

      this.tail =
        node

    } else {

      this.tail.next =
        node

      this.tail =
        node
    }

    this.length++
  }

  toArray() {
    const result = []

    let current =
      this.head

    while (current) {

      result.push(
        current.data
      )

      current =
        current.next
    }

    return result
  }

}


// ============================================================
// BUILD HISTORY TIMELINE
// ============================================================

function buildHistoryTimeline(complaint) {
  const list =
    new HistoryLinkedList()

  if (
    complaint?.createdAt
  ) {

    list.append({
      status: 'Pending',
      timestamp:
        complaint.createdAt
    })

  }

  if (
    Array.isArray(
      complaint?.history
    )
  ) {

    for (
      const item
      of complaint.history
    ) {

      list.append(item)

    }
  }

  return list.toArray()
}


// ============================================================
// FIFO QUEUE
// ============================================================

class ComplaintQueue {

  constructor() {
    this.items = []
    this.front = 0
  }

  enqueue(complaint) {
    this.items.push(
      complaint
    )
  }

  dequeue() {
    if (
      this.front >=
      this.items.length
    ) {
      return null
    }

    const item =
      this.items[
        this.front
      ]

    this.front++

    return item
  }

  isEmpty() {
    return (
      this.front >=
      this.items.length
    )
  }

  size() {
    return (
      this.items.length -
      this.front
    )
  }

}


// ============================================================
// PROCESS FIFO QUEUE
// ============================================================

function processQueue(complaints) {
  const queue =
    new ComplaintQueue()

  for (
    const complaint
    of complaints || []
  ) {

    queue.enqueue(
      complaint
    )
  }

  const processed = []

  while (
    !queue.isEmpty()
  ) {

    processed.push(
      queue.dequeue()
    )
  }

  return processed
}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {

  PRIORITY_TIER,
  SLA_DAYS,

  severityScore,
  normalizeSeverity,
  hasSafetyRisk,
  getAgeDays,
  getEffectiveSeverity,
  getEffectiveTier,
  getTierLabel,

  calculateWithinTierScore,
  calculatePriority,
  computePriorityScore,

  MaxHeapPriorityQueue,
  rankByPriority,
  peekHighestPriority,

  HistoryNode,
  HistoryLinkedList,
  buildHistoryTimeline,

  ComplaintQueue,
  processQueue

}