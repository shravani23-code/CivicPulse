// Generic weighted graph + traversal/shortest-path algorithms used to model
// the civic locality/road network (see ../data/civicGraph.js for the actual
// dataset). Kept independent of complaints/Express so it can be reused or
// unit-tested on its own — the graph is a plain data structure, not UI.

// ======================================
// GRAPH — ADJACENCY LIST
//
// Time complexity:
//   addNode              — O(1)
//   addEdge              — O(1)
//   neighbors(id)        — O(1) to fetch the list (iterating it is O(degree))
//
// An adjacency list is used instead of an adjacency matrix because the
// civic road network is sparse (each area connects to a handful of
// neighbours, not to every other area) — O(V + E) space instead of O(V^2).
// ======================================

class Graph {

  constructor() {
    this.adjacency = new Map() // nodeId -> Array<{ node, weight }>
  }

  addNode(id) {
    if (!this.adjacency.has(id)) {
      this.adjacency.set(id, [])
    }
  }

  // Undirected: a road connects both areas both ways.
  addEdge(fromId, toId, weight) {
    this.addNode(fromId)
    this.addNode(toId)

    this.adjacency.get(fromId).push({ node: toId, weight })
    this.adjacency.get(toId).push({ node: fromId, weight })
  }

  hasNode(id) {
    return this.adjacency.has(id)
  }

  neighbors(id) {
    return this.adjacency.get(id) || []
  }

  nodeIds() {
    return [...this.adjacency.keys()]
  }
}


// ======================================
// MIN HEAP (used by Dijkstra as the priority queue)
//
// Time complexity: push/pop are O(log n), same reasoning as the max-heap
// priority queue already used for complaint prioritization in dsaEngines.js
// — only the comparison direction differs (smallest distance wins here).
// ======================================

class MinHeap {

  constructor() {
    this.heap = []
  }

  isSmaller(a, b) {
    return a.distance < b.distance
  }

  heapifyUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)

      if (!this.isSmaller(this.heap[index], this.heap[parent])) break

      ;[this.heap[parent], this.heap[index]] = [this.heap[index], this.heap[parent]]
      index = parent
    }
  }

  heapifyDown(index) {
    const size = this.heap.length

    while (true) {
      const left = 2 * index + 1
      const right = 2 * index + 2
      let smallest = index

      if (left < size && this.isSmaller(this.heap[left], this.heap[smallest])) smallest = left
      if (right < size && this.isSmaller(this.heap[right], this.heap[smallest])) smallest = right

      if (smallest === index) break

      ;[this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]]
      index = smallest
    }
  }

  push(item) {
    this.heap.push(item)
    this.heapifyUp(this.heap.length - 1)
  }

  pop() {
    if (this.heap.length === 0) return undefined

    const top = this.heap[0]
    const last = this.heap.pop()

    if (this.heap.length > 0) {
      this.heap[0] = last
      this.heapifyDown(0)
    }

    return top
  }

  isEmpty() {
    return this.heap.length === 0
  }
}


// ======================================
// DIJKSTRA — SHORTEST PATH
//
// Time complexity: O((V + E) log V) — every node is popped from the min
// heap once (O(log V) each) and every edge can trigger one heap push
// (O(log V) each). This is what actually decides the fastest route a
// municipal worker should drive from their current location to a
// reported complaint, using road distance as edge weight.
// ======================================

function dijkstra(graph, sourceId) {

  const distances = new Map()
  const previous = new Map()

  for (const id of graph.nodeIds()) {
    distances.set(id, Infinity)
  }

  if (!graph.hasNode(sourceId)) {
    return { distances, previous }
  }

  distances.set(sourceId, 0)

  const queue = new MinHeap()
  queue.push({ node: sourceId, distance: 0 })

  const visited = new Set()

  while (!queue.isEmpty()) {

    const { node: currentId, distance: currentDistance } = queue.pop()

    if (visited.has(currentId)) continue
    visited.add(currentId)

    for (const edge of graph.neighbors(currentId)) {

      const candidateDistance = currentDistance + edge.weight

      if (candidateDistance < distances.get(edge.node)) {
        distances.set(edge.node, candidateDistance)
        previous.set(edge.node, currentId)
        queue.push({ node: edge.node, distance: candidateDistance })
      }

    }

  }

  return { distances, previous }

}

// Reconstructs the actual node-by-node route from Dijkstra's `previous`
// map and returns it alongside the total distance. Returns null path when
// the target is unreachable (e.g. a disconnected demo dataset).
function shortestPath(graph, sourceId, targetId) {

  if (!graph.hasNode(sourceId) || !graph.hasNode(targetId)) {
    return { path: null, distance: Infinity }
  }

  const { distances, previous } = dijkstra(graph, sourceId)

  const distance = distances.get(targetId)

  if (distance === undefined || distance === Infinity) {
    return { path: null, distance: Infinity }
  }

  const path = [targetId]
  let current = targetId

  while (current !== sourceId) {
    current = previous.get(current)
    path.push(current)
  }

  path.reverse()

  return { path, distance }

}


// ======================================
// BFS — NEARBY CONNECTED AREAS
//
// Time complexity: O(V + E) — every node is enqueued at most once and
// every edge is examined at most once. Used to answer "which areas are
// within N road-hops of this complaint?" — a level-order exploration,
// which is exactly what a FIFO queue gives us (unlike DFS, which would
// dive deep down one branch before covering nearer areas).
// ======================================

function bfsWithinHops(graph, sourceId, maxHops = 1) {

  if (!graph.hasNode(sourceId)) return []

  const visited = new Set([sourceId])
  const result = []

  const queue = [{ node: sourceId, hops: 0 }] // array used as a FIFO queue (push/shift)

  while (queue.length > 0) {

    const { node: currentId, hops } = queue.shift()

    if (hops >= maxHops) continue

    for (const edge of graph.neighbors(currentId)) {

      if (visited.has(edge.node)) continue

      visited.add(edge.node)
      result.push(edge.node)
      queue.push({ node: edge.node, hops: hops + 1 })

    }

  }

  return result

}


// ======================================
// DFS — CONNECTED REGION / GRAPH INTEGRITY
//
// Time complexity: O(V + E) — every node is pushed at most once and every
// edge is examined at most once. Implemented iteratively with an explicit
// stack (rather than recursion) so it can't blow the call stack on a
// larger real-world road network later.
//
// This isn't surfaced in the UI — it's used internally to confirm the
// civic graph dataset is a single connected network (see civicGraph.js),
// which is what makes "is there any route at all" a safe assumption
// before Dijkstra ever runs.
// ======================================

function dfsConnectedComponent(graph, sourceId) {

  const visited = new Set()

  if (!graph.hasNode(sourceId)) return visited

  const stack = [sourceId]

  while (stack.length > 0) {

    const currentId = stack.pop()

    if (visited.has(currentId)) continue
    visited.add(currentId)

    for (const edge of graph.neighbors(currentId)) {
      if (!visited.has(edge.node)) {
        stack.push(edge.node)
      }
    }

  }

  return visited

}

// True when every node in the graph is reachable from every other node.
function isFullyConnected(graph) {

  const ids = graph.nodeIds()

  if (ids.length === 0) return true

  const reachable = dfsConnectedComponent(graph, ids[0])

  return reachable.size === ids.length

}

module.exports = {
  Graph,
  MinHeap,
  dijkstra,
  shortestPath,
  bfsWithinHops,
  dfsConnectedComponent,
  isFullyConnected
}
