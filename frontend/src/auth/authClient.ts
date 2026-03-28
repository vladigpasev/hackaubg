import type { AuthCredentials, AuthResponse, AuthUser } from './types'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '')

class AuthApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AuthApiError'
    this.status = status
  }
}

function isFilled(value: string) {
  return value.trim().length > 0
}

function getErrorMessage(payload: unknown, fallbackMessage: string) {
  if (!payload || typeof payload !== 'object' || !('message' in payload)) {
    return fallbackMessage
  }

  const message = (payload as { message?: unknown }).message

  if (typeof message === 'string' && message.trim().length > 0) {
    return message
  }

  if (Array.isArray(message)) {
    const firstMessage = message.find((item): item is string => typeof item === 'string' && item.trim().length > 0)

    if (firstMessage) {
      return firstMessage
    }
  }

  return fallbackMessage
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  if (response.status === 204) {
    return undefined as T
  }

  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw new AuthApiError(
      getErrorMessage(payload, 'Authentication is unavailable right now. Please try again.'),
      response.status,
    )
  }

  return payload as T
}

export async function loginWithCredentials(credentials: AuthCredentials): Promise<AuthUser> {
  if (!isFilled(credentials.username) || !isFilled(credentials.password)) {
    throw new Error('Username and password are required.')
  }

  const response = await request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      username: credentials.username.trim(),
      password: credentials.password,
    }),
  })

  return response.user
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    const response = await request<AuthResponse>('/auth/me', {
      method: 'GET',
    })

    return response.user
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 401) {
      return null
    }

    throw error
  }
}

export async function logoutFromServer() {
  try {
    await request<void>('/auth/logout', {
      method: 'POST',
    })
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 401) {
      return
    }

    throw error
  }
}
