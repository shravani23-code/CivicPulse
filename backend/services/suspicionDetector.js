// ======================================
// SUSPICIOUS-SUBMISSION DETECTOR
// ======================================
//
// Decides whether a new complaint should be HELD FOR AN ADMINISTRATOR,
// and records exactly why. It never decides that a complaint is fake,
// never rejects anything, never touches the account and never changes
// priority — only an administrator can confirm a complaint is invalid.
//
// There is no score. Each rule below either fires (with its evidence)
// or not, and ONE review signal is enough to send the complaint to the
// Moderation panel:
//
//   same_account_duplicate  The same account filed a near-identical
//                           complaint (same category, text similarity
//                           >= SUSPICION_DUPLICATE_SIMILARITY, same place)
//                           within SUSPICION_DUPLICATE_WINDOW_HOURS that is
//                           still open. Resolved or rejected ones don't
//                           count — re-reporting an unfixed problem later
//                           is legitimate.
//   rapid_submissions       More than SUSPICION_BURST_MAX complaints from
//                           one account within SUSPICION_BURST_WINDOW_MINUTES.
//   unusable_location       The location has no recognisable words/numbers.
//   content_check           The text checks in moderationEngine.js found
//                           abuse, threats, spam/links, meaningless text or
//                           no civic content (their reason is copied here).
//
// Information only (NEVER a signal):
//   relatedComplaintIds     Similar recent reports by OTHER citizens at the
//                           same place — many people reporting one broken
//                           streetlight is expected, not suspicious.
//
// Shared mobile numbers or network addresses are deliberately NOT used.
//
// Text similarity is the Sørensen–Dice coefficient over character
// trigram sets of the normalized text: |A ∩ B| * 2 / (|A| + |B|), built
// with Sets so each comparison is O(n). It tolerates spelling mistakes
// and word order changes; 1.0 means identical after normalization.

const { looksLikeWord } = require('./moderationEngine')

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'of', 'in', 'on',
  'at', 'to', 'for', 'and', 'or', 'it', 'its', 'this', 'that', 'there', 'here',
  'my', 'our', 'we', 'i', 'me', 'please', 'very', 'near', 'from', 'with', 'by',
  'since', 'not', 'no', 'has', 'have', 'had'
])

function numberFromEnv(name, fallback, { min = 0, max = Infinity } = {}) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback
}

function getConfig() {
  return {
    duplicateWindowMs: numberFromEnv('SUSPICION_DUPLICATE_WINDOW_HOURS', 72, { min: 1 }) * 60 * 60 * 1000,
    duplicateSimilarity: numberFromEnv('SUSPICION_DUPLICATE_SIMILARITY', 0.8, { min: 0.5, max: 1 }),
    relatedWindowMs: numberFromEnv('SUSPICION_RELATED_WINDOW_DAYS', 7, { min: 1 }) * 24 * 60 * 60 * 1000,
    relatedSimilarity: numberFromEnv('SUSPICION_RELATED_SIMILARITY', 0.5, { min: 0.2, max: 1 }),
    burstWindowMs: numberFromEnv('SUSPICION_BURST_WINDOW_MINUTES', 60, { min: 1 }) * 60 * 1000,
    burstMax: numberFromEnv('SUSPICION_BURST_MAX', 4, { min: 1 })
  }
}

// Lowercase, Unicode-normalized, punctuation removed, stopwords dropped.
function normalizeText(text) {

  return String(text || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .split(' ')
    .filter(word => word && !STOPWORDS.has(word))
    .join(' ')

}

function trigrams(normalized) {

  const grams = new Set()
  const padded = ` ${normalized} `

  for (let index = 0; index + 3 <= padded.length; index++) {
    grams.add(padded.slice(index, index + 3))
  }

  return grams

}

// Sørensen–Dice similarity of two texts, 0..1.
function textSimilarity(a, b) {

  const left = normalizeText(a)
  const right = normalizeText(b)

  if (!left || !right) return 0
  if (left === right) return 1

  const gramsA = trigrams(left)
  const gramsB = trigrams(right)

  let shared = 0

  for (const gram of gramsA) {
    if (gramsB.has(gram)) shared++
  }

  return (2 * shared) / (gramsA.size + gramsB.size)

}

function haversineMeters(lat1, lon1, lat2, lon2) {

  const toRad = degrees => (degrees * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2

  return 2 * 6371000 * Math.asin(Math.sqrt(h))

}

const NEARBY_METERS = 300

// Same place: GPS within 300 m when both have coordinates, otherwise the
// location texts match closely (or one contains the other).
function sameLocation(a, b) {

  const coords = [a.latitude, a.longitude, b.latitude, b.longitude]

  if (coords.every(value => typeof value === 'number' && Number.isFinite(value))) {
    return haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude) <= NEARBY_METERS
  }

  const left = normalizeText(a.location)
  const right = normalizeText(b.location)

  if (!left || !right) return false

  if (left === right || left.includes(right) || right.includes(left)) return true

  return textSimilarity(left, right) >= 0.7

}

function complaintText(complaint) {
  return `${complaint.title || ''} ${complaint.description || ''}`
}

// A location with no recognisable word or number cannot be acted on.
function isUnusableLocation(location) {

  const tokens = String(location || '').toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) || []

  if (tokens.length === 0) return true

  // Any digit (house / plot / ward number) or a real-looking word is enough.
  return !tokens.some(token => /\d/.test(token) || (token.length >= 2 && looksLikeWord(token)))

}

