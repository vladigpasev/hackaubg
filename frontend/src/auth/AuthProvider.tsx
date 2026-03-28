import { useEffect, useState, type PropsWithChildren } from 'react'
import { useSetAtom } from 'jotai'
import { useNavigate } from 'react-router-dom'
import { resetHospitalStateAtom } from '../features/receptionist/state/patientAtoms'
import { AuthContext } from './authContext'
import { fetchCurrentUser, loginWithCredentials, logoutFromServer } from './authClient'
import type { AuthCredentials, AuthUser } from './types'

export function AuthProvider({ children }: PropsWithChildren) {
  const navigate = useNavigate()
  const resetHospitalState = useSetAtom(resetHospitalStateAtom)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    let isActive = true

    async function hydrateSession() {
      try {
        const currentUser = await fetchCurrentUser()

        if (isActive) {
          resetHospitalState()
          setUser(currentUser)
        }
      } catch {
        if (isActive) {
          resetHospitalState()
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
  }, [resetHospitalState])

  async function login(credentials: AuthCredentials) {
    const nextUser = await loginWithCredentials(credentials)
    resetHospitalState()
    setUser(nextUser)
    setIsHydrated(true)
    return nextUser
  }

  async function logout() {
    try {
      await logoutFromServer()
    } finally {
      resetHospitalState()
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
