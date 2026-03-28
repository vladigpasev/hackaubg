import { Navigate, Outlet } from 'react-router-dom'
import { AuthPendingScreen } from './AuthPendingScreen'
import { getRoleHomePath } from './roles'
import { useAuth } from './useAuth'

export function PublicOnlyRoute() {
  const { isAuthenticated, isHydrated, user } = useAuth()

  if (!isHydrated) {
    return (
      <AuthPendingScreen
        title="Preparing sign-in"
        message="The app is checking whether an existing session should take you straight to the workspace."
      />
    )
  }

  if (isAuthenticated) {
    return <Navigate to={getRoleHomePath(user!.role)} replace />
  }

  return <Outlet />
}
