// Single source of truth for the backend base URL. Set VITE_API_URL in
// the hosting provider's environment variables to point at a different
// backend without touching any page code; falls back to the deployed
// Render backend so the app keeps working if it's left unset.
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'https://civicpulse-backend-nt8q.onrender.com'
