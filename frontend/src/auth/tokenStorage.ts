const AUTH_TOKEN_STORAGE_KEY = 'hospital_auth_token'

export function getStoredAuthToken() {
  if (typeof window === 'undefined') {
    return null
  }

  const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  return token && token.trim().length > 0 ? token : null
}

export function storeAuthToken(token: string | null) {
  if (typeof window === 'undefined') {
    return
  }

  if (token && token.trim().length > 0) {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
    return
  }

  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
}
