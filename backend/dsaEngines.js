// ============================================================
// CIVICPULSE DSA ENGINES
// ============================================================
//
// Data Structures used:
//
// 1. Priority Queue -> implemented using Max Heap
// 2. FIFO Queue    -> complaint processing
// 3. Linked List   -> complaint history
//
// Priority Queue ordering:
//
//   1. Effective severity tier
//   2. Score within that tier
//   3. Older complaint first
//
// IMPORTANT:
// We DO NOT use one additive number to determine the actual
// ordering. The heap compares tier first, then score, then age.
//
// ============================================================


// ============================================================
// PRIORITY CONFIGURATION
// ============================================================

const PRIORITY_TIER = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1
}


// SLA in days for unresolved complaints.
//
// Low:
//   after 14 days -> Medium tier
//
// Medium:
//   after 7 days -> High tier
//
// High:
//   after 3 days -> stays High
//
// Critical:
//   already highest tier, no escalation
//
const SLA_DAYS = {
  Low: 14,
  Medium: 7,
  High: 3
}


// Safety-related phrases.
//
// These are checked against BOTH:
// - complaint title
// - complaint description
//
// A detected serious safety phrase forces the complaint
// to Critical severity.
//
// Keep this list conservative so normal complaints are not
// incorrectly classified as Critical.
//
const SAFETY_WORDS =
  /exposed wire|live wire|gas leak|fire|open manhole/i


// ============================================================
// 1. BASIC SEVERITY SCORE
// ============================================================
//
// This function is kept because complaintRoutes.js currently
// imports severityScore() when creating a complaint.
//
// These values are NOT used as the sole sorting mechanism.
//
// They simply represent the base severity level.
//
// Critical = 400
// High     = 300
// Medium   = 200
// Low      = 100
//
// ============================================================

function severityScore(severity) {

  switch (severity) {

    case 'Critical':
      return 400

    case 'High':
      return 300

    case 'Medium':
      return 200

    case 'Low':
      return 100

    default:
      return 200
  }
}


// ============================================================
// 2. NORMALIZE SEVERITY
// ============================================================

function normalizeSeverity(severity) {

  if (!severity) {
    return 'Medium'
  }

  const value =
    String(severity)
      .trim()
      .toLowerCase()

  switch (value) {

    case 'critical':
      return 'Critical'

    case 'high':
      return 'High'

    case 'medium':
      return 'Medium'

    case 'low':
      return 'Low'

    default:
      return 'Medium'
  }
}


// ============================================================
// 3. SAFETY DETECTION
// ============================================================
//
// Check BOTH title and description.
//
// Example:
//
// title:
//   "Roadside problem"
//
// description:
//   "There is an exposed live wire near the road"
//
// Result:
//   Critical
//
// ============================================================

function hasSafetyRisk(complaint) {

  const title =
    complaint?.title || ''

  const description =
    complaint?.description || ''

  const text =
    `${title} ${description}`

  return SAFETY_WORDS.test(text)
}


// ============================================================
// 4. EFFECTIVE SEVERITY
// ============================================================
//
// User-selected severity is not blindly trusted.
//
// Safety rules can override it.
//
// Example:
//
// Citizen selects:
//   Medium
//
// Description:
//   "Exposed live wire near road"
//
// Effective severity:
//   Critical
//
// ============================================================

function getEffectiveSeverity(complaint) {

  const selectedSeverity =
    normalizeSeverity(complaint?.severity)

  // Safety rule overrides the selected severity.
  if (hasSafetyRisk(complaint)) {
    return 'Critical'
  }

  return selectedSeverity
}


// ============================================================
// 5. COMPLAINT AGE
// ============================================================
//
// Returns age in days.
//
// Invalid/missing dates safely return 0.
//
// ============================================================

function getAgeDays(
  createdAt,
  now = Date.now()
) {

  const createdTime =
    new Date(createdAt).getTime()

  if (Number.isNaN(createdTime)) {
    return 0
  }

  const ageMs =
    Math.max(
      0,
      now - createdTime
    )

  return (
    ageMs /
    (1000 * 60 * 60 * 24)
  )
}


