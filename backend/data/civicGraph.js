// Civic locality/road network for the "Response Route" feature.
//
// This is the one place demo data lives. The graph *structure* (Graph,
// Dijkstra, BFS, DFS in ../services/graphEngine.js) is fully generic and
// already reusable — pointing this file at a real ward/road dataset later
// (or loading NODES/EDGES/RESPONSE_SOURCES from the database) requires no
// changes anywhere else.

const { Graph, shortestPath, isFullyConnected } = require('../services/graphEngine')

// Average city driving speed, used only to turn a Dijkstra distance (km)
// into an estimated response time. Not live traffic data — see the
// "Estimated Response Time" label wherever this is surfaced.
const AVERAGE_SPEED_KMH = 30

// Each node lists keywords that identify it inside a complaint's
// free-text location (typed by the citizen, or reverse-geocoded from
// GPS). Matching is deliberately conservative — see resolveLocationToNode
// below for why an unmatched location does NOT get a guessed node.
const NODES = [
  { id: 'Municipal Office', aliases: ['municipal office', 'corporation office', 'city hall', 'ward office'] },
  { id: 'Ward 1', aliases: ['ward 1', 'ward no 1', 'ward no. 1'] },
  { id: 'Ward 2', aliases: ['ward 2', 'ward no 2', 'ward no. 2'] },
  { id: 'Central Market', aliases: ['central market', 'main bazaar', 'market road', 'market yard'] },
  { id: 'Ward 4', aliases: ['ward 4', 'ward no 4', 'ward no. 4'] },
  { id: 'Ward 5', aliases: ['ward 5', 'ward no 5', 'ward no. 5'] },
  { id: 'Karvenagar', aliases: ['karvenagar', 'karve nagar'] }
]

// [fromId, toId, distanceKm] — undirected roads between areas.
const EDGES = [
  ['Municipal Office', 'Ward 1', 2],
  ['Municipal Office', 'Ward 2', 3],
  ['Ward 1', 'Ward 4', 4],
  ['Ward 2', 'Central Market', 2],
  ['Central Market', 'Ward 4', 2],
  ['Central Market', 'Ward 5', 3],
  ['Ward 4', 'Ward 5', 2],
  ['Ward 4', 'Karvenagar', 3],
  ['Ward 5', 'Karvenagar', 2]
]

// Response dispatch points. There is exactly one today (the municipal
// office — CivicPulse has no live worker-location tracking yet), but every
// caller goes through findBestResponseSource() below instead of reading
// this constant directly, so adding a second response/maintenance center
// or a tracked worker later is a one-line addition here, not a rewrite of
// the routing logic.
const RESPONSE_SOURCES = [
  { id: 'Municipal Office', label: 'Municipal Office' }
]

function buildCivicGraph() {

  const graph = new Graph()

  for (const node of NODES) {
    graph.addNode(node.id)
  }

  for (const [fromId, toId, distanceKm] of EDGES) {
    graph.addEdge(fromId, toId, distanceKm)
  }

  return graph

}

const civicGraph = buildCivicGraph()

// Integrity check, not a UI feature — confirms the dataset is one
// connected network (via DFS) so "no route found" always means a real
// gap, not a broken dataset. Runs once at startup.
if (!isFullyConnected(civicGraph)) {
  console.warn('civicGraph: dataset is not fully connected — some routes may be legitimately unreachable.')
}

// Maps a complaint's free-text location to the graph node it belongs to,
// or null when the location can't be reliably identified.
//
// There is deliberately NO fallback here (an earlier version hashed
// unmatched text to a pseudo-random node so every complaint "looked like"
// it had a route — that produced a precise-looking distance/ETA for a
// location the graph never actually recognized, which is misleading).
// An unresolved location means the caller should say the route is
// unavailable, not guess one.
function resolveLocationToNode(locationText) {

  if (!locationText) return null

  const normalized = locationText.toLowerCase()

  const match = NODES.find(node => node.aliases.some(alias => normalized.includes(alias)))

  return match ? match.id : null

}

// Picks whichever response source can reach the destination with the
// lowest-cost Dijkstra route. With a single source today this just runs
// Dijkstra once; with multiple sources/workers later it runs one Dijkstra
// per candidate and keeps the cheapest — the route endpoint doesn't need
// to change either way.
function findBestResponse(destinationNode) {

  let best = null

  for (const source of RESPONSE_SOURCES) {

    const result = shortestPath(civicGraph, source.id, destinationNode)

    if (!result.path) continue

    if (!best || result.distance < best.distance) {
      best = { source: source.id, path: result.path, distance: result.distance }
    }

  }

  return best

}

// Read-only snapshot of the graph for the admin-only visualization — the
// frontend draws whatever the backend actually routes over, instead of a
// hand-drawn diagram that could drift out of sync with it.
function getGraphSnapshot() {

  return {
    nodes: NODES.map(node => node.id),
    edges: EDGES.map(([from, to, weight]) => ({ from, to, weight }))
  }

}

module.exports = {
  civicGraph,
  RESPONSE_SOURCES,
  AVERAGE_SPEED_KMH,
  resolveLocationToNode,
  findBestResponse,
  getGraphSnapshot
}
