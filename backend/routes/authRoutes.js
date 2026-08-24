const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const User = require('../models/User')

const router = express.Router()

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function issueToken(user) {

  return jwt.sign(
    {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )

}

function publicUser(user) {

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role
  }

}


// ======================================
// CITIZEN REGISTRATION
// (Admin accounts are seeded from env vars, not self-registered.)
// ======================================

router.post('/register', async (req, res) => {

  try {

    const { name, email, password } = req.body

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Please enter your name.' })
    }

    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' })
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' })
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() })

    if (existingUser) {
      return res.status(409).json({ message: 'An account with this email already exists.' })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase(),
      passwordHash,
      role: 'citizen'
    })

    const token = issueToken(user)

    res.status(201).json({
      message: 'Account created successfully.',
      token,
      user: publicUser(user)
    })

  } catch (error) {

    console.error('Registration error:', error)

    res.status(500).json({ message: 'Failed to create account.', error: error.message })

  }

})


// ======================================
// LOGIN (citizen and admin share this endpoint; the requested `role`
// must match the account's actual role, keeping the two portals separate)
// ======================================

router.post('/login', async (req, res) => {

  try {

    const { email, password, role } = req.body

    if (!email || !password || !role) {
      return res.status(400).json({ message: 'Please provide email, password and role.' })
    }

    const user = await User.findOne({ email: email.toLowerCase() })

    if (!user || user.role !== role) {
      return res.status(401).json({ message: 'Invalid email, password, or account type.' })
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash)

    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid email, password, or account type.' })
    }

    const token = issueToken(user)

    res.json({
      message: 'Logged in successfully.',
      token,
      user: publicUser(user)
    })

  } catch (error) {

    console.error('Login error:', error)

    res.status(500).json({ message: 'Failed to log in.', error: error.message })

  }

})

module.exports = router
