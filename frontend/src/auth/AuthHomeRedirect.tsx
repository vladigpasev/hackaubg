import { Navigate } from 'react-router-dom'
import { AuthPendingScreen } from './AuthPendingScreen'
import { getRoleHomePath } from './roles'
import { useAuth } from './useAuth'

export function AuthHomeRedirect() {
  const { isAuthenticated, isHydrated, user } = useAuth()

  if (!isHydrated) {
    return (
      <AuthPendingScreen
        title="Preparing the clinical workspace"
        message="The app is checking whether a signed-in user should go straight to their role workspace."
      />
    )
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />
  }

  return <Navigate to={getRoleHomePath(user.role)} replace />
}
