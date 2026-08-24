import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import '../App.css'
import { useAuth } from '../auth/useAuthContext'

function Register() {

  const { register } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {

    event.preventDefault()

    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setIsSubmitting(true)

    try {

      await register(name, email, password)

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
            <label>Full Name</label>
            <input
              type="text"
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="Your name"
              required
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="At least 6 characters"
              required
            />
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
