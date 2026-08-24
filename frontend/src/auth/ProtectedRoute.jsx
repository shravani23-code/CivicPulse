import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './useAuthContext'

// Redirects to the correct login page when unauthenticated, or when
// logged in as the wrong role (e.g. a citizen hitting /admin). Preserves
// the originally-requested page so login can send them back afterward.
function ProtectedRoute({ role, children }) {

  const { isAuthenticated, user } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {

    const loginPath = role === 'admin' ? '/admin/login' : '/login'

    return <Navigate to={loginPath} replace state={{ from: location.pathname }} />

  }

  if (role && user.role !== role) {

    return <Navigate to="/" replace />

  }

  return children

}

export default ProtectedRoute
