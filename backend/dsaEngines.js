// In-process JS ports of the DSA engines in ../dsa/*.cpp.
//
// The original engines were compiled Windows .exe binaries spawned as
// child processes. That only works on a Windows host — Render (and most
// cloud hosts) run Linux, so the binaries can never execute there. These
// classes implement the identical algorithms (max-heap, linked list, FIFO
// queue) directly in Node so the same DSA logic actually runs in production.

// ======================================
// PRIORITY QUEUE — MAX HEAP
// (mirrors dsa/priority_engine.cpp)
// ======================================

class MaxHeapPriorityQueue {

  constructor() {
    this.heap = []
  }

  heapifyUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)

      if (this.heap[parent].priority >= this.heap[index].priority) {
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

      if (left < size && this.heap[left].priority > this.heap[largest].priority) {
        largest = left
      }

      if (right < size && this.heap[right].priority > this.heap[largest].priority) {
        largest = right
      }

      if (largest === index) {
        break
      }

      ;[this.heap[index], this.heap[largest]] = [this.heap[largest], this.heap[index]]
      index = largest
    }
  }

  push(item) {
    this.heap.push(item)
    this.heapifyUp(this.heap.length - 1)
  }

  top() {
    return this.heap[0]
  }

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

// Drains complaints out of a max heap, highest priority first.
function rankByPriority(complaints) {

  const queue = new MaxHeapPriorityQueue()

  for (const complaint of complaints) {
    queue.push(complaint)
  }

  const ranked = []

  while (!queue.isEmpty()) {
    ranked.push(queue.top())
    queue.pop()
  }

  return ranked
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
  MaxHeapPriorityQueue,
  rankByPriority,
  HistoryLinkedList,
  buildHistoryTimeline,
  ComplaintQueue,
  processQueue
}
