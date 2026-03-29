import type { AuthUser } from '../../../auth/types'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '')

class AdminApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
  }
}

export type StaffRole = 'registry' | 'nurse' | 'doctor'
type TriageState = 'GREEN' | 'YELLOW' | 'RED'

export interface StaffUser extends AuthUser {
  role: StaffRole
}

export interface StaffFormPayload {
  username: string
  password?: string
  role: StaffRole
  isTester?: boolean
  specialties?: string[]
}

export interface ArchivedQueueRecord {
  timestamp: string
  triage_state: TriageState
  specialty: string
  reffered_by_id: string
}

export interface ArchivedHistoryRecord {
  reffered_by_id: string
  specialty: string
  triage_state: TriageState
  reffered_to_id: string
  is_done: boolean
  timestamp: string
}

export interface ArchivedPatient {
  id: string
  name: string
  phone_number: string
  triage_state: TriageState
  admitted_at: string
  notes: string[]
  history: ArchivedHistoryRecord[]
  queue: ArchivedQueueRecord[]
}

export interface ArchiveResponse {
  date: string
  users: Record<string, AuthUser>
  patients: ArchivedPatient[]
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
    throw new AdminApiError(
      getErrorMessage(payload, 'Admin data is unavailable right now. Please try again.'),
      response.status,
    )
  }

  return payload as T
}

export async function fetchStaff() {
  return request<StaffUser[]>('/admin/staff', { method: 'GET' })
}

export async function createStaff(payload: StaffFormPayload) {
  return request<StaffUser>('/admin/staff', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateStaff(username: string, payload: Partial<StaffFormPayload>) {
  return request<StaffUser>(`/admin/staff/${encodeURIComponent(username)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function deleteStaff(username: string) {
  await request<void>(`/admin/staff/${encodeURIComponent(username)}`, {
    method: 'DELETE',
  })
}

export async function fetchArchive(dateTimeValue: string) {
  const targetDate = new Date(dateTimeValue)

  if (Number.isNaN(targetDate.getTime())) {
    throw new Error('Enter a valid archive date and time.')
  }

  return request<ArchiveResponse>(`/patient/archive/${encodeURIComponent(targetDate.toISOString())}`, {
    method: 'GET',
  })
}

export async function runArchiveNow() {
  return request<{ archived: true }>('/patient/archive-now', {
    method: 'GET',
  })
}
