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
//   rejected     -> clearly inappropriate; citizen gets the reason
//
// Guiding rule: a flagged word ALONE never causes rejection. Automatic
// rejection needs a clear signal (abuse / spam / gibberish) AND no sign
// that the text describes a civic problem. Anything ambiguous goes to
// an admin instead.
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

const MIN_MEANINGFUL_WORDS = 4

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

function isCivicToken(token) {
  return CIVIC_STEMS.some(stem => token.startsWith(stem))
}

// Analyzes one complaint's text. `context.isDuplicate` is supplied by the
// route (it needs a database lookup) when the same citizen submitted an
// identical complaint moments earlier.
function moderateComplaint({ title = '', description = '', location = '', category = '' }, context = {}) {

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
  if (context.isDuplicate) flags.push('possible_duplicate')

  const descriptionTokens = tokenize(description).filter(looksLikeWord)

  // --------------------------------------
  // 1. CLEAR REJECTIONS (never on one keyword alone)
  // --------------------------------------

  if (!mostlyNonLatin && meaningfulWords.length < 2 && !isCivic) {
    flags.push('meaningless_text')
    return decision('rejected', flags,
      'The complaint text does not contain meaningful words. Please describe the civic problem in plain language and submit again.')
  }

  if (!isCivic && strongAbuse.length > 0) {
    return decision('rejected', flags,
      'The complaint contains abusive language and does not describe a civic issue. Please describe the problem respectfully and submit again.')
  }

  if (!isCivic && spamScore >= 2) {
    return decision('rejected', flags,
      'The complaint appears to be advertising or spam rather than a civic issue.')
  }

  // --------------------------------------
  // 2. AMBIGUOUS -> ADMIN REVIEW
  // --------------------------------------

  if (threats.length) {
    return decision('needs_review', flags,
      'Contains threatening language — an administrator will review it before processing.')
  }

  if (strongAbuse.length) {
    return decision('needs_review', flags,
      'Describes a civic issue but contains abusive language — an administrator will review it.')
  }

  if (spamScore > 0) {
    return decision('needs_review', flags,
      'Contains a link or promotional wording — an administrator will confirm it is a genuine complaint.')
  }

  if (context.isDuplicate) {
    return decision('needs_review', flags,
      'An identical complaint was submitted from your account moments ago — an administrator will check it is not a duplicate.')
  }

  if (!isCivic) {
    return decision('needs_review', flags,
      mostlyNonLatin
        ? 'The complaint could not be automatically checked — an administrator will review it.'
        : 'The complaint does not clearly describe a civic issue — an administrator will review it. You may be asked for more information.')
  }

  if (!mostlyNonLatin && descriptionTokens.length < MIN_MEANINGFUL_WORDS) {
    flags.push('too_little_detail')
    return decision('needs_review', flags,
      'The description is very short — an administrator will review it and may ask for more information.')
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
