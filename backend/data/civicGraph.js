// Civic locality/road network for the "Response Route" feature.
//
// This is the one place demo data lives. The graph *structure* (Graph,
// Dijkstra, BFS, DFS in ../services/graphEngine.js) is fully generic and
// already reusable — pointing this file at a real ward/road dataset later
// (or loading NODE_IDS/EDGES/LOCATION_ALIASES from the database) requires
// no changes anywhere else.

const { Graph, shortestPath, isFullyConnected } = require('../services/graphEngine')

// Average city driving speed, used only to turn a Dijkstra distance (km)
// into an estimated response time. Not live traffic data — see the
// "Estimated Response Time" label wherever this is surfaced.
const AVERAGE_SPEED_KMH = 30

// The civic areas that actually exist as graph nodes. resolveLocationToNode
// below will NEVER return anything outside this list — adding a locality
// to LOCATION_ALIASES without adding it here (and to EDGES) does nothing.
//
// These are the localities that actually show up in CivicPulse's complaint
// data (Pimpri-Chinchwad / Pune area) rather than placeholder ward names —
// see LOCATION_ALIASES below for exactly which raw complaint strings map
// to each one.
const NODE_IDS = [
  'Municipal Office',
  'Akurdi',
  'Nigdi',
  'Pimpri',
  'Moshi',
  'Charholi',
  'Shivajinagar',
  'Karvenagar'
]

// [fromId, toId, distanceKm] — undirected roads between areas. These are
// modeled/simulated distances for the demo civic network, not measured
// real-world road distances.
const EDGES = [
  ['Municipal Office', 'Akurdi', 3],
  ['Municipal Office', 'Shivajinagar', 8],
  ['Akurdi', 'Nigdi', 2],
  ['Akurdi', 'Pimpri', 3],
  ['Nigdi', 'Pimpri', 2],
  ['Nigdi', 'Moshi', 4],
  ['Pimpri', 'Moshi', 5],
  ['Moshi', 'Charholi', 3],
  ['Shivajinagar', 'Karvenagar', 6]
]

// Response dispatch points. There is exactly one today (the municipal
// office — CivicPulse has no live worker-location tracking yet), but every
// caller goes through findBestResponse() below instead of reading this
// constant directly, so adding a second response/maintenance center or a
// tracked worker later is a one-line addition here, not a rewrite of the
// routing logic.
const RESPONSE_SOURCES = [
  { id: 'Municipal Office', label: 'Municipal Office' }
]

// Free-text phrase -> graph node it identifies. Every value here MUST be
// one of NODE_IDS above; resolveLocationToNode enforces that at startup
// (see the check below) so a typo here fails loudly instead of silently
// never matching. Extend this list as real localities come up — do not
// add a phrase without also making sure its target node genuinely exists.
//
// Deliberately excluded: "pccoe" (Pimpri Chinchwad College of Engineering)
// sits right on the Akurdi/Nigdi boundary and shows up in real complaints
// tied to both ("Near PCCOE, Nigdi" and "Pccoe akurdi") — mapping it to
// either node would be a guess, not a match, so it's left unmapped and
// resolution instead relies on the explicit locality name that's always
// present alongside it. Same reasoning kept "sainath society" OUT of this
// map: it names a society that exists in more than one locality in real
// complaint data ("sainath society,charholi" vs "Sainath Society ,
// Shivajinagar") — aliasing it to one would have silently misrouted the
// other, so only the unambiguous locality name after it is matched.
const LOCATION_ALIASES = {
  'municipal office': 'Municipal Office',
  'corporation office': 'Municipal Office',
  'city hall': 'Municipal Office',
  'ward office': 'Municipal Office',

  'akurdi': 'Akurdi',
  'akurdi railway station': 'Akurdi',

  'nigdi': 'Nigdi',
  'nigdi pradhikaran': 'Nigdi',

  'pimpri': 'Pimpri',
  'pimpri market': 'Pimpri',

  'moshi': 'Moshi',
  'santnagar': 'Moshi',
  'sant nagar': 'Moshi',
  'sai residency': 'Moshi',

  'charholi': 'Charholi',
  'charholi gaon': 'Charholi',
  'charholi phata': 'Charholi',

  'shivajinagar': 'Shivajinagar',

  'karvenagar': 'Karvenagar',
  'karve nagar': 'Karvenagar'
}

for (const [alias, nodeId] of Object.entries(LOCATION_ALIASES)) {
  if (!NODE_IDS.includes(nodeId)) {
    throw new Error(`civicGraph: LOCATION_ALIASES["${alias}"] points at "${nodeId}", which is not in NODE_IDS.`)
  }
}

function buildCivicGraph() {

  const graph = new Graph()

  for (const id of NODE_IDS) {
    graph.addNode(id)
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


// ======================================
// LOCATION -> GRAPH NODE RESOLUTION
// ======================================

// Lowercases, strips punctuation down to plain word-separating spaces, and
// collapses whitespace, so "Sainath Society, Charholi", "sainath society
// charholi" and "SAINATH SOCIETY   CHARHOLI" all compare equal.
function normalizeLocationText(text) {

  return text
    .toLowerCase()
    .replace(/[.,;:#()/\\_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

}

function escapeForRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// True when `phrase` occurs in `normalizedText` as whole words — i.e. not
// as part of a longer word — so an alias like "ward 1" cannot accidentally
// match inside "ward 10". Both inputs are assumed already normalized.
function containsPhrase(normalizedText, phrase) {

  const pattern = new RegExp(`(^|\\s)${escapeForRegExp(phrase)}(\\s|$)`)

  return pattern.test(normalizedText)

}

// Maps a complaint's free-text location to the graph node it belongs to,
// or null when the location can't be reliably identified. Match order,
// most confident first:
//
//   1. The text names a graph node directly ("Karvenagar").
//   2. The text is exactly a known alias phrase ("charholi").
//   3. A known alias phrase occurs as whole words somewhere in the text
//      ("sainath society, charholi" contains "sainath society").
//
// There is deliberately NO fallback beyond this (an earlier version
// hashed unmatched text to a pseudo-random node so every complaint
// "looked like" it had a route — that produced a precise-looking
// distance/ETA for a location the graph never actually recognized, which
// is misleading). An unresolved location means the caller should say the
// route is unavailable, not guess one.
function resolveLocationToNode(locationText) {

  if (!locationText) return null

  const normalized = normalizeLocationText(locationText)

  if (!normalized) return null

  const directNodeMatch = NODE_IDS.find(id => normalizeLocationText(id) === normalized)

  if (directNodeMatch) return directNodeMatch

  if (LOCATION_ALIASES[normalized]) return LOCATION_ALIASES[normalized]

  // Longest alias first: "sainath society" should win over any shorter
  // alias that happens to also appear in the same text.
  const containedAlias = Object.keys(LOCATION_ALIASES)
    .sort((a, b) => b.length - a.length)
    .find(alias => containsPhrase(normalized, alias))

  return containedAlias ? LOCATION_ALIASES[containedAlias] : null

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
    nodes: [...NODE_IDS],
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
