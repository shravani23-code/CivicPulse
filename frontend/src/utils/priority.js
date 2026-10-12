// Urgency bands for the 0-100 priority score. These MUST match
// URGENCY_BANDS in backend/dsaEngines.js — the backend already sends
// `urgencyLevel` with every complaint, so these are only a fallback for
// responses that lack it.
export const URGENCY_BANDS = [
  { label: 'Critical', min: 80 },
  { label: 'High', min: 60 },
  { label: 'Medium', min: 35 },
  { label: 'Low', min: 0 }
]

export function getUrgencyLevel(score) {

  const value = Number(score)

  if (!Number.isFinite(value)) return null

  return URGENCY_BANDS.find(band => value >= band.min)?.label ?? 'Low'

}

export function urgencyOf(complaint) {
  return complaint?.urgencyLevel || getUrgencyLevel(complaint?.priority)
}

// "Submitted today" / "Waiting 3 days" for open complaints; resolved
// complaints just show when they were submitted.
export function describeWaiting(complaint) {

  const created = new Date(complaint?.createdAt)

  if (Number.isNaN(created.getTime())) return ''

  if (complaint.status === 'Resolved') {
    return `Submitted ${created.toLocaleDateString()}`
  }

  const days = Number.isFinite(complaint.waitingDays)
    ? complaint.waitingDays
    : Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000))

  if (days === 0) return 'Submitted today'

  return `Waiting ${days} day${days === 1 ? '' : 's'}`

}
