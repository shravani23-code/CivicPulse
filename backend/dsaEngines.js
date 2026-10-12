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
// ------------------------------------------------------------
// PRIORITY SCORE (0-100)
// ------------------------------------------------------------
//
// Every complaint gets a transparent, deterministic score built
// only from information CivicPulse actually collects:
//
//   Component                       Points    Source
//   ------------------------------  --------  -------------------------
//   Severity (citizen-selected)      15-45    severity field
//   Public safety / health hazard     0-30    title + description
//   Waiting time                      0-20    createdAt (2 per full day)
//   Supporting evidence               0-5     at least one photo
//   ------------------------------  --------
//   Total                            15-100
//
// Severity:  Low 15, Medium 25, High 35, Critical 45.
//            Missing or unknown severity -> Medium (25), a
//            conservative middle value.
//
// Hazard:    Immediate safety hazard (live/exposed wire, gas
//            leak, fire, open manhole)               -> 30
//            Public-health hazard (sewage overflow,
//            contaminated water, dead animal,
//            mosquito breeding)                       -> 15
//            Otherwise                                -> 0
//
// Waiting:   2 points per FULL day waited, capped at 20 (10 days).
//            A resolved complaint stops waiting when it was
//            resolved.
//
// Evidence:  5 points when at least one photo is attached. A
//            complaint without photos is not penalised — it simply
//            does not get the bonus.
//
// Why not "people affected / geographic impact"? CivicPulse does
// not collect a count of affected people or the extent of an
// issue, so that component would have to be invented. Its share
// is redistributed to severity, hazard and waiting time instead.
//
// What is NEVER used: the citizen's identity, name, phone number
// or any personal detail; tone, threats, insults or capital
// letters; text length; duplicate / repeat submissions; and the
// suspicious-submission or moderation flags (a flag never lowers
// a score).
//
// Severity and hazard are not double-counted: the severity
// component always uses the citizen's own selection, and the
// hazard component is added separately. (getEffectiveSeverity(),
// which upgrades a safety hazard to "Critical", is kept for the
// severity badge and statistics only.)
//
// ------------------------------------------------------------
// URGENCY LEVELS (same thresholds in backend and admin UI)
// ------------------------------------------------------------
//
//   Critical  80-100
//   High      60-79
//   Medium    35-59
//   Low        0-34
//
// Immediate safety hazards additionally get a dedicated
// `safetyEscalation` flag. It does not depend on the score, and
// escalated complaints always rank above non-escalated ones.
// No score promises any particular real-world response time.
//
// ------------------------------------------------------------
// PRIORITY QUEUE ORDERING (Max Heap comparator)
// ------------------------------------------------------------
//
//   1. Safety escalation first
//   2. Higher effective score (base + waiting time)
//   3. Older complaint first (missing/invalid dates count as newest)
//   4. Complaint ID, ascending (unique, so the order is deterministic)
//
// Waiting time can therefore never lift an ordinary complaint
// above a genuine immediate safety hazard: escalation is compared
// before the score, and even without escalation the maximum score
// of a non-hazard complaint is 45 + 20 + 5 = 70.
//
// ============================================================


// ============================================================
// PRIORITY CONFIGURATION
// ============================================================

const SEVERITY_POINTS = {
  Low: 15,
  Medium: 25,
  High: 35,
  Critical: 45
}

const HAZARD_POINTS = {
  safety: 30,
  health: 15,
  none: 0
}

const WAITING_POINTS_PER_DAY = 2

const WAITING_POINTS_MAX = 20

const EVIDENCE_POINTS = 5

const MAX_SCORE = 100

// Score bands, highest first. Mirrored in the admin UI.
const URGENCY_BANDS = [
  { label: 'Critical', min: 80, tier: 4 },
  { label: 'High', min: 60, tier: 3 },
  { label: 'Medium', min: 35, tier: 2 },
  { label: 'Low', min: 0, tier: 1 }
]


// SLA in days for unresolved complaints, by effective severity.
//
// Informational only: an unresolved complaint older than its SLA is
// reported as `slaBreached` (shown as "Overdue" to administrators).
// The waiting-time component already raises its score gradually.
//
const SLA_DAYS = {
  Low: 14,
  Medium: 7,
  High: 3
}


