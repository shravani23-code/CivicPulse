// Compact admin-only visualization of the civic road-network graph used
// by the backend's Dijkstra route calculation. It draws exactly the
// nodes/edges the server returned (see the `graph` field of
// GET /api/complaints/:id/route) — never a hand-drawn diagram — so what
// the admin sees always matches what the algorithm actually ran over.
//
// Layout: nodes are placed in columns by their BFS hop-distance from the
// response source (a small, self-contained BFS — not the same call as the
// backend's inspection BFS, just a layout aid) and stacked vertically
// within a column. This keeps the drawing readable and left-to-right for
// any small graph without hard-coding node positions.

const COLUMN_WIDTH = 128
const ROW_HEIGHT = 78
const PADDING_X = 44
const PADDING_Y = 40
const NODE_RADIUS = 16

function layoutGraph(nodes, edges, sourceId) {

  const adjacency = new Map(nodes.map(id => [id, []]))

  edges.forEach(edge => {
    adjacency.get(edge.from)?.push(edge.to)
    adjacency.get(edge.to)?.push(edge.from)
  })

  // BFS from the source assigns each node a column (hop distance).
  const level = new Map([[sourceId, 0]])
  const queue = [sourceId]

  while (queue.length > 0) {
    const current = queue.shift()
    for (const neighbor of adjacency.get(current) || []) {
      if (!level.has(neighbor)) {
        level.set(neighbor, level.get(current) + 1)
        queue.push(neighbor)
      }
    }
  }

  // Nodes unreachable from the source (a disconnected component) still
  // need a position — place them in one extra trailing column.
  const maxKnownLevel = Math.max(0, ...level.values())
  nodes.forEach(id => {
    if (!level.has(id)) level.set(id, maxKnownLevel + 1)
  })

  const columns = new Map()
  nodes.forEach(id => {
    const col = level.get(id)
    if (!columns.has(col)) columns.set(col, [])
    columns.get(col).push(id)
  })

  const maxRows = Math.max(...[...columns.values()].map(list => list.length))

  const positions = new Map()

  columns.forEach((ids, col) => {
    const columnHeight = (ids.length - 1) * ROW_HEIGHT
    const totalHeight = (maxRows - 1) * ROW_HEIGHT
    const startY = PADDING_Y + (totalHeight - columnHeight) / 2

    ids.forEach((id, row) => {
      positions.set(id, {
        x: PADDING_X + col * COLUMN_WIDTH,
        y: startY + row * ROW_HEIGHT
      })
    })
  })

  const width = PADDING_X * 2 + Math.max(...columns.keys()) * COLUMN_WIDTH
  const height = PADDING_Y * 2 + (maxRows - 1) * ROW_HEIGHT

  return { positions, width: Math.max(width, 200), height: Math.max(height, 120) }

}

function isPathEdge(edge, path) {

  for (let i = 0; i < path.length - 1; i++) {
    if (
      (path[i] === edge.from && path[i + 1] === edge.to) ||
      (path[i] === edge.to && path[i + 1] === edge.from)
    ) {
      return true
    }
  }

  return false

}

const MARKER_SIZE = 9
const MARKER_GAP = 13

const ALONG_ROUTE_COLOR = '#3b6ea5'
const NEXT_PRIORITY_COLOR = '#cf7a39'

function markerTooltip(item) {
  return `${item.id} — ${item.category} — ${item.severity} — Priority ${item.priority} — ${item.status} — ${item.location}`
}

// Small offset badges for complaints that aren't the current source/target
// but are still operationally relevant (along-route or next-priority).
// Several can land on the same node (e.g. two along-route complaints in
// the same locality) — stacked upward so they don't overlap.
function OperationalMarkers({ nodeId, positions, alongRoute, nextPriority }) {

  const pos = positions.get(nodeId)
  if (!pos) return null

  const markers = []

  if (nextPriority && nextPriority.node === nodeId) {
    markers.push({ color: NEXT_PRIORITY_COLOR, item: nextPriority })
  }

  for (const item of alongRoute) {
    if (item.node === nodeId) {
      markers.push({ color: ALONG_ROUTE_COLOR, item })
    }
  }

  return markers.map((marker, index) => {

    const x = pos.x + NODE_RADIUS - 2
    const y = pos.y - NODE_RADIUS - 4 - index * MARKER_GAP

    return (
      <rect
        key={`${nodeId}-${marker.item.id}`}
        x={x}
        y={y}
        width={MARKER_SIZE}
        height={MARKER_SIZE}
        rx={2}
        fill={marker.color}
      >
        <title>{markerTooltip(marker.item)}</title>
      </rect>
    )

  })

}

function RouteGraph({ graph, path, source, destination, alongRoute = [], nextPriority = null }) {

  if (!graph || graph.nodes.length === 0) return null

  const { positions, width, height } = layoutGraph(graph.nodes, graph.edges, source)

  const pathSet = new Set(path || [])

  // Extra vertical room for stacked operational-marker badges above nodes.
  const extraHeight = MARKER_GAP * 3

  return (
    <div className="route-graph">

      <svg viewBox={`0 -${extraHeight} ${width} ${height + extraHeight}`} style={{ width: '100%', height: 'auto', display: 'block' }}>

        {graph.edges.map(edge => {

          const from = positions.get(edge.from)
          const to = positions.get(edge.to)
          const onPath = path && isPathEdge(edge, path)

          return (
            <line
              key={`${edge.from}-${edge.to}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={onPath ? '#3f7d58' : '#d5ddd6'}
              strokeWidth={onPath ? 3 : 1.5}
            />
          )

        })}

        {graph.nodes.map(id => {

          const pos = positions.get(id)
          const isSource = id === source
          const isDestination = id === destination
          const onPath = pathSet.has(id)

          const fill = isSource
            ? '#d9a441'
            : isDestination
              ? '#a13c2d'
              : onPath
                ? '#dcefe3'
                : '#ffffff'

          const stroke = isSource || isDestination
            ? 'transparent'
            : onPath ? '#3f7d58' : '#d5ddd6'

          const textFill = isSource || isDestination ? '#ffffff' : '#263129'

          return (
            <g key={id}>
              <circle cx={pos.x} cy={pos.y} r={NODE_RADIUS} fill={fill} stroke={stroke} strokeWidth={1.5} />
              <text x={pos.x} y={pos.y + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill={textFill}>
                {isSource ? 'S' : isDestination ? '●' : ''}
              </text>
              <text x={pos.x} y={pos.y + NODE_RADIUS + 14} textAnchor="middle" fontSize="10.5" fill="#263129">
                {id}
              </text>
              <OperationalMarkers nodeId={id} positions={positions} alongRoute={alongRoute} nextPriority={nextPriority} />
            </g>
          )

        })}

      </svg>

      <div className="route-graph-legend">
        <span><i style={{ background: '#d9a441' }} /> Response source</span>
        <span><i style={{ background: '#a13c2d' }} /> Current target</span>
        {nextPriority && <span><i style={{ background: NEXT_PRIORITY_COLOR, borderRadius: '2px' }} /> Next priority</span>}
        {alongRoute.length > 0 && <span><i style={{ background: ALONG_ROUTE_COLOR, borderRadius: '2px' }} /> Along route</span>}
        <span><i style={{ background: '#3f7d58', borderRadius: '2px' }} /> Shortest route</span>
      </div>

    </div>
  )

}

export default RouteGraph
