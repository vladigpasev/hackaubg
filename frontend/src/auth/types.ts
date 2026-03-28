import type { UserRole } from './roles'

export interface AuthCredentials {
  username: string
  password: string
}

export interface AuthUser {
  username: string
  role: UserRole
  isTester: boolean
  specialties: string[]
}

export interface AuthResponse {
  user: AuthUser
}

export interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  isHydrated: boolean
  login: (credentials: AuthCredentials) => Promise<AuthUser>
  logout: () => Promise<void>
}