// ============================================================
// 6. EFFECTIVE PRIORITY TIER
// ============================================================
//
// Tier:
//
// Critical = 4
// High     = 3
// Medium   = 2
// Low      = 1
//
// SLA escalation:
//
// Medium > 7 days -> High
// Low > 14 days   -> Medium
//
// IMPORTANT:
//
// Nothing can become Critical because of age.
//
// Only:
// - actual Critical severity
// - safety rule forcing Critical
//
// can produce tier 4.
//
// ============================================================

function getEffectiveTier(
  complaint,
  now = Date.now()
) {

  const severity =
    getEffectiveSeverity(complaint)

  // Critical is always tier 4.
  if (severity === 'Critical') {
    return 4
  }

  let tier =
    PRIORITY_TIER[severity]

  // Resolved complaints do not participate in the
  // active priority queue.
  //
  // If this function is called directly for a resolved
  // complaint, simply return its natural severity tier.
  if (complaint?.status === 'Resolved') {
    return tier
  }

  const ageDays =
    getAgeDays(
      complaint?.createdAt,
      now
    )

  const slaDays =
    SLA_DAYS[severity]

  // SLA escalation.
  if (
    slaDays !== undefined &&
    ageDays > slaDays
  ) {

    // Never escalate above High.
    tier =
      Math.min(
        tier + 1,
        3
      )
  }

  return tier
}


// ============================================================
// 7. EFFECTIVE TIER LABEL
// ============================================================

function getTierLabel(tier) {

  switch (tier) {

    case 4:
      return 'Critical'

    case 3:
      return 'High'

    case 2:
      return 'Medium'

    case 1:
      return 'Low'

    default:
      return 'Medium'
  }
}


// ============================================================
// 8. SCORE WITHIN THE SAME TIER
// ============================================================
//
// Components:
//
// Duplicate reports:
//   +5 per extra report
//   maximum +40
//
// Age:
//   +2 per day
//   maximum +30
//
// Safety category:
//   +20
//
// Optional:
//   affectedPeople OR upvotes
//   maximum +10
//
// IMPORTANT:
//
// This score does NOT determine the overall severity.
//
// The heap compares:
//
//   tier FIRST
//   score SECOND
//   age THIRD
//
// ============================================================

function calculateWithinTierScore(
  complaint,
  now = Date.now()
) {

  // ----------------------------------------------------------
  // Duplicate reports
  // ----------------------------------------------------------

  const duplicateCount =
    Math.max(
      0,
      Number(
        complaint?.duplicateCount || 0
      )
    )

  const duplicateScore =
    Math.min(
      duplicateCount * 5,
      40
    )


  // ----------------------------------------------------------
  // Waiting/age score
  // ----------------------------------------------------------

  const ageDays =
    getAgeDays(
      complaint?.createdAt,
      now
    )

  const ageScore =
    Math.min(
      ageDays * 2,
      30
    )


  // ----------------------------------------------------------
  // Explicit safety category
  // ----------------------------------------------------------
  //
  // This is deliberately separate from safety keyword
  // detection.
  //
  // Safety keywords already force Critical.
  //
  // isSafetyCategory should only be true if the application
  // actually stores this information.
  //
  // We do NOT invent a value.
  //

  const safetyCategory =
    complaint?.isSafetyCategory === true

  const safetyScore =
    safetyCategory
      ? 20
      : 0


  // ----------------------------------------------------------
  // Optional affected people / upvotes
  // ----------------------------------------------------------
  //
  // Only use these if the database actually contains them.
  //
  // We do not create fake values.
  //

  let peopleScore = 0

  if (
    complaint?.affectedPeople !== undefined
  ) {

    const affectedPeople =
      Math.max(
        0,
        Number(
          complaint.affectedPeople
        ) || 0
      )

    peopleScore =
      Math.min(
        affectedPeople / 10,
        10
      )

  } else if (
    complaint?.upvotes !== undefined
  ) {

    const upvotes =
      Math.max(
        0,
        Number(
          complaint.upvotes
        ) || 0
      )

    peopleScore =
      Math.min(
        upvotes / 2,
        10
      )
  }


  // ----------------------------------------------------------
  // Final within-tier score
  // ----------------------------------------------------------

  const total =
    duplicateScore +
    ageScore +
    safetyScore +
    peopleScore

  return Math.min(
    Math.round(total * 100) / 100,
    100
  )
}


