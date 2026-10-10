// Mirrors normalizeIndianMobile() in backend/utils/mobile.js — the
// backend re-validates, this just gives instant feedback. Accepts
// "98765 43210", "+91-9876543210", "09876543210", "919876543210" and
// returns the single stored form "+919876543210", or null if invalid.
// Kept as a string throughout so no digits (or leading zeros) are lost.
export function normalizeIndianMobile(input) {

  const raw = String(input || '').trim()

  if (!/^\+?[\d\s\-()]+$/.test(raw)) return null

  let digits = raw.replace(/\D/g, '')

  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)

  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null

}

export const MOBILE_ERROR_MESSAGE =
  'Please enter a valid 10-digit Indian mobile number (starting with 6, 7, 8 or 9).'
