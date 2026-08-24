const jwt = require('jsonwebtoken')

// Verifies the Authorization: Bearer <token> header and attaches the
// decoded { id, name, email, role } payload to req.user. This is the
// actual server-side gate — routes that use this (plus requireRole)
// reject unauthorized requests regardless of what the frontend shows.
function requireAuth(req, res, next) {

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' })
  }

  try {

    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    req.user = decoded

    next()

  } catch (error) {

    return res.status(401).json({ message: 'Invalid or expired session. Please log in again.' })

  }

}

// Use after requireAuth. Rejects the request unless req.user.role matches.
function requireRole(role) {

  return function (req, res, next) {

    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ message: 'You do not have permission to access this resource.' })
    }

    next()

  }

}

module.exports = { requireAuth, requireRole }