// Pure decision function — no database access, easy to test.
//
//   candidate      the new complaint's fields
//   moderation     result of moderateComplaint() for its text
//   ownRecent      this citizen's recent complaints (any status)
//   othersRecent   other citizens' recent complaints in the same category
//   now            Date.now() at submission
function evaluateSuspicion({ candidate, moderation, ownRecent = [], othersRecent = [], now = Date.now() }) {

  const config = getConfig()
  const signals = []
  const candidateText = complaintText(candidate)

  // 1. Near-duplicate from the same account, still open.
  const duplicates = ownRecent.filter(previous =>
    now - new Date(previous.createdAt).getTime() <= config.duplicateWindowMs &&
    previous.status !== 'Resolved' &&
    previous.moderationStatus !== 'rejected' &&
    previous.category === candidate.category &&
    sameLocation(previous, candidate) &&
    textSimilarity(complaintText(previous), candidateText) >= config.duplicateSimilarity
  )

  if (duplicates.length) {

    const best = Math.max(...duplicates.map(previous => textSimilarity(complaintText(previous), candidateText)))

    signals.push({
      rule: 'same_account_duplicate',
      reason: 'Very similar to an open complaint recently submitted from the same account.',
      evidence: `Text similarity ${Math.round(best * 100)}% (threshold ${Math.round(config.duplicateSimilarity * 100)}%), same category and location, within ${Math.round(config.duplicateWindowMs / 3600000)} hours.`,
      matchedComplaintIds: duplicates.map(previous => previous.id).slice(0, 10)
    })

  }

  // 2. Burst of submissions from one account.
  const burst = ownRecent.filter(previous => now - new Date(previous.createdAt).getTime() <= config.burstWindowMs)

  if (burst.length >= config.burstMax) {

    signals.push({
      rule: 'rapid_submissions',
      reason: 'Unusually many complaints from the same account in a short time.',
      evidence: `${burst.length + 1} complaints within ${Math.round(config.burstWindowMs / 60000)} minutes (review threshold: more than ${config.burstMax}).`,
      matchedComplaintIds: burst.map(previous => previous.id).slice(0, 10)
    })

  }

  // 3. Location that cannot be acted on.
  if (isUnusableLocation(candidate.location)) {

    signals.push({
      rule: 'unusable_location',
      reason: 'The location does not contain a recognisable place name or number.',
      evidence: 'Location text has no recognisable words or numbers.',
      matchedComplaintIds: []
    })

  }

  // 4. Content checks (abuse, threats, spam, meaningless text, ...).
  if (moderation && moderation.status !== 'approved') {

    signals.push({
      rule: 'content_check',
      reason: moderation.reason,
      evidence: (moderation.flags || []).join(', '),
      matchedComplaintIds: []
    })

  }

  // Information only: other citizens reporting the same issue.
  const relatedComplaintIds = othersRecent
    .filter(other =>
      now - new Date(other.createdAt).getTime() <= config.relatedWindowMs &&
      other.category === candidate.category &&
      sameLocation(other, candidate) &&
      textSimilarity(complaintText(other), candidateText) >= config.relatedSimilarity
    )
    .map(other => other.id)
    .slice(0, 10)

  const flagged = signals.length > 0

  return {
    level: flagged ? 'review_required' : 'normal',
    flagged,
    signals,
    relatedComplaintIds,
    detectedAt: new Date(now),
    reviewStatus: flagged ? 'pending' : 'not_required'
  }

}

// Loads what evaluateSuspicion needs. Lookups are bounded (time window +
// limit) and use the { citizenId, createdAt } / { category, createdAt }
// indexes.
async function assessSubmission(Complaint, { candidate, citizenId, moderation, now = Date.now() }) {

  const config = getConfig()
  const ownSince = new Date(now - Math.max(config.duplicateWindowMs, config.burstWindowMs))
  const othersSince = new Date(now - config.relatedWindowMs)
  const fields = 'id title description category location latitude longitude status moderationStatus createdAt'

  const [ownRecent, othersRecent] = await Promise.all([
    Complaint.find({ citizenId, createdAt: { $gte: ownSince } }).select(fields).sort({ createdAt: -1 }).limit(200).lean(),
    Complaint.find({ citizenId: { $ne: citizenId }, category: candidate.category, createdAt: { $gte: othersSince } })
      .select(fields).sort({ createdAt: -1 }).limit(200).lean()
  ])

  return evaluateSuspicion({ candidate, moderation, ownRecent, othersRecent, now })

}

module.exports = {
  evaluateSuspicion,
  assessSubmission,
  textSimilarity,
  normalizeText,
  sameLocation,
  isUnusableLocation
}