// ============================================================
// 9. FINAL PRIORITY CALCULATION
// ============================================================
//
// Returns:
//
// {
//   tier,
//   score,
//   displayPriority,
//   effectiveSeverity
// }
//
// Example:
//
// Critical complaint:
//
// tier = 4
// score = 20
// displayPriority = 420
//
// High complaint:
//
// tier = 3
// score = 70
// displayPriority = 370
//
// IMPORTANT:
//
// displayPriority is ONLY a convenient UI number.
//
// Actual heap comparison uses:
// tier -> score -> createdAt
//
// ============================================================

function calculatePriority(
  complaint,
  now = Date.now()
) {

  const effectiveSeverity =
    getEffectiveSeverity(
      complaint
    )

  const tier =
    getEffectiveTier(
      complaint,
      now
    )

  const score =
    calculateWithinTierScore(
      complaint,
      now
    )

  const displayPriority =
    tier * 100 + score

  return {
    tier,
    score,
    displayPriority,
    effectiveSeverity
  }
}


// ============================================================
// 10. BACKWARD-COMPATIBLE computePriorityScore()
// ============================================================
//
// Your existing complaintRoutes.js already calls:
//
// computePriorityScore(complaint)
//
// Therefore KEEP this function.
//
// It returns the display priority:
//
// tier * 100 + score
//
// Example:
//
// Critical + score 20 = 420
// High + score 30     = 330
//
// Again:
//
// This number is NOT what the heap uses for comparison.
//
// ============================================================

function computePriorityScore(
  complaint,
  now = Date.now()
) {

  const priority =
    calculatePriority(
      complaint,
      now
    )

  return priority.displayPriority
}


// ============================================================
// 11. MAX HEAP PRIORITY QUEUE
// ============================================================
//
// This is the main DSA.
//
// Priority Queue
//       ↓
// implemented using
//       ↓
// Max Heap
//
// Comparison:
//
// 1. Higher tier
// 2. Higher within-tier score
// 3. Older createdAt
//
// ============================================================

class MaxHeapPriorityQueue {

  constructor() {

    this.heap = []

  }


  // ----------------------------------------------------------
  // Compare two complaints
  // ----------------------------------------------------------

  isHigherPriority(a, b) {

    // --------------------------------------------------------
    // 1. EFFECTIVE TIER
    // --------------------------------------------------------

    if (
      a.priorityTier !==
      b.priorityTier
    ) {

      return (
        a.priorityTier >
        b.priorityTier
      )
    }


    // --------------------------------------------------------
    // 2. SCORE WITHIN SAME TIER
    // --------------------------------------------------------

    if (
      a.priorityScore !==
      b.priorityScore
    ) {

      return (
        a.priorityScore >
        b.priorityScore
      )
    }


    // --------------------------------------------------------
    // 3. OLDER COMPLAINT FIRST
    // --------------------------------------------------------

    const aTime =
      new Date(
        a.createdAt
      ).getTime()

    const bTime =
      new Date(
        b.createdAt
      ).getTime()

    // Older timestamp = higher priority.
    return aTime < bTime
  }


  // ----------------------------------------------------------
  // Heapify Up
  // ----------------------------------------------------------
  //
  // Complexity: O(log n)
  //
  // ----------------------------------------------------------

  heapifyUp(index) {

    while (index > 0) {

      const parentIndex =
        Math.floor(
          (index - 1) / 2
        )

      if (
        this.isHigherPriority(
          this.heap[index],
          this.heap[parentIndex]
        )
      ) {

        [
          this.heap[index],
          this.heap[parentIndex]
        ] = [
          this.heap[parentIndex],
          this.heap[index]
        ]

        index =
          parentIndex

      } else {

        break
      }
    }
  }


  // ----------------------------------------------------------
  // Heapify Down
  // ----------------------------------------------------------
  //
  // Complexity: O(log n)
  //
  // ----------------------------------------------------------

