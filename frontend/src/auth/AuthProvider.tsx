import { useEffect, useState, type PropsWithChildren } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthContext } from './authContext'
import { fetchCurrentUser, loginWithCredentials, logoutFromServer } from './authClient'
import type { AuthCredentials, AuthUser } from './types'

export function AuthProvider({ children }: PropsWithChildren) {
  const navigate = useNavigate()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    let isActive = true

    async function hydrateSession() {
      try {
        const currentUser = await fetchCurrentUser()

        if (isActive) {
          setUser(currentUser)
        }
      } catch {
        if (isActive) {
          setUser(null)
        }
      } finally {
        if (isActive) {
          setIsHydrated(true)
        }
      }
    }

    void hydrateSession()

    return () => {
      isActive = false
    }
  }, [])

  async function login(credentials: AuthCredentials) {
    const nextUser = await loginWithCredentials(credentials)
    setUser(nextUser)
    setIsHydrated(true)
    return nextUser
  }

  async function logout() {
    try {
      await logoutFromServer()
    } finally {
      setUser(null)
      setIsHydrated(true)
      navigate('/login', { replace: true })
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isHydrated,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
