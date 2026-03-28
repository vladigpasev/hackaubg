import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { AuthPendingScreen } from './AuthPendingScreen'
import type { UserRole } from './roles'
import { getRoleHomePath } from './roles'
import { useAuth } from './useAuth'

interface ProtectedRouteProps {
  allowedRoles?: UserRole[]
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, isHydrated, user } = useAuth()
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

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to={getRoleHomePath(user.role)} replace />
  }

  return <Outlet />
}