  heapifyDown(index) {

    const length =
      this.heap.length

    while (true) {

      let highest =
        index

      const left =
        2 * index + 1

      const right =
        2 * index + 2


      // Compare left child.
      if (
        left < length &&
        this.isHigherPriority(
          this.heap[left],
          this.heap[highest]
        )
      ) {

        highest =
          left
      }


      // Compare right child.
      if (
        right < length &&
        this.isHigherPriority(
          this.heap[right],
          this.heap[highest]
        )
      ) {

        highest =
          right
      }


      // No change required.
      if (
        highest === index
      ) {

        break
      }


      // Swap.
      [
        this.heap[index],
        this.heap[highest]
      ] = [
        this.heap[highest],
        this.heap[index]
      ]

      index =
        highest
    }
  }


  // ----------------------------------------------------------
  // Push
  // ----------------------------------------------------------
  //
  // Complexity: O(log n)
  //
  // ----------------------------------------------------------

  push(complaint) {

    this.heap.push(
      complaint
    )

    this.heapifyUp(
      this.heap.length - 1
    )
  }


  // ----------------------------------------------------------
  // Top
  // ----------------------------------------------------------
  //
  // Returns highest-priority complaint.
  //
  // Complexity: O(1)
  //
  // ----------------------------------------------------------

  top() {

    if (
      this.heap.length === 0
    ) {

      return null
    }

    return this.heap[0]
  }


  // ----------------------------------------------------------
  // Pop
  // ----------------------------------------------------------
  //
  // Removes highest-priority complaint.
  //
  // Complexity: O(log n)
  //
  // ----------------------------------------------------------

  pop() {

    if (
      this.heap.length === 0
    ) {

      return null
    }


    // Only one element.
    if (
      this.heap.length === 1
    ) {

      return this.heap.pop()
    }


    const top =
      this.heap[0]

    this.heap[0] =
      this.heap.pop()

    this.heapifyDown(0)

    return top
  }


  // ----------------------------------------------------------
  // Is Empty
  // ----------------------------------------------------------

  isEmpty() {

    return (
      this.heap.length === 0
    )
  }


  // ----------------------------------------------------------
  // Size
  // ----------------------------------------------------------

  size() {

    return this.heap.length
  }
}


// ============================================================
// 12. RANK COMPLAINTS USING MAX HEAP
// ============================================================
//
// Only unresolved complaints:
//
// Pending
// In Progress
//
// Resolved complaints are excluded.
//
// ============================================================

function rankByPriority(
  complaints
) {

  const heap =
    new MaxHeapPriorityQueue()

  const now =
    Date.now()


  // ----------------------------------------------------------
  // Only active complaints
  // ----------------------------------------------------------

  const activeComplaints =
    complaints.filter(
      complaint =>
        complaint.status !==
        'Resolved'
    )


  // ----------------------------------------------------------
  // Insert into Max Heap
  // ----------------------------------------------------------

  for (
    const complaint
    of activeComplaints
  ) {

    const priority =
      calculatePriority(
        complaint,
        now
      )


    heap.push({

      ...(
        complaint.toObject
          ? complaint.toObject()
          : complaint
      ),

      priorityTier:
        priority.tier,

      priorityScore:
        priority.score,

      displayPriority:
        priority.displayPriority,

      // Keep compatibility with
      // the existing frontend/backend
      // field named "priority".
      priority:
        priority.displayPriority,

      effectiveSeverity:
        priority.effectiveSeverity
    })
  }


  // ----------------------------------------------------------
  // Drain heap
  // ----------------------------------------------------------

  const ranked = []

  while (
    !heap.isEmpty()
  ) {

    ranked.push(
      heap.pop()
    )
  }


  return ranked
}


// ============================================================
// 13. PEEK HIGHEST PRIORITY
// ============================================================
//
// Does NOT remove the complaint.
//
// Complexity:
//   Building using repeated push = O(n log n)
//   top = O(1)
//
// ============================================================

function peekHighestPriority(
  complaints
) {

  const heap =
    new MaxHeapPriorityQueue()

  const now =
    Date.now()


  const activeComplaints =
    complaints.filter(
      complaint =>
        complaint.status !==
        'Resolved'
    )


  for (
    const complaint
    of activeComplaints
  ) {

    const priority =
      calculatePriority(
        complaint,
        now
      )


    heap.push({

      ...(
        complaint.toObject
          ? complaint.toObject()
          : complaint
      ),

      priorityTier:
        priority.tier,

      priorityScore:
        priority.score,

      displayPriority:
        priority.displayPriority,

      priority:
        priority.displayPriority,

      effectiveSeverity:
        priority.effectiveSeverity
    })
  }


  return heap.top()
}


