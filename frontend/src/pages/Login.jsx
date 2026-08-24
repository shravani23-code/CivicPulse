import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import '../App.css'
import { useAuth } from '../auth/useAuthContext'

function Login() {

  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {

    event.preventDefault()

    setError('')
    setIsSubmitting(true)

    try {

      await login(email, password, 'citizen')

      toast.success('Welcome back!')

      const redirectTo = location.state?.from || '/dashboard'

      navigate(redirectTo, { replace: true })

    } catch (loginError) {

      setError(loginError.message)

    } finally {

      setIsSubmitting(false)

    }

  }

  return (
    <div className="complaint-page">

      <div className="complaint-header">
        <Link to="/" className="back-link">← Back to CivicPulse</Link>
        <p className="hero-label">CITIZEN LOGIN</p>
        <h1>Welcome <span>Back</span></h1>
        <p>Log in to report issues and track your complaints.</p>
      </div>

      <motion.div
        className="track-card auth-card"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >

        <form onSubmit={handleSubmit}>

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
              placeholder="••••••••"
              required
            />
          </div>

          {error && <div className="track-error">{error}</div>}

          <button type="submit" className="submit-button" disabled={isSubmitting}>
            {isSubmitting ? 'Logging in...' : 'Log In'}
          </button>

        </form>

        <p className="auth-switch">
          Don&apos;t have an account? <Link to="/register">Register</Link>
        </p>

        <p className="auth-switch">
          Are you an administrator? <Link to="/admin/login">Admin Login</Link>
        </p>

      </motion.div>

    </div>
  )
}

export default Login
