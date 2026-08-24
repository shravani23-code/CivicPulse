// In-process JS ports of the DSA engines in ../dsa/*.cpp.
//
// The original engines were compiled Windows .exe binaries spawned as
// child processes. That only works on a Windows host — Render (and most
// cloud hosts) run Linux, so the binaries can never execute there. These
// classes implement the identical algorithms (max-heap, linked list, FIFO
// queue) directly in Node so the same DSA logic actually runs in production.

// ======================================
// SEVERITY vs PRIORITY
// ======================================
//
// Severity is a fixed judgment of how serious the civic issue itself is
// (set once, by the citizen, at submission time). Priority is a computed
// score that decides processing order — it starts from severity but also
// grows the longer a complaint has been waiting, so an old Medium
// complaint can eventually outrank a brand-new High one. Priority is
// never typed in by anyone; it's recalculated from this formula every
// time complaints are read.
//
//   priorityScore = severityScore(severity) + waitingTimeFactor(createdAt)
//
//   severityScore: Critical=40, High=30, Medium=20, Low=10
//   waitingTimeFactor: +2 for every 6 hours a Pending/In Progress
//                       complaint has been waiting, capped at +20

function severityScore(severity) {

  if (severity === 'Critical') return 40
  if (severity === 'High') return 30
  if (severity === 'Medium') return 20

  return 10
}

function waitingTimeFactor(createdAt, status) {

  if (status === 'Resolved') {
    return 0
  }

  const ageMs = Date.now() - new Date(createdAt).getTime()
  const ageHours = ageMs / (1000 * 60 * 60)

  const bonus = Math.floor(ageHours / 6) * 2

  return Math.min(bonus, 20)
}

function computePriorityScore(complaint) {

  return severityScore(complaint.severity) + waitingTimeFactor(complaint.createdAt, complaint.status)

}


// ======================================
// PRIORITY QUEUE — MAX HEAP
// (mirrors dsa/priority_engine.cpp)
//
// Time complexity:
//   push (insert)   — O(log n)  (heapifyUp walks at most tree height)
//   top  (peek)      — O(1)      (highest priority is always the root)
//   pop  (extract)   — O(log n)  (heapifyDown walks at most tree height)
//
// A plain array would need O(n) to find the max on every extraction
// (or O(n log n) to re-sort after every insert/status change). The heap
// keeps the "next complaint to handle" retrieval at O(1) and every
// insert/extract at O(log n), which is what actually matters when the
// admin is repeatedly asking "what's most urgent right now?".
// ======================================

class MaxHeapPriorityQueue {

  constructor() {
    this.heap = []
  }

  // Higher score wins; equal scores are broken by age (older first) so
  // equal-priority complaints don't get an arbitrary/unstable order.
  isHigherPriority(a, b) {

    if (a.priority !== b.priority) {
      return a.priority > b.priority
    }

    return new Date(a.createdAt).getTime() < new Date(b.createdAt).getTime()
  }

  heapifyUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)

      if (!this.isHigherPriority(this.heap[index], this.heap[parent])) {
        break
      }

      ;[this.heap[parent], this.heap[index]] = [this.heap[index], this.heap[parent]]
      index = parent
    }
  }

  heapifyDown(index) {
    const size = this.heap.length

    while (true) {
      const left = 2 * index + 1
      const right = 2 * index + 2
      let largest = index

      if (left < size && this.isHigherPriority(this.heap[left], this.heap[largest])) {
        largest = left
      }

      if (right < size && this.isHigherPriority(this.heap[right], this.heap[largest])) {
        largest = right
      }

      if (largest === index) {
        break
      }

      ;[this.heap[index], this.heap[largest]] = [this.heap[largest], this.heap[index]]
      index = largest
    }
  }

  // Insert — O(log n)
  push(item) {
    this.heap.push(item)
    this.heapifyUp(this.heap.length - 1)
  }

  // Peek — O(1)
  top() {
    return this.heap[0]
  }

  // Extract highest priority — O(log n)
  pop() {
    if (this.heap.length === 0) return

    this.heap[0] = this.heap[this.heap.length - 1]
    this.heap.pop()

    if (this.heap.length > 0) {
      this.heapifyDown(0)
    }
  }

  isEmpty() {
    return this.heap.length === 0
  }
}

// Builds a max heap from complaints (computing each one's live priority
// score first) and drains it — the resulting order is the actual heap
// extraction order, not a plain array .sort().
function rankByPriority(complaints) {

  const queue = new MaxHeapPriorityQueue()

  for (const complaint of complaints) {

    const priority = computePriorityScore(complaint)

    queue.push({
      ...(complaint.toObject ? complaint.toObject() : complaint),
      priority
    })

  }

  const ranked = []

  while (!queue.isEmpty()) {
    ranked.push(queue.top())
    queue.pop()
  }

  return ranked
}

// Peek only — builds the heap and returns the single most urgent
// complaint without extracting it. O(n) to build + O(1) to read the top.
function peekHighestPriority(complaints) {

  const queue = new MaxHeapPriorityQueue()

  for (const complaint of complaints) {

    const priority = computePriorityScore(complaint)

    queue.push({
      ...(complaint.toObject ? complaint.toObject() : complaint),
      priority
    })

  }

  return queue.isEmpty() ? null : queue.top()
}


// ======================================
// COMPLAINT HISTORY — LINKED LIST
// (mirrors dsa/history_engine.cpp)
// ======================================

class HistoryNode {
  constructor(status, timestamp, description) {
    this.status = status
    this.timestamp = timestamp
    this.description = description
    this.next = null
  }
}

class HistoryLinkedList {

  constructor() {
    this.head = null
    this.tail = null
  }

  addHistory(status, timestamp, description) {
    const node = new HistoryNode(status, timestamp, description)

    if (this.head === null) {
      this.head = node
      this.tail = node
    } else {
      this.tail.next = node
      this.tail = node
    }
  }

  toArray() {
    const result = []
    let current = this.head

    while (current !== null) {
      result.push({
        status: current.status,
        timestamp: current.timestamp,
        description: current.description
      })

      current = current.next
    }

    return result
  }
}

// Builds a linked list from stored history entries and walks it in order.
function buildHistoryTimeline(historyEntries) {

  const list = new HistoryLinkedList()

  for (const entry of historyEntries) {
    list.addHistory(
      entry.status,
      new Date(entry.timestamp).toISOString(),
      entry.description || ''
    )
  }

  return list.toArray()
}


// ======================================
// COMPLAINT PROCESSING QUEUE — FIFO
// ======================================

class ComplaintQueue {

  constructor() {
    this.items = []
  }

  enqueue(item) {
    this.items.push(item)
  }

  dequeue() {
    return this.items.shift()
  }

  isEmpty() {
    return this.items.length === 0
  }
}

// Drains complaints out of a FIFO queue in the order they were enqueued
// (oldest unresolved complaint first).
function processQueue(complaints) {

  const queue = new ComplaintQueue()

  for (const complaint of complaints) {
    queue.enqueue(complaint)
  }

  const processed = []

  while (!queue.isEmpty()) {
    processed.push(queue.dequeue())
  }

  return processed
}

module.exports = {
  severityScore,
  waitingTimeFactor,
  computePriorityScore,
  MaxHeapPriorityQueue,
  rankByPriority,
  peekHighestPriority,
  HistoryLinkedList,
  buildHistoryTimeline,
  ComplaintQueue,
  processQueue
}
