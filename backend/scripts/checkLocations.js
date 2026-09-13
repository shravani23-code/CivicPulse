// Dev diagnostic: checks every distinct complaint location currently in
// the database against resolveLocationToNode() + the Dijkstra route
// calculation, and reports PASS / CORRECTLY UNAVAILABLE for each — so
// adding a new locality to civicGraph.js can be verified against the
// real dataset instead of one complaint at a time.
//
// Read-only: makes no writes to the database.
//
// Run with: npm run check-locations   (from backend/)

require('dotenv').config()
const mongoose = require('mongoose')
const Complaint = require('../models/Complaint')
const { civicGraph, AVERAGE_SPEED_KMH, resolveLocationToNode, findBestResponse } = require('../data/civicGraph')
const { bfsWithinHops } = require('../services/graphEngine')

const BFS_INSPECTION_SEVERITIES = ['High', 'Critical']
const BFS_INSPECTION_HOPS = 2

async function main() {

  await mongoose.connect(process.env.MONGODB_URI)

  const complaints = await Complaint.find({}, 'location severity').lean()

  const byLocation = new Map()

  for (const complaint of complaints) {
    if (!byLocation.has(complaint.location)) {
      byLocation.set(complaint.location, complaint.severity)
    }
  }

  console.log(`Checking ${byLocation.size} distinct location(s) from ${complaints.length} complaint(s)...\n`)

  let passCount = 0
  let unavailableCount = 0

  for (const [location, severity] of byLocation) {

    const node = resolveLocationToNode(location)

    console.log(`"${location}"`)

    if (!node) {
      console.log('  -> null')
      console.log('  -> CORRECTLY UNAVAILABLE (no confident match — no route will be shown)\n')
      unavailableCount++
      continue
    }

    const best = findBestResponse(node)

    if (!best) {
      console.log(`  -> ${node}`)
      console.log('  -> UNAVAILABLE (resolved node has no path from Municipal Office — disconnected graph component)\n')
      unavailableCount++
      continue
    }

    const etaMinutes = Math.round((best.distance / AVERAGE_SPEED_KMH) * 60)

    console.log(`  -> ${node}`)
    console.log(`  -> PASS: ${best.path.join(' -> ')} | ${best.distance} km | ~${etaMinutes} min`)

    if (BFS_INSPECTION_SEVERITIES.includes(severity)) {
      const nearby = bfsWithinHops(civicGraph, node, BFS_INSPECTION_HOPS)
      console.log(`  -> nearby areas to inspect (${severity}): ${nearby.join(', ') || '(none)'}`)
    }

    console.log('')

    passCount++

  }

  console.log(`Summary: ${passCount} resolved, ${unavailableCount} unavailable, ${byLocation.size} total.`)

  await mongoose.disconnect()

}

main().catch(error => {
  console.error('checkLocations failed:', error.message)
  process.exit(1)
})