// ============================================================
// 14. LINKED LIST NODE
// ============================================================
//
// Used for complaint status history.
//
// ============================================================

class HistoryNode {

  constructor(
    status,
    timestamp,
    description
  ) {

    this.status =
      status

    this.timestamp =
      timestamp

    this.description =
      description

    this.next =
      null
  }
}


// ============================================================
// 15. HISTORY LINKED LIST
// ============================================================
//
// Complaint history:
//
// Pending
//   ↓
// In Progress
//   ↓
// Resolved
//
// New events are appended at the tail.
//
// append -> O(1)
// toArray -> O(n)
//
// ============================================================

class HistoryLinkedList {

  constructor() {

    this.head =
      null

    this.tail =
      null

    this.length =
      0
  }


  append(
    status,
    timestamp,
    description
  ) {

    const node =
      new HistoryNode(
        status,
        timestamp,
        description
      )


    // First node.
    if (
      this.head === null
    ) {

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


    this.length += 1

    return node
  }


  toArray() {

    const result = []

    let current =
      this.head


    while (
      current !== null
    ) {

      result.push({

        status:
          current.status,

        timestamp:
          current.timestamp,

        description:
          current.description
      })

      current =
        current.next
    }


    return result
  }


  isEmpty() {

    return (
      this.head === null
    )
  }


  size() {

    return this.length
  }
}


// ============================================================
// 16. BUILD HISTORY TIMELINE
// ============================================================
//
// Converts MongoDB history array into our Linked List,
// then traverses the Linked List.
//
// ============================================================

function buildHistoryTimeline(
  history
) {

  const linkedList =
    new HistoryLinkedList()


  if (
    Array.isArray(history)
  ) {

    for (
      const item
      of history
    ) {

      linkedList.append(

        item.status,

        item.timestamp,

        item.description
      )
    }
  }


  return linkedList.toArray()
}


// ============================================================
// 17. FIFO COMPLAINT QUEUE
// ============================================================
//
// This is a separate DSA from the Priority Queue.
//
// FIFO:
//
// First In -> First Out
//
// enqueue -> adds complaint
// dequeue -> removes oldest complaint
//
// ============================================================

class ComplaintQueue {

  constructor() {

    this.items = []
  }


  enqueue(complaint) {

    this.items.push(
      complaint
    )
  }


  dequeue() {

    if (
      this.items.length === 0
    ) {

      return null
    }

    // Keeps the original FIFO
    // behavior used by CivicPulse.
    return this.items.shift()
  }


  front() {

    if (
      this.items.length === 0
    ) {

      return null
    }

    return this.items[0]
  }


  isEmpty() {

    return (
      this.items.length === 0
    )
  }


  size() {

    return this.items.length
  }
}


// ============================================================
// 18. PROCESS FIFO QUEUE
// ============================================================
//
// The complaints are processed in the order supplied.
//
// The caller can sort them oldest-first before passing them
// into processQueue() when FIFO arrival order is required.
//
// ============================================================

function processQueue(
  complaints
) {

  const queue =
    new ComplaintQueue()


  for (
    const complaint
    of complaints
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
//
// CommonJS because CivicPulse backend uses:
//
// const {
//   severityScore,
//   computePriorityScore,
//   ...
// } = require('../dsaEngines')
//
// ============================================================

module.exports = {

  // Priority Queue / Max Heap
  MaxHeapPriorityQueue,

  severityScore,
  normalizeSeverity,
  hasSafetyRisk,
  getEffectiveSeverity,
  getAgeDays,
  getEffectiveTier,
  getTierLabel,
  calculateWithinTierScore,
  calculatePriority,
  computePriorityScore,
  rankByPriority,
  peekHighestPriority,

  // Linked List
  HistoryNode,
  HistoryLinkedList,
  buildHistoryTimeline,

  // FIFO Queue
  ComplaintQueue,
  processQueue
}