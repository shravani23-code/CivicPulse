import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../config/api'
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

    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role })
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || 'Login failed.')
    }

    setAuth({ token: data.token, user: data.user })

    return data.user

  }

  async function register(name, email, password) {

    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || 'Registration failed.')
    }

    setAuth({ token: data.token, user: data.user })

    return data.user

  }

  function logout() {
    setAuth(null)
  }

  const value = {
    token: auth ? auth.token : null,
    user: auth ? auth.user : null,
    isAuthenticated: Boolean(auth),
    login,
    register,
    logout
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>

}
