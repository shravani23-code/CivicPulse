// ======================================
// COMPLAINT MODERATION ENGINE
// ======================================
//
// Lightweight, transparent, rule-based screening of new complaints. It
// is deliberately independent of the priority system in dsaEngines.js:
// it only decides WHETHER a complaint may enter the processing workflow,
// never how urgent it is.
//
// Outcomes:
//   approved     -> enters the normal workflow (Max Heap / FIFO queue)
//   needs_review -> held for an admin to approve or reject
//
// The engine NEVER rejects on its own. A final "not accepted" decision
// is always made by an administrator in the Moderation panel; even
// clear abuse or spam is only held for review. Reasons are written for
// the administrator (the citizen sees a neutral "under review" message).
//
// Short descriptions, spelling mistakes and missing photos are never a
// reason to hold a complaint on their own. Duplicate / repeat checks
// live in suspicionDetector.js, which combines them with this result.
//
// Word lists are Sets so each token is checked in O(1).

const STRONG_ABUSE = new Set([
  'fuck', 'fucking', 'fucker', 'fucked', 'motherfucker', 'shit', 'bullshit',
  'bitch', 'bastard', 'asshole', 'cunt', 'dick', 'dickhead', 'whore', 'slut',
  'chutiya', 'chutiye', 'madarchod', 'behenchod', 'bhenchod', 'bhosdike',
  'bhosdi', 'randi', 'gandu', 'lund', 'lavde', 'lawde', 'harami', 'kamina',
  'kamine'
])

// Rude but common in genuine frustrated complaints ("useless officials").
// Never a reason to reject; only noted.
const MILD_INSULTS = new Set([
  'idiot', 'idiots', 'stupid', 'useless', 'pathetic', 'shameless', 'nonsense',
  'worthless', 'incompetent', 'fools', 'fool'
])

const THREAT_PHRASES = [
  'i will kill', 'will kill you', 'kill them', 'i will burn', 'burn down',
  'blow up', 'shoot you', 'beat you'
]

const SPAM_PHRASES = [
  'buy now', 'click here', 'limited offer', 'special offer', 'free money',
  'earn money', 'make money', 'work from home', 'lottery', 'casino', 'betting',
  'bitcoin', 'crypto', 'forex', 'instant loan', 'personal loan', 'whatsapp me',
  'dm me', 'follow me', 'subscribe to', 'discount', 'cashback', 'promo code',
  'visit our', 'call now', 'online earning', 'investment plan'
]

const URL_REGEX = /(https?:\/\/|www\.)\S+|\b\S+\.(com|net|org|in|io|xyz|biz|info|shop|online)\b/i

// Words that indicate a civic/infrastructure problem. A token matches if
// it STARTS WITH one of these stems ("leak" -> leak, leaking, leakage).
const CIVIC_STEMS = [
  'road', 'pothole', 'hole', 'pit', 'crack', 'street', 'lane', 'footpath',
  'sidewalk', 'pavement', 'bridge', 'flyover', 'highway', 'divider', 'speed',
  'garbage', 'waste', 'trash', 'rubbish', 'litter', 'dump', 'dustbin', 'bin',
  'debris', 'filth', 'dirty', 'dirt', 'smell', 'stink', 'odour', 'odor',
  'water', 'leak', 'pipe', 'supply', 'tap', 'tank', 'contaminat', 'muddy',
  'drain', 'sewage', 'sewer', 'gutter', 'manhole', 'overflow', 'clog', 'block',
  'flood', 'waterlog', 'stagnant', 'puddle', 'rain', 'mosquito',
  'light', 'lamp', 'pole', 'wire', 'electric', 'power', 'outage', 'transformer',
  'cable', 'dark', 'bulb',
  'traffic', 'signal', 'jam', 'congest', 'parking', 'park', 'accident', 'vehicle',
  'bus', 'zebra', 'crossing', 'junction', 'chowk',
  'tree', 'branch', 'stray', 'dog', 'cattle', 'animal', 'noise', 'encroach',
  'construct', 'building', 'wall', 'collapse', 'broken', 'damage', 'repair',
  'unsafe', 'danger', 'hazard', 'toilet', 'public', 'municipal', 'corporation',
  'ward', 'colony', 'society', 'area', 'locality', 'market', 'school', 'hospital',
  'garden', 'playground', 'pollution', 'smoke', 'burning', 'fire', 'sanitation',
  'cleaning', 'sweep', 'gaddha', 'kachra', 'kachara', 'paani', 'pani', 'nala',
  'naala', 'sadak', 'rasta', 'raasta', 'batti', 'bijli', 'gutar'
]

// Same idea for Devanagari text (Hindi / Marathi) — substring match.
const DEVANAGARI_CIVIC_TERMS = [
  'सड़क', 'सडक', 'रस्ता', 'रास्ता', 'गड्ढा', 'खड्डा', 'कचरा', 'पानी', 'पाणी',
  'नाली', 'नाला', 'गटार', 'बत्ती', 'दिवा', 'बिजली', 'वीज', 'ट्रैफिक', 'पाइप',
  'गंदगी', 'कूड़ा', 'पूल', 'पुल'
]

const KEYBOARD_MASH = ['asdf', 'qwer', 'zxcv', 'hjkl', 'sdfg', 'dfgh', 'fghj', 'jkl;', 'uiop', 'wxyz']

