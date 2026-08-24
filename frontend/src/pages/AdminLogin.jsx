import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import '../App.css'
import { useAuth } from '../auth/useAuthContext'

function AdminLogin() {

  const { login } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {

    event.preventDefault()

    setError('')
    setIsSubmitting(true)

    try {

      await login(email, password, 'admin')

      toast.success('Welcome back, Admin.')

      navigate('/admin', { replace: true })

    } catch (loginError) {

      setError(loginError.message)

    } finally {

      setIsSubmitting(false)

    }

  }

  return (
    <div className="admin-page">

      <div className="admin-header">
        <Link to="/" className="back-link">← Back to CivicPulse</Link>
        <p className="hero-label">CIVICPULSE ADMIN</p>
        <h1>Admin <span>Portal</span></h1>
        <p>Restricted access — authorized administrators only.</p>
      </div>

      <motion.div
        className="admin-card auth-card"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >

        <form onSubmit={handleSubmit}>

          <div className="form-group">
            <label>Admin Email</label>
            <input
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="admin@civicpulse.local"
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && <div className="track-error">{error}</div>}

          <button type="submit" className="submit-button" disabled={isSubmitting}>
            {isSubmitting ? 'Logging in...' : 'Log In'}
          </button>

        </form>

      </motion.div>

    </div>
  )
}

export default AdminLogin
