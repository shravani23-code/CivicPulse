const bcrypt = require('bcryptjs')
const User = require('../models/User')

// Creates the single admin account from ADMIN_EMAIL / ADMIN_PASSWORD env
// vars on boot, if it doesn't already exist. There is no public admin
// registration form — this is the only way an admin account gets created,
// and the password is hashed immediately, never stored in plain text.
async function seedAdmin() {

  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD

  if (!email || !password) {
    console.warn('ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin account setup.')
    return
  }

  const existingAdmin = await User.findOne({ email: email.toLowerCase() })

  if (existingAdmin) {
    return
  }

  const passwordHash = await bcrypt.hash(password, 10)

  await User.create({
    name: 'CivicPulse Admin',
    email: email.toLowerCase(),
    passwordHash,
    role: 'admin'
  })

  console.log('Admin account created from ADMIN_EMAIL.')

}

module.exports = seedAdmin
