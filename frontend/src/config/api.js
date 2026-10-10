// Single source of truth for the backend base URL. Set VITE_API_URL in
// the hosting provider's environment variables to point at a different
// backend without touching any page code; falls back to the deployed
// Render backend so the app keeps working if it's left unset.
export const API_BASE_URL =
  (import.meta.env.VITE_API_URL || 'https://civicpulse-backend-nt8q.onrender.com').replace(/\/+$/, '')


// Error thrown by apiRequest(). `status` is the HTTP status, or 0 when
// the server could not be reached at all.
export class ApiError extends Error {

  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }

}

const NETWORK_ERROR_MESSAGE =
  'Cannot reach the CivicPulse server. Check your connection — if the server was idle it can take up to a minute to wake up — then try again.'

// fetch() wrapper used by the newer components:
//   - prefixes API_BASE_URL and adds the Bearer token when given
//   - JSON-encodes `json` bodies
//   - turns network failures ("Failed to fetch") and non-JSON error
//     pages into a readable ApiError instead of a cryptic exception
//   - resolves with the parsed JSON body for 2xx responses
export async function apiRequest(path, { token, method = 'GET', json, body, signal } = {}) {

  const headers = {}

  if (token) headers.Authorization = `Bearer ${token}`

  if (json !== undefined) headers['Content-Type'] = 'application/json'

  let response

  try {

    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: json !== undefined ? JSON.stringify(json) : body,
      signal
    })

  } catch (error) {

    if (error.name === 'AbortError') throw error

    throw new ApiError(NETWORK_ERROR_MESSAGE, 0)

  }

  const data = await response.json().catch(() => null)

  if (!response.ok) {

    const fallback = response.status >= 500
      ? 'The server ran into a problem. Please try again shortly.'
      : `Request failed (HTTP ${response.status}).`

    throw new ApiError((data && data.message) || fallback, response.status)

  }

  return data

}