// Immediate safety phrases.
//
// These are checked against BOTH:
// - complaint title
// - complaint description
//
// Keep this list conservative so normal complaints are not
// incorrectly escalated.
//
// Whole-word matching: "fire" / "fires" / "on fire" match, but
// "fireworks", "bonfire" or "misfire" do not. Wire phrases accept
// plurals and an optional "electric(al)" ("exposed electrical wires").
//
const SAFETY_WORDS =
  /\b(?:exposed|live|naked|bare|sparking)\s+(?:electric(?:al)?\s+)?(?:wires?|cables?)\b|\bgas\s+leak(?:s|ing|age)?\b|\bfires?\b|\b(?:open|uncovered)\s+manholes?\b/i


// Public-health phrases (a hazard, but not an immediate threat to
// life, so no escalation). Equally conservative and whole-word.
const HEALTH_HAZARD_WORDS =
  /\bsewage\s+(?:overflow(?:s|ing|ed)?|leak(?:s|ing|age)?)\b|\bcontaminated\s+(?:drinking\s+)?water\b|\bwater\s+contamination\b|\bdead\s+(?:animals?|dogs?|cats?|cows?|cattle)\b|\bmosquito\s+breeding\b/i


// ============================================================
// 1. LEGACY SEVERITY SCORE
// ============================================================
//
// Kept for backward compatibility with older callers. New code
// uses calculatePriority().
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

// True when the stored severity is one of the four real levels.
// Used only to explain a conservative default in the breakdown.
function isKnownSeverity(severity) {

  return ['critical', 'high', 'medium', 'low'].includes(
    String(severity ?? '').trim().toLowerCase()
  )
}


// ============================================================
// 3. HAZARD DETECTION
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
//   immediate safety hazard
//
// ============================================================

function getComplaintText(complaint) {

  const title =
    typeof complaint?.title === 'string' ? complaint.title : ''

  const description =
    typeof complaint?.description === 'string' ? complaint.description : ''

  return `${title} ${description}`
}

function hasSafetyRisk(complaint) {

  return SAFETY_WORDS.test(
    getComplaintText(complaint)
  )
}

function hasHealthHazard(complaint) {

  return HEALTH_HAZARD_WORDS.test(
    getComplaintText(complaint)
  )
}

// 'safety' | 'health' | 'none'
function getHazardLevel(complaint) {

  if (hasSafetyRisk(complaint)) return 'safety'

  if (hasHealthHazard(complaint)) return 'health'

  return 'none'
}


// ============================================================
// 4. EFFECTIVE SEVERITY (badge + statistics only)
// ============================================================
//
// A detected safety hazard upgrades the displayed severity to
// Critical, so a live wire filed as "Medium" is still shown and
// counted as Critical. The priority SCORE does not use this value
// (see "not double-counted" above).
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
// 5b. AGE REFERENCE TIME
// ============================================================
//
// An unresolved complaint keeps ageing until now.
//
// A resolved complaint stops ageing at the moment it was
// resolved (the latest "Resolved" history entry), so its score
// does not keep growing for work that is already finished.
// Resolved complaints without a usable history timestamp
// fall back to now, which matches the previous behaviour.
//
// ============================================================

function getAgeReferenceTime(
  complaint,
  now = Date.now()
) {

  if (
    complaint?.status !== 'Resolved' ||
    !Array.isArray(complaint?.history)
  ) {
    return now
  }

  let resolvedAt = NaN

  for (const entry of complaint.history) {

    if (entry?.status !== 'Resolved') continue

    const time =
      new Date(entry.timestamp).getTime()

    if (
      !Number.isNaN(time) &&
      (Number.isNaN(resolvedAt) || time > resolvedAt)
    ) {
      resolvedAt = time
    }
  }

  return Number.isNaN(resolvedAt)
    ? now
    : Math.min(resolvedAt, now)
}


// Full days a complaint has waited (0 for missing/invalid dates
// and for clock skew into the future).
function getWaitingDays(
  complaint,
  now = Date.now()
) {

  return Math.floor(
    getAgeDays(
      complaint?.createdAt,
      getAgeReferenceTime(complaint, now)
    )
  )
}


