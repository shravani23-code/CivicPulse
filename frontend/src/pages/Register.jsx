import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import '../App.css'
import { useAuth } from '../auth/useAuthContext'
import { normalizeIndianMobile, MOBILE_ERROR_MESSAGE } from '../utils/mobile'

function Register() {

  const { register } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mobile, setMobile] = useState('')
  const [smsConsent, setSmsConsent] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {

    event.preventDefault()

    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    // Optional: blank is fine, anything typed must be a valid number.
    const trimmedMobile = mobile.trim()

    if (trimmedMobile && !normalizeIndianMobile(trimmedMobile)) {
      setError(MOBILE_ERROR_MESSAGE)
      return
    }

    setIsSubmitting(true)

    try {

      await register(name.trim(), email.trim(), password, trimmedMobile, Boolean(trimmedMobile) && smsConsent)

      toast.success('Account created! Welcome to CivicPulse.')

      navigate('/dashboard', { replace: true })

    } catch (registerError) {

      setError(registerError.message)

    } finally {

      setIsSubmitting(false)

    }

  }

  return (
    <div className="complaint-page">

      <div className="complaint-header">
        <Link to="/" className="back-link">← Back to CivicPulse</Link>
        <p className="hero-label">CITIZEN REGISTRATION</p>
        <h1>Create Your <span>Account</span></h1>
        <p>Register to submit and track civic complaints.</p>
      </div>

      <motion.div
        className="track-card auth-card"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >

        <form onSubmit={handleSubmit}>

          <div className="form-group">
            <label htmlFor="register-name">Full Name</label>
            <input
              id="register-name"
              type="text"
              autoComplete="name"
              maxLength={100}
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="Your name"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="register-email">Email</label>
            <input
              id="register-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="register-password">Password</label>
            <input
              id="register-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="At least 6 characters"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="register-mobile">
              Mobile Number
            </label>
            <input
              id="register-mobile"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              maxLength={16}
              value={mobile}
              onChange={event => setMobile(event.target.value)}
              placeholder="e.g. 98765 43210"
              aria-describedby="register-mobile-hint"
            />
            <small id="register-mobile-hint" className="field-hint">
              10-digit Indian mobile number. Saved to your profile so you don't need to re-enter it when reporting a complaint; only administrators handling your complaint can see it.
            </small>
          </div>

          <div className="form-group">
            <label className="consent-option">
              <input
                type="checkbox"
                checked={smsConsent && Boolean(mobile.trim())}
                disabled={!mobile.trim()}
                onChange={event => setSmsConsent(event.target.checked)}
              />
              <span>
                Send me SMS updates about my complaints <span className="optional-label">(optional)</span>
                <small className="field-hint">
                  Short status messages only (registered, reviewed, resolved) — never addresses or descriptions. You can turn this off at any time under My Complaints.
                </small>
              </span>
            </label>
          </div>

          {error && <div className="track-error">{error}</div>}

          <button type="submit" className="submit-button" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account...' : 'Register'}
          </button>

        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Log In</Link>
        </p>

      </motion.div>

    </div>
  )
}

export default Register
