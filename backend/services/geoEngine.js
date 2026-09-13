// Pure geographic distance math — no complaint/graph domain knowledge, so
// it's independently testable like graphEngine.js. This is what decides
// whether an unresolved complaint's actual GPS coordinates lie physically
// close to a computed response route ("along route" detection) — never by
// comparing graph-node names, only real coordinates.
//
// See ../data/civicGraph.js for where the route polyline (approximate
// locality coordinates) and the corridor threshold are defined, and
// ../routes/complaintRoutes.js for how this is wired into the response
// route endpoint.

const EARTH_RADIUS_METERS = 6371000

function toRadians(degrees) {
  return (degrees * Math.PI) / 180
}

// Great-circle distance between two {lat, lon} points, in meters.
// Time complexity: O(1).
function haversineMeters(a, b) {

  const dLat = toRadians(b.lat - a.lat)
  const dLon = toRadians(b.lon - a.lon)

  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)

  const h = sinLat * sinLat +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * sinLon * sinLon

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)))

}

// Projects a {lat, lon} point to local planar meters using an
// equirectangular approximation anchored at refLat. This is accurate to
// within a few meters at the scale a city civic network spans (a handful
// of km), and far cheaper than exact spherical segment geometry — good
// enough for a 150 m corridor threshold, not for surveying.
function toLocalMeters(point, refLat) {

  return {
    x: toRadians(point.lon) * Math.cos(toRadians(refLat)) * EARTH_RADIUS_METERS,
    y: toRadians(point.lat) * EARTH_RADIUS_METERS
  }

}

// Shortest distance from `point` to the line SEGMENT a-b, in meters.
// Time complexity: O(1).
function pointToSegmentMeters(point, a, b) {

  const refLat = (a.lat + b.lat) / 2

  const p = toLocalMeters(point, refLat)
  const start = toLocalMeters(a, refLat)
  const end = toLocalMeters(b, refLat)

  const abx = end.x - start.x
  const aby = end.y - start.y
  const lengthSquared = abx * abx + aby * aby

  let t = lengthSquared === 0
    ? 0
    : ((p.x - start.x) * abx + (p.y - start.y) * aby) / lengthSquared

  t = Math.max(0, Math.min(1, t))

  const closest = { x: start.x + t * abx, y: start.y + t * aby }

  const dx = p.x - closest.x
  const dy = p.y - closest.y

  return Math.sqrt(dx * dx + dy * dy)

}

// Shortest distance from `point` to the whole route polyline (an ordered
// list of {lat, lon} points) — the minimum over every consecutive
// segment. Time complexity: O(route length).
function distanceToRouteMeters(point, routePoints) {

  if (!routePoints || routePoints.length === 0) return Infinity

  if (routePoints.length === 1) {
    return haversineMeters(point, routePoints[0])
  }

  let minDistance = Infinity

  for (let i = 0; i < routePoints.length - 1; i++) {

    const distance = pointToSegmentMeters(point, routePoints[i], routePoints[i + 1])

    if (distance < minDistance) minDistance = distance

  }

  return minDistance

}

module.exports = {
  haversineMeters,
  pointToSegmentMeters,
  distanceToRouteMeters
}
