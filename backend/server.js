const express = require('express')
const cors = require('cors')
const mongoose = require('mongoose')
require('dotenv').config()

const authRoutes = require('./routes/authRoutes')
const complaintRoutes = require('./routes/complaintRoutes')
const seedAdmin = require('./utils/seedAdmin')


const app = express()


// ======================================
// MIDDLEWARE
// ======================================

// FRONTEND_ORIGIN can be a single origin or a comma-separated list
// (useful for a Vercel production URL + preview deployments). Falls back
// to allowing any origin when unset, so local development still works.
const allowedOrigins = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)

app.use(cors({
  origin(origin, callback) {

    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true)
    }

    callback(new Error('Not allowed by CORS'))
  }
}))

app.use(express.json())


// ======================================
// ROUTES
// ======================================

app.get('/', (req, res) => {
  res.json({ message: 'CivicPulse Backend is running!' })
})

app.use('/api/auth', authRoutes)
app.use('/api/complaints', complaintRoutes)


// ======================================
// MULTER / UPLOAD ERROR HANDLING
// (keeps file-validation errors readable instead of a generic 500)
// ======================================

app.use((error, req, res, next) => {

  if (error && error.message) {
    return res.status(400).json({ message: error.message })
  }

  next(error)

})


// ======================================
// CONNECT MONGODB + START SERVER
// ======================================

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
