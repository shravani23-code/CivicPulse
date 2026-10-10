import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { apiRequest } from '../config/api'
import { AuthContext } from './useAuthContext'

const STORAGE_KEY = 'civicpulse_auth'

function readStoredAuth() {

  try {

    const raw = localStorage.getItem(STORAGE_KEY)

    return raw ? JSON.parse(raw) : null

  } catch {

    return null

  }

}

// Holds the logged-in user + JWT for the session, persisted to
// localStorage so a refresh doesn't log anyone out. Both citizen and
// admin accounts flow through the same context — `user.role` decides
// what a given page/route allows.
export function AuthProvider({ children }) {

  const [auth, setAuth] = useState(() => readStoredAuth())

  useEffect(() => {

    if (auth) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(auth))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }

  }, [auth])

  async function login(email, password, role) {

    const data = await apiRequest('/api/auth/login', {
      method: 'POST',
      json: { email, password, role }
    })

    setAuth({ token: data.token, user: data.user })

    return data.user

  }

  // `mobile` is optional; an empty value is simply not sent.
  async function register(name, email, password, mobile) {

    const data = await apiRequest('/api/auth/register', {
      method: 'POST',
      json: mobile ? { name, email, password, mobile } : { name, email, password }
    })

    setAuth({ token: data.token, user: data.user })

    return data.user

  }

  const logout = useCallback(() => {
    setAuth(null)
  }, [])

  const token = auth ? auth.token : null

  // Authenticated request: adds the Bearer token, and when the backend
  // answers 401 (expired or invalid session) logs the user out so the
  // protected route sends them to the login page instead of showing a
  // broken page. The ApiError is re-thrown for the caller to display.
  const authRequest = useCallback(async (path, options = {}) => {

    try {

      return await apiRequest(path, { ...options, token })

    } catch (error) {

      if (error.status === 401 && token) {
        toast.error('Your session has expired. Please log in again.', { id: 'session-expired' })
        setAuth(null)
      }

      throw error

    }

  }, [token])

  const value = {
    token,
    user: auth ? auth.user : null,
    isAuthenticated: Boolean(auth),
    login,
    register,
    logout,
    authRequest
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>

}