// Creation time used for "older first" ordering. A missing or
// invalid createdAt sorts as the NEWEST possible complaint, so it
// can never jump ahead of complaints with a real timestamp.
function getCreatedTime(complaint) {

  const time =
    new Date(complaint?.createdAt).getTime()

  return Number.isNaN(time)
    ? Number.POSITIVE_INFINITY
    : time
}


// Number of usable photos. Malformed image entries are ignored.
function countEvidence(complaint) {

  if (!Array.isArray(complaint?.images)) return 0

  return complaint.images.filter(
    image => image && typeof image.url === 'string' && image.url.trim() !== ''
  ).length
}


// Clamps any value to a finite score in [0, MAX_SCORE]. Missing or
// malformed values become 0 so a bad record can never produce NaN
// (which would break every heap comparison).
function clampScore(value) {

  const number = Number(value)

  if (!Number.isFinite(number)) return 0

  return Math.min(Math.max(number, 0), MAX_SCORE)
}


// ============================================================
// 6. URGENCY LEVEL FROM SCORE
// ============================================================

function getUrgencyBand(score) {

  const value = clampScore(score)

  return URGENCY_BANDS.find(band => value >= band.min)
}

function getUrgencyLevel(score) {

  return getUrgencyBand(score).label
}


// ============================================================
// 7. TIER LABEL
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
// 8. BASE PRIORITY (no waiting time)
// ============================================================
//
// Everything that is fixed at submission time. Stored as the
// complaint's `priority` when it is created; the live score adds
// waiting time on top of it at read time without writing to the
// database.
//
// ============================================================

function calculateBasePriority(complaint) {

  const severity =
    normalizeSeverity(complaint?.severity)

  const hazardLevel =
    getHazardLevel(complaint)

  const photos =
    countEvidence(complaint)

  const breakdown = {
    severity: SEVERITY_POINTS[severity],
    hazard: HAZARD_POINTS[hazardLevel],
    evidence: photos > 0 ? EVIDENCE_POINTS : 0
  }

  return {
    severity,
    severityAssumed: !isKnownSeverity(complaint?.severity),
    hazardLevel,
    photos,
    breakdown,
    score: clampScore(breakdown.severity + breakdown.hazard + breakdown.evidence)
  }
}


// Short, human-readable reason for a score, e.g.
// "Severity High +35 · Immediate safety hazard +30 · Waiting 3 days +6"
function explainPriority(base, waitingDays, waitingPoints) {

  const parts = [
    base.severityAssumed
      ? `Severity not set, Medium assumed +${base.breakdown.severity}`
      : `Severity ${base.severity} +${base.breakdown.severity}`
  ]

  if (base.hazardLevel === 'safety') {
    parts.push(`Immediate safety hazard +${base.breakdown.hazard}`)
  } else if (base.hazardLevel === 'health') {
    parts.push(`Public-health hazard +${base.breakdown.hazard}`)
  }

  if (waitingPoints > 0) {
    parts.push(`Waiting ${waitingDays} day${waitingDays === 1 ? '' : 's'} +${waitingPoints}`)
  }

  if (base.breakdown.evidence > 0) {
    parts.push(`Photo evidence +${base.breakdown.evidence}`)
  }

  return parts.join(' · ')
}


// ============================================================
// 9. FINAL PRIORITY CALCULATION
// ============================================================
//
// Deterministic: identical complaint data and the same `now`
// always give the same result.
//
// Returns:
//
// {
//   score,             effective score 0-100 (base + waiting)
//   baseScore,         score without waiting time
//   waitingDays,
//   breakdown,         points per component
//   tier, tierLabel,   urgency band (4..1, Critical..Low)
//   urgencyLevel,      same as tierLabel
//   safetyEscalation,  unresolved immediate safety hazard
//   explanation,
//   displayPriority,   same as score (kept for compatibility)
//   effectiveSeverity,
//   slaBreached
// }
//
// ============================================================

