export interface AuthCredentials {
  username: string
  password: string
}

export interface AuthUser {
  username: string
}

export interface AuthSession {
  user: AuthUser
  signedInAt: string
}

export interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  isHydrated: boolean
  login: (credentials: AuthCredentials) => Promise<void>
  logout: () => void
}
