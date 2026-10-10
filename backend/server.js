const express = require('express')
const cors = require('cors')
const mongoose = require('mongoose')
require('dotenv').config()

const authRoutes = require('./routes/authRoutes')
const complaintRoutes = require('./routes/complaintRoutes')
const notificationRoutes = require('./routes/notificationRoutes')
const moderationRoutes = require('./routes/moderationRoutes')
const seedAdmin = require('./utils/seedAdmin')
const { isAllowedOrigin } = require('./config/cors')


const app = express()


// ======================================
// MIDDLEWARE
// ======================================

// CORS policy (see isAllowedOrigin in config/cors.js):
//   - the built-in production + local development origins,
//   - any extra origins in FRONTEND_ORIGIN (comma-separated),
//   - this project's own Vercel preview deployments, matched by a
//     strict pattern (disable with CORS_ALLOW_VERCEL_PREVIEWS=false).
// Requests from any other origin get no CORS headers (the browser
// blocks them) instead of an error response.
app.use(cors({
  origin: function (origin, callback) {
    // No Origin header = not a browser cross-origin request
    // (curl, Render health checks, server-to-server).
    callback(null, !origin || isAllowedOrigin(origin))
  },
  credentials: true
}))

app.use(express.json())


// ======================================
// ROUTES
// ======================================

app.get('/', (req, res) => {
  res.json({ message: 'CivicPulse Backend is running!' })
})

// Health check: reports whether the database connection is up, nothing
// else (no versions, hosts or configuration values).
app.get('/api/health', (req, res) => {

  const databaseConnected = mongoose.connection.readyState === 1

  res.status(databaseConnected ? 200 : 503).json({
    status: databaseConnected ? 'ok' : 'degraded',
    database: databaseConnected ? 'connected' : 'disconnected',
    uptimeSeconds: Math.round(process.uptime())
  })

})

app.use('/api/auth', authRoutes)
app.use('/api/complaints', complaintRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/moderation', moderationRoutes)


// ======================================
// MULTER / UPLOAD ERROR HANDLING
// (keeps file-validation errors readable instead of a generic 500)
// ======================================

app.use((error, req, res, next) => {

  if (!error) return next()

  // Client errors: upload validation (multer limits / file type) and
  // malformed JSON bodies. Their messages are written for the user.
  const status = error.status || error.statusCode

  if (error.name === 'MulterError' || (status >= 400 && status < 500)) {

    const message = error.type === 'entity.parse.failed'
      ? 'Request body is not valid JSON.'
      : error.message || 'Invalid request.'

    return res.status(status && status < 500 ? status : 400).json({ message })

  }

  // Anything else is a server fault: log it, but never send internal
  // error details to the client.
  console.error('Unhandled error:', error)

  res.status(500).json({ message: 'Something went wrong. Please try again.' })

})


// ======================================
// CONNECT MONGODB + START SERVER
// ======================================

// Started only when run directly (`node server.js` / `npm start`), so
// tests can require the app without connecting to the real database.
if (require.main === module) {

  mongoose
    .connect(process.env.MONGODB_URI)
    .then(async () => {

      console.log('MongoDB connected successfully!')

      await seedAdmin()

      const PORT = process.env.PORT || 5000

      app.listen(PORT, () => {
        console.log(`CivicPulse backend running on port ${PORT}`)
      })

    })
    .catch((error) => {

      console.error('MongoDB connection failed:', error.message)

    })

}

module.exports = app
