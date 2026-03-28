import type { AuthCredentials, AuthSession } from './types'

function isFilled(value: string) {
  return value.trim().length > 0
}

export async function loginWithCredentials(
  credentials: AuthCredentials,
): Promise<AuthSession> {
  if (!isFilled(credentials.username) || !isFilled(credentials.password)) {
    throw new Error('Username and password are required.')
  }

  return {
    user: { username: credentials.username.trim() },
    signedInAt: new Date().toISOString(),
  }
}