function calculatePriority(
  complaint,
  now = Date.now()
) {

  const base =
    calculateBasePriority(complaint)

  const waitingDays =
    getWaitingDays(complaint, now)

  const waitingPoints =
    Math.min(
      waitingDays * WAITING_POINTS_PER_DAY,
      WAITING_POINTS_MAX
    )

  const score =
    clampScore(base.score + waitingPoints)

  const band =
    getUrgencyBand(score)

  const isResolved =
    complaint?.status === 'Resolved'

  const effectiveSeverity =
    getEffectiveSeverity(complaint)

  const slaDays =
    SLA_DAYS[effectiveSeverity]

  // Informational only: whether an unresolved complaint has
  // outlived the SLA of its effective severity.
  const slaBreached =
    !isResolved &&
    slaDays !== undefined &&
    getAgeDays(complaint?.createdAt, now) > slaDays

  return {
    score,
    baseScore: base.score,
    waitingDays,
    breakdown: {
      ...base.breakdown,
      waiting: waitingPoints
    },
    tier: band.tier,
    tierLabel: band.label,
    urgencyLevel: band.label,
    safetyEscalation: !isResolved && base.hazardLevel === 'safety',
    explanation: explainPriority(base, waitingDays, waitingPoints),
    displayPriority: score,
    effectiveSeverity,
    slaBreached
  }
}


// ============================================================
// 10. BACKWARD-COMPATIBLE HELPERS
// ============================================================

// Effective score (0-100).
function computePriorityScore(
  complaint,
  now = Date.now()
) {

  return calculatePriority(complaint, now).score
}

// Urgency tier (4..1) of the effective score.
function getEffectiveTier(
  complaint,
  now = Date.now()
) {

  return calculatePriority(complaint, now).tier
}

