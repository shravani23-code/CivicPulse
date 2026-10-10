
'use strict';

// CivicPulse DSA Engines
// Priority Queue: Max Heap | Processing Queue: FIFO | History: Linked List

const PRIORITY_TIER = Object.freeze({
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1
});

const SLA_DAYS = Object.freeze({
  Low: 14,
  Medium: 7,
  High: 3
});

const SAFETY_WORDS =
  /exposed wire|live wire|gas leak|fire|open manhole/i;

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeSeverity(severity) {
  const value = String(severity || 'Medium').trim().toLowerCase();

  if (value === 'critical') return 'Critical';
  if (value === 'high') return 'High';
  if (value === 'low') return 'Low';

  return 'Medium';
}

function severityScore(severity) {
  return {
    Critical: 400,
    High: 300,
    Medium: 200,
    Low: 100
  }[normalizeSeverity(severity)];
}

function hasSafetyRisk(complaint = {}) {
  const text = `${complaint.title || ''} ${complaint.description || ''}`;
  return SAFETY_WORDS.test(text);
}

function getEffectiveSeverity(complaint = {}) {
  return hasSafetyRisk(complaint)
    ? 'Critical'
    : normalizeSeverity(complaint.severity);
}

function getAgeDays(createdAt, now = Date.now()) {
  const timestamp =
    createdAt == null ? NaN : new Date(createdAt).getTime();

  if (!Number.isFinite(timestamp)) return 0;

  return Math.max(0, now - timestamp) / DAY_MS;
}

function getEffectiveTier(complaint = {}, now = Date.now()) {
  const severity = getEffectiveSeverity(complaint);
  let tier = PRIORITY_TIER[severity];

  // Resolved complaints keep their natural tier when called directly.
  // rankByPriority excludes resolved complaints from the active queue.
  if (String(complaint.status || '').toLowerCase() === 'resolved') {
    return tier;
  }

  const slaDays = SLA_DAYS[severity];

  if (
    slaDays !== undefined &&
    getAgeDays(complaint.createdAt, now) >= slaDays
  ) {
    // Age-based escalation never raises a complaint to Critical.
    tier = Math.min(tier + 1, 3);
  }

  return tier;
}

function getTierLabel(tier) {
  return {
    4: 'Critical',
    3: 'High',
    2: 'Medium',
    1: 'Low'
  }[tier] || 'Medium';
}

function calculateWithinTierScore(complaint = {}, now = Date.now()) {
  const duplicateCount = Math.max(
    0,
    Number(complaint.duplicateCount) || 0
  );

  const duplicateScore = Math.min(duplicateCount * 5, 40);

  const ageScore = Math.min(
    Math.floor(getAgeDays(complaint.createdAt, now)) * 2,
    30
  );

  const safetyScore = complaint.isSafetyCategory === true ? 20 : 0;

  let peopleScore = 0;

  if (
    complaint.affectedPeople !== undefined &&
    complaint.affectedPeople !== null
  ) {
    peopleScore = Math.min(
      Math.max(0, Number(complaint.affectedPeople) || 0) / 10,
      10
    );
  } else if (
    complaint.upvotes !== undefined &&
    complaint.upvotes !== null
  ) {
    peopleScore = Math.min(
      Math.max(0, Number(complaint.upvotes) || 0) / 2,
      10
    );
  }

  // Keep the within-tier score below 100 to prevent tier overlap.
  const total =
    duplicateScore + ageScore + safetyScore + peopleScore;

  return Math.min(Math.round(total * 100) / 100, 99);
}

function calculatePriority(complaint = {}, now = Date.now()) {
  const effectiveSeverity = getEffectiveSeverity(complaint);
  const tier = getEffectiveTier(complaint, now);
  const score = calculateWithinTierScore(complaint, now);

  return {
    tier,
    score,
    displayPriority: tier * 100 + score,
    effectiveSeverity,
    effectiveTierLabel: getTierLabel(tier)
  };
}

// Backward-compatible with existing code that calls this function.
function computePriorityScore(complaint, now = Date.now()) {
  return calculatePriority(complaint, now).displayPriority;
}

function validTimestamp(value) {
  const timestamp =
    value == null ? NaN : new Date(value).getTime();

  return Number.isFinite(timestamp)
    ? timestamp
    : Number.MAX_SAFE_INTEGER;
}

class MaxHeapPriorityQueue {
  constructor() {
    this.heap = [];
  }

  isHigherPriority(a, b) {
    const aTier = Number(a.priorityTier) || 0;
    const bTier = Number(b.priorityTier) || 0;

    if (aTier !== bTier) return aTier > bTier;

    const aScore = Number(a.priorityScore) || 0;
    const bScore = Number(b.priorityScore) || 0;

    if (aScore !== bScore) return aScore > bScore;

    const aTime = validTimestamp(a.createdAt);
    const bTime = validTimestamp(b.createdAt);

    if (aTime !== bTime) return aTime < bTime;

    // Deterministic tie-breaker for equal priorities and timestamps.
    return String(a.complaintId || a._id || a.id || '').localeCompare(
      String(b.complaintId || b._id || b.id || '')
    ) < 0;
  }

  heapifyUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);

      if (
        !this.isHigherPriority(
          this.heap[index],
          this.heap[parent]
        )
      ) {
        break;
      }

      [this.heap[index], this.heap[parent]] = [
        this.heap[parent],
        this.heap[index]
      ];

      index = parent;
    }
  }

  heapifyDown(index) {
    const length = this.heap.length;

    while (true) {
      let highest = index;
      const left = index * 2 + 1;
      const right = left + 1;

      if (
        left < length &&
        this.isHigherPriority(
          this.heap[left],
          this.heap[highest]
        )
      ) {
        highest = left;
      }

      if (
        right < length &&
        this.isHigherPriority(
          this.heap[right],
          this.heap[highest]
        )
      ) {
        highest = right;
      }

      if (highest === index) break;

      [this.heap[index], this.heap[highest]] = [
        this.heap[highest],
        this.heap[index]
      ];

      index = highest;
    }
  }

  push(complaint) {
    this.heap.push(complaint);
    this.heapifyUp(this.heap.length - 1);
  }

  top() {
    return this.heap.length ? this.heap[0] : null;
  }

  pop() {
    if (!this.heap.length) return null;

    if (this.heap.length === 1) {
      return this.heap.pop();
    }

    const top = this.heap[0];

    this.heap[0] = this.heap.pop();
    this.heapifyDown(0);

    return top;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  size() {
    return this.heap.length;
  }
}

function toPlainObject(complaint) {
  if (complaint && typeof complaint.toObject === 'function') {
    return complaint.toObject();
  }

  return { ...complaint };
}

function rankByPriority(complaints = [], now = Date.now()) {
  const heap = new MaxHeapPriorityQueue();

  for (const item of complaints) {
    const complaint = toPlainObject(item || {});

    // Exclude resolved complaints regardless of status capitalization.
    if (
      String(complaint.status || '').toLowerCase() === 'resolved'
    ) {
      continue;
    }

    // Recalculate priority rather than trusting potentially stale values.
    const priority = calculatePriority(complaint, now);

    heap.push({
      ...complaint,
      priorityTier: priority.tier,
      priorityScore: priority.score,
      displayPriority: priority.displayPriority,
      priority: priority.displayPriority,
      effectiveSeverity: priority.effectiveSeverity,
      effectiveTierLabel: priority.effectiveTierLabel
    });
  }

  const ranked = [];

  while (!heap.isEmpty()) {
    ranked.push(heap.pop());
  }

  return ranked;
}

function peekHighestPriority(complaints = [], now = Date.now()) {
  return rankByPriority(complaints, now)[0] || null;
}

// Linked list for complaint status history.

class HistoryNode {
  constructor(status, timestamp, description) {
    this.status = status;
    this.timestamp = timestamp;
    this.description = description;
    this.next = null;
  }
}

class HistoryLinkedList {
  constructor() {
    this.head = null;
    this.tail = null;
    this.length = 0;
  }

  append(status, timestamp, description) {
    const node = new HistoryNode(
      status,
      timestamp,
      description
    );

    if (!this.head) {
      this.head = this.tail = node;
    } else {
      this.tail.next = node;
      this.tail = node;
    }

    this.length += 1;

    return node;
  }

  toArray() {
    const result = [];
    let current = this.head;

    while (current) {
      result.push({
        status: current.status,
        timestamp: current.timestamp,
        description: current.description
      });

      current = current.next;
    }

    return result;
  }

  isEmpty() {
    return this.head === null;
  }

  size() {
    return this.length;
  }
}

function buildHistoryTimeline(history) {
  const list = new HistoryLinkedList();

  if (Array.isArray(history)) {
    for (const item of history) {
      list.append(
        item.status,
        item.timestamp,
        item.description
      );
    }
  }

  return list.toArray();
}

// FIFO queue for complaint processing.

class ComplaintQueue {
  constructor() {
    this.items = [];
  }

  enqueue(complaint) {
    this.items.push(complaint);
  }

  dequeue() {
    return this.items.length ? this.items.shift() : null;
  }

  front() {
    return this.items.length ? this.items[0] : null;
  }

  isEmpty() {
    return this.items.length === 0;
  }

  size() {
    return this.items.length;
  }
}

function processQueue(complaints = []) {
  const queue = new ComplaintQueue();

  for (const complaint of complaints) {
    queue.enqueue(complaint);
  }

  const processed = [];

  while (!queue.isEmpty()) {
    processed.push(queue.dequeue());
  }

  return processed;
}

module.exports = {
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
  HistoryNode,
  HistoryLinkedList,
  buildHistoryTimeline,
  ComplaintQueue,
  processQueue
};