function tokenize(text) {
  return (text.toLowerCase().match(/[\p{L}\p{M}]+/gu) || [])
}

// A Latin-script token "looks like a word" if it has a vowel (or y),
// no run of 5+ consonants, no character repeated 4+ times in a row, and
// no keyboard-mash fragment.
function looksLikeWord(token) {

  if (!/^[a-z]+$/.test(token)) return true // non-Latin scripts: don't judge

  if (token.length === 1) return token === 'a' || token === 'i'

  if (!/[aeiouy]/.test(token)) return false

  if (/[bcdfghjklmnpqrstvwxz]{5,}/.test(token)) return false

  if (/(.)\1{3,}/.test(token)) return false

  if (token.length >= 4 && KEYBOARD_MASH.some(mash => token.includes(mash))) return false

  return true

}

// Levenshtein distance, stopping early once it exceeds 1 (only "equal or
// one typo away" matters here).
function withinOneEdit(a, b) {

  if (Math.abs(a.length - b.length) > 1) return false

  let previousRow = Array.from({ length: b.length + 1 }, (_, index) => index)

  for (let i = 1; i <= a.length; i++) {

    const row = [i]
    let rowMin = i

    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previousRow[j] + 1, row[j - 1] + 1, previousRow[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      rowMin = Math.min(rowMin, row[j])
    }

    if (rowMin > 1) return false

    previousRow = row

  }

  return previousRow[b.length] <= 1

}

// Exact stem prefix ("leak" -> leaking), or — for stems of 4+ letters —
// a prefix one typo away ("garbge", "rode", "potholl"), so ordinary
// spelling mistakes never make a real complaint look non-civic.
function isCivicToken(token) {

  return CIVIC_STEMS.some(stem => {

    if (token.startsWith(stem)) return true

    if (stem.length < 4 || token.length < stem.length - 1) return false

    for (let length = stem.length - 1; length <= stem.length + 1; length++) {
      if (length <= token.length && withinOneEdit(token.slice(0, length), stem)) return true
    }

    return false

  })

}

// Analyzes one complaint's text.
function moderateComplaint({ title = '', description = '' }) {

  const text = `${title}\n${description}`
  const lowerText = text.toLowerCase()
  const tokens = tokenize(text)

  const latinTokens = tokens.filter(token => /^[a-z]+$/.test(token))
  const nonLatinTokens = tokens.length - latinTokens.length
  const mostlyNonLatin = tokens.length > 0 && nonLatinTokens / tokens.length > 0.5

  const meaningfulWords = tokens.filter(looksLikeWord)
  const civicTokens = tokens.filter(isCivicToken)
  const civicHits = civicTokens.length +
    DEVANAGARI_CIVIC_TERMS.filter(term => text.includes(term)).length

  const strongAbuse = tokens.filter(token => STRONG_ABUSE.has(token))
  const mildInsults = tokens.filter(token => MILD_INSULTS.has(token))
  const threats = THREAT_PHRASES.filter(phrase => lowerText.includes(phrase))
  const spamPhrases = SPAM_PHRASES.filter(phrase => lowerText.includes(phrase))
  const hasUrl = URL_REGEX.test(text)

  const spamScore = spamPhrases.length + (hasUrl ? 1 : 0)
  const isCivic = civicHits > 0

  const flags = []

  if (strongAbuse.length) flags.push('abusive_language')
  if (mildInsults.length) flags.push('mild_insult')
  if (threats.length) flags.push('threatening_language')
  if (spamPhrases.length) flags.push('promotional_content')
  if (hasUrl) flags.push('contains_link')
  if (!isCivic) flags.push('no_civic_terms')

  // --------------------------------------
  // 1. CLEAR PROBLEMS -> ADMIN REVIEW (never automatic rejection)
  // --------------------------------------

  if (!mostlyNonLatin && meaningfulWords.length < 2 && !isCivic) {
    flags.push('meaningless_text')
    return decision('needs_review', flags,
      'The text does not contain meaningful words.')
  }

  if (!isCivic && strongAbuse.length > 0) {
    return decision('needs_review', flags,
      'Contains abusive language and does not describe a civic issue.')
  }

  if (!isCivic && spamScore >= 2) {
    return decision('needs_review', flags,
      'Looks like advertising or spam rather than a civic issue.')
  }

  // --------------------------------------
  // 2. AMBIGUOUS -> ADMIN REVIEW
  // --------------------------------------

  if (threats.length) {
    return decision('needs_review', flags,
      'Contains threatening language.')
  }

  if (strongAbuse.length) {
    return decision('needs_review', flags,
      'Describes a civic issue but contains abusive language.')
  }

  if (spamScore > 0) {
    return decision('needs_review', flags,
      'Contains a link or promotional wording.')
  }

  if (!isCivic) {
    return decision('needs_review', flags,
      mostlyNonLatin
        ? 'The text could not be checked automatically (non-Latin script without recognised civic terms).'
        : 'The text does not clearly describe a civic issue.')
  }

  // --------------------------------------
  // 3. GENUINE
  // --------------------------------------

  return decision('approved', flags, '')

  function decision(status, decisionFlags, reason) {
    return { status, reason, flags: decisionFlags }
  }

}

module.exports = { moderateComplaint, looksLikeWord }