// Deprecated name from the earlier tier-based design. There is no
// separate "within tier" score any more; returns the effective score.
function calculateWithinTierScore(
  complaint,
  now = Date.now()
) {

  return calculatePriority(complaint, now).score
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
// Max Heap (array, children of i at 2i+1 and 2i+2)
//
// Comparison:
//
// 1. Safety escalation
// 2. Higher effective score
// 3. Older createdAt
// 4. Lower complaint ID
//
// A position index (complaint ID -> array slot) is kept in sync
// with every swap, so the queue can:
//
// - refuse duplicate entries (pushing an ID that is already queued
//   replaces that entry instead of adding a second one)
// - update a queued complaint's priority in O(log n)
// - remove a complaint that became ineligible in O(log n)
//
// Entries without any ID are still queued, just not de-duplicated.
//
// ============================================================

class MaxHeapPriorityQueue {

  constructor() {

    this.heap = []

    this.positions = new Map()

  }


  // ----------------------------------------------------------
  // Identity of an entry (complaint ID, or Mongo _id)
  // ----------------------------------------------------------

  static keyOf(entry) {

    const key = entry?.id ?? entry?._id

    if (key === undefined || key === null || key === '') {
      return null
    }

    return String(key)
  }


  // ----------------------------------------------------------
  // Compare two complaints
  // ----------------------------------------------------------

  isHigherPriority(a, b) {

    // --------------------------------------------------------
    // 1. SAFETY ESCALATION
    // --------------------------------------------------------

    const aEscalated =
      a?.safetyEscalation === true

    const bEscalated =
      b?.safetyEscalation === true

    if (aEscalated !== bEscalated) {
      return aEscalated
    }


    // --------------------------------------------------------
    // 2. EFFECTIVE SCORE
    // --------------------------------------------------------
    //
    // Missing or invalid scores count as 0: the complaint stays
    // in the queue, it just sorts last among its peers.
    //

    const aScore =
      clampScore(a?.priorityScore)

    const bScore =
      clampScore(b?.priorityScore)

    if (aScore !== bScore) {
      return aScore > bScore
    }


    // --------------------------------------------------------
    // 3. OLDER COMPLAINT FIRST
    // --------------------------------------------------------

    const aTime =
      getCreatedTime(a)

    const bTime =
      getCreatedTime(b)

    // Older timestamp = higher priority.
    if (aTime !== bTime) {
      return aTime < bTime
    }


    // --------------------------------------------------------
    // 4. FINAL TIE-BREAKER: COMPLAINT ID
    // --------------------------------------------------------
    //
    // Complaint IDs are unique, so two different complaints are
    // never "equal" and the drain order is fully deterministic
    // regardless of insertion order.
    //
    const aId =
      String(a?.id ?? a?._id ?? '')

    const bId =
      String(b?.id ?? b?._id ?? '')

    return aId < bId
  }


  // ----------------------------------------------------------
  // Swap two slots, keeping the position index in sync
  // ----------------------------------------------------------

  swap(i, j) {

    [
      this.heap[i],
      this.heap[j]
    ] = [
      this.heap[j],
      this.heap[i]
    ]

    this.trackPosition(i)
    this.trackPosition(j)
  }

  trackPosition(index) {

    const key =
      MaxHeapPriorityQueue.keyOf(this.heap[index])

    if (key !== null) {
      this.positions.set(key, index)
    }
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

        this.swap(index, parentIndex)

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


      this.swap(index, highest)

      index =
        highest
    }
  }


  // Restores heap order around one slot whose entry changed.
  restore(index) {

    this.heapifyUp(index)

    const key =
      MaxHeapPriorityQueue.keyOf(this.heap[index])

    // heapifyUp may have moved the entry; continue from wherever
    // the changed entry is now (or the same slot if it has no key).
    this.heapifyDown(
      key !== null && this.positions.has(key)
        ? this.positions.get(key)
        : index
    )
  }


  // ----------------------------------------------------------
  // Push
  // ----------------------------------------------------------
  //
  // Complexity: O(log n)
  //
  // Returns true when a new entry was added, false when an entry
  // with the same ID was already queued (it is replaced with the
  // new data instead, so the queue never holds duplicates) or the
  // value was null/undefined.
  //
  // ----------------------------------------------------------

  push(complaint) {

    if (complaint === null || complaint === undefined) {
      return false
    }

    const key =
      MaxHeapPriorityQueue.keyOf(complaint)

    if (key !== null && this.positions.has(key)) {

      const index =
        this.positions.get(key)

      this.heap[index] =
        complaint

      this.restore(index)

      return false
    }

    this.heap.push(
      complaint
    )

    this.trackPosition(
      this.heap.length - 1
    )

    this.heapifyUp(
      this.heap.length - 1
    )

    return true
  }

  enqueue(complaint) {

    return this.push(complaint)
  }


  // ----------------------------------------------------------
  // Update priority of a queued complaint
  // ----------------------------------------------------------
  //
  // Complexity: O(log n). Returns false if it is not queued.
  //
  // ----------------------------------------------------------

  update(complaint) {

    const key =
      MaxHeapPriorityQueue.keyOf(complaint)

    if (key === null || !this.positions.has(key)) {
      return false
    }

    this.push(complaint)

    return true
  }


  // ----------------------------------------------------------
  // Remove a queued complaint by ID (e.g. it was resolved)
  // ----------------------------------------------------------
  //
  // Complexity: O(log n). Returns the removed entry or null.
  //
  // ----------------------------------------------------------

  remove(id) {

    const key =
      id === undefined || id === null ? null : String(id)

    if (key === null || !this.positions.has(key)) {
      return null
    }

    const index =
      this.positions.get(key)

    const lastIndex =
      this.heap.length - 1

    if (index !== lastIndex) {
      this.swap(index, lastIndex)
    }

    const removed =
      this.heap.pop()

    this.positions.delete(key)

    if (index < this.heap.length) {
      this.restore(index)
    }

    return removed
  }


  has(id) {

    return (
      id !== undefined &&
      id !== null &&
      this.positions.has(String(id))
    )
  }


  // ----------------------------------------------------------
  // Rebuild from scratch (bottom-up heapify)
  // ----------------------------------------------------------
  //
  // Complexity: O(n). Duplicate IDs in the input keep only the
  // LAST occurrence (the most recent data), so rebuilding can
  // never create duplicate entries.
  //
  // ----------------------------------------------------------

  rebuild(entries) {

    this.clear()

    if (!Array.isArray(entries)) {
      return this
    }

    const unique = []

    const slotByKey = new Map()

    for (const entry of entries) {

      if (entry === null || entry === undefined) continue

      const key =
        MaxHeapPriorityQueue.keyOf(entry)

      if (key !== null && slotByKey.has(key)) {
        unique[slotByKey.get(key)] = entry
        continue
      }

      if (key !== null) slotByKey.set(key, unique.length)

      unique.push(entry)
    }

    this.heap = unique

    for (let index = 0; index < this.heap.length; index++) {
      this.trackPosition(index)
    }

    for (
      let index = Math.floor(this.heap.length / 2) - 1;
      index >= 0;
      index--
    ) {
      this.heapifyDown(index)
    }

    return this
  }


  clear() {

    this.heap = []

    this.positions = new Map()
  }


  // ----------------------------------------------------------
  // Top / Peek
  // ----------------------------------------------------------
  //
  // Returns highest-priority complaint without removing it.
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

  peek() {

    return this.top()
  }


  // ----------------------------------------------------------
  // Pop / Dequeue
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

    const top =
      this.heap[0]

    const last =
      this.heap.pop()

    const topKey =
      MaxHeapPriorityQueue.keyOf(top)

    if (topKey !== null) {
      this.positions.delete(topKey)
    }

    if (this.heap.length > 0) {

      this.heap[0] =
        last

      this.trackPosition(0)

      this.heapifyDown(0)
    }

    return top
  }

  dequeue() {

    return this.pop()
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
// 11b. HEAP ENTRY HELPERS
// ============================================================
//
// Shared by rankByPriority(), peekHighestPriority() and the
// complaint routes, so every endpoint returns exactly the same
// priority fields for a complaint.
//
// ============================================================

// Only complaints that still need work enter the queue: not
// Resolved, and not rejected by an administrator during moderation.
// Non-array input and null entries are ignored instead of crashing
// the request.
function isQueueEligible(complaint) {

  return Boolean(complaint) &&
    complaint.status !== 'Resolved' &&
    complaint.moderationStatus !== 'rejected'
}

function getActiveComplaints(complaints) {

  if (!Array.isArray(complaints)) {
    return []
  }

  return complaints.filter(isQueueEligible)
}

// Plain copy of the complaint with its live priority attached.
// Nothing is written back to the database.
function attachPriority(
  complaint,
  now = Date.now()
) {

  const priority =
    calculatePriority(
      complaint,
      now
    )

  return {

    ...(
      complaint.toObject
        ? complaint.toObject()
        : complaint
    ),

    // Effective score (base + waiting): what the heap compares.
    priorityScore:
      priority.score,

    // Kept for the existing frontend/backend field names.
    priority:
      priority.score,

    displayPriority:
      priority.score,

    basePriorityScore:
      priority.baseScore,

    priorityBreakdown:
      priority.breakdown,

    priorityExplanation:
      priority.explanation,

    waitingDays:
      priority.waitingDays,

    priorityTier:
      priority.tier,

    effectiveTierLabel:
      priority.tierLabel,

    urgencyLevel:
      priority.urgencyLevel,

    safetyEscalation:
      priority.safetyEscalation,

    effectiveSeverity:
      priority.effectiveSeverity,

    slaBreached:
      priority.slaBreached
  }
}

function buildPriorityQueue(
  complaints,
  now = Date.now()
) {

  return new MaxHeapPriorityQueue().rebuild(
    getActiveComplaints(complaints).map(
      complaint => attachPriority(complaint, now)
    )
  )
}


// ============================================================
// 12. RANK COMPLAINTS USING MAX HEAP
// ============================================================
//
// Only eligible complaints (Pending / In Progress, not rejected).
// The queue is rebuilt on every call, so waiting time is always
// recalculated and no duplicates can accumulate.
//
// ============================================================

function rankByPriority(
  complaints,
  now = Date.now()
) {

  const heap =
    buildPriorityQueue(complaints, now)

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
//   Bottom-up build = O(n)
//   peek = O(1)
//
// ============================================================

function peekHighestPriority(
  complaints,
  now = Date.now()
) {

  return buildPriorityQueue(complaints, now).peek()
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

  // Scoring configuration (read-only use)
  SEVERITY_POINTS,
  HAZARD_POINTS,
  WAITING_POINTS_PER_DAY,
  WAITING_POINTS_MAX,
  EVIDENCE_POINTS,
  URGENCY_BANDS,

  severityScore,
  normalizeSeverity,
  hasSafetyRisk,
  hasHealthHazard,
  getHazardLevel,
  getEffectiveSeverity,
  getAgeDays,
  getAgeReferenceTime,
  getWaitingDays,
  getUrgencyLevel,
  getEffectiveTier,
  getTierLabel,
  calculateWithinTierScore,
  calculateBasePriority,
  calculatePriority,
  computePriorityScore,
  isQueueEligible,
  attachPriority,
  buildPriorityQueue,
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