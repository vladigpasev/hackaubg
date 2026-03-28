import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { AuthPendingScreen } from './AuthPendingScreen'
import { useAuth } from './useAuth'

export function ProtectedRoute() {
  const { isAuthenticated, isHydrated } = useAuth()
  const location = useLocation()

  if (!isHydrated) {
    return (
      <AuthPendingScreen
        title="Preparing the clinical workspace"
        message="Your session is being checked so the app can route you without redirect flicker."
      />
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
