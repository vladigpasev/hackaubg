import { useState, type PropsWithChildren } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthContext } from './authContext'
import { loginWithCredentials } from './authClient'
import type { AuthCredentials, AuthSession } from './types'

const AUTH_STORAGE_KEY = 'hospital-frontend-auth'

function isStoredSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>
  const user = candidate.user

  if (!user || typeof user !== 'object') {
    return false
  }

  const storedUser = user as Record<string, unknown>

  return (
    typeof storedUser.username === 'string' &&
    storedUser.username.trim().length > 0 &&
    typeof candidate.signedInAt === 'string'
  )
}

function readStoredSession(): AuthSession | null {
  const rawSession = window.localStorage.getItem(AUTH_STORAGE_KEY)

  if (!rawSession) {
    return null
  }

  try {
    const parsedSession: unknown = JSON.parse(rawSession)

    if (!isStoredSession(parsedSession)) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }

    return parsedSession
  } catch {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
    return null
  }
}

function persistSession(session: AuthSession) {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
}

function clearStoredSession() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY)
}

export function AuthProvider({ children }: PropsWithChildren) {
  const navigate = useNavigate()
  const [session, setSession] = useState<AuthSession | null>(() => readStoredSession())

  async function login(credentials: AuthCredentials) {
    const nextSession = await loginWithCredentials(credentials)
    persistSession(nextSession)
    setSession(nextSession)
  }

  function logout() {
    clearStoredSession()
    setSession(null)
    navigate('/login', { replace: true })
  }

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        isAuthenticated: session !== null,
        isHydrated: true,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
