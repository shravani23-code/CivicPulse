// Indian mobile number helpers.
//
// Accepts what people actually type — "98765 43210", "+91-9876543210",
// "09876543210", "919876543210" — and normalizes it to E.164
// ("+919876543210"), the single stored form. Indian mobile numbers are
// 10 digits starting with 6, 7, 8 or 9.

const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/

// Returns the normalized "+91XXXXXXXXXX" form, or null when the input
// is not a valid Indian mobile number.
function normalizeIndianMobile(input) {

  if (typeof input !== 'string' && typeof input !== 'number') return null

  const raw = String(input).trim()

  // Only digits plus common separators and a single leading "+" are allowed.
  if (!/^\+?[\d\s\-()]+$/.test(raw)) return null

  let digits = raw.replace(/\D/g, '')

  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2)
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1)
  }

  if (!INDIAN_MOBILE_REGEX.test(digits)) return null

  return `+91${digits}`

}

// "+919876543210" -> "+91 ******3210". Used everywhere a number is
// shown back to a client or written to a log.
function maskMobile(mobile) {

  if (!mobile || typeof mobile !== 'string') return null

  return `+91 ******${mobile.slice(-4)}`

}

// "+919876543210" -> "919876543210": country code + number, no "+",
// the form MSG91 expects in `mobiles`. Null for anything not stored in
// the normalized form.
function toMsg91Number(mobile) {

  if (typeof mobile !== 'string' || !/^\+91[6-9]\d{9}$/.test(mobile)) return null

  return mobile.slice(1)

}

module.exports = { normalizeIndianMobile, maskMobile, toMsg91Number }
