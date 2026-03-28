import type {
  BackendHistoryRecord,
  BackendPatientCore,
  BackendPatientDetails,
  BackendQueueRecord,
  TriageState,
} from '../types/patient'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '')

export class HospitalApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'HospitalApiError'
    this.status = status
  }
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

function toIsoString(value: unknown) {
  if (typeof value !== 'string') {
    return new Date().toISOString()
  }

  return value
}

function toTriageState(value: unknown): TriageState {
  if (value === 'GREEN' || value === 'YELLOW' || value === 'RED') {
    return value
  }

  return 'GREEN'
}

function mapQueueRecord(record: unknown): BackendQueueRecord | null {
  if (!record || typeof record !== 'object') {
    return null
  }

  const candidate = record as Record<string, unknown>

  if (typeof candidate.specialty !== 'string' || typeof candidate.reffered_by_id !== 'string') {
    return null
  }

  return {
    referredById: candidate.reffered_by_id,
    specialty: candidate.specialty,
    timestamp: toIsoString(candidate.timestamp),
    triageState: toTriageState(candidate.triage_state),
  }
}

function mapHistoryRecord(record: unknown): BackendHistoryRecord | null {
  if (!record || typeof record !== 'object') {
    return null
  }

  const candidate = record as Record<string, unknown>

  if (
    typeof candidate.specialty !== 'string' ||
    typeof candidate.reffered_by_id !== 'string' ||
    typeof candidate.reffered_to_id !== 'string' ||
    typeof candidate.is_done !== 'boolean'
  ) {
    return null
  }

  return {
    isDone: candidate.is_done,
    referredById: candidate.reffered_by_id,
    referredToId: candidate.reffered_to_id,
    specialty: candidate.specialty,
    timestamp: toIsoString(candidate.timestamp),
    triageState: toTriageState(candidate.triage_state),
  }
}

function mapPatientCore(payload: unknown): BackendPatientCore {
  const candidate = payload as Record<string, unknown>

  return {
    admittedAt: toIsoString(candidate.admitted_at),
    id: typeof candidate.id === 'string' ? candidate.id : crypto.randomUUID(),
    name: typeof candidate.name === 'string' ? candidate.name : 'Unknown patient',
    notes: Array.isArray(candidate.notes)
      ? candidate.notes.filter((note): note is string => typeof note === 'string')
      : [],
    phoneNumber: typeof candidate.phone_number === 'string' ? candidate.phone_number : '',
    triageState: toTriageState(candidate.triage_state),
  }
}

function mapPatientDetails(payload: unknown): BackendPatientDetails {
  const candidate = payload as Record<string, unknown>
  const core = mapPatientCore(payload)

  return {
    ...core,
    history: Array.isArray(candidate.history)
      ? candidate.history
          .map(mapHistoryRecord)
          .filter((record): record is BackendHistoryRecord => record !== null)
      : [],
    queue: Array.isArray(candidate.queue)
      ? candidate.queue
          .map(mapQueueRecord)
          .filter((record): record is BackendQueueRecord => record !== null)
      : [],
  }
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
    throw new HospitalApiError(
      getErrorMessage(payload, 'The hospital API is unavailable right now. Please try again.'),
      response.status,
    )
  }

  return payload as T
}

export function getHospitalStreamUrl() {
  return `${API_BASE_URL}/stream`
}

export async function listPatients() {
  const response = await request<unknown[]>('/patient/all', {
    method: 'GET',
  })

  return response.map(mapPatientCore)
}

export async function getPatientDetails(patientId: string) {
  const response = await request<unknown>(`/patient/details/${patientId}`, {
    method: 'GET',
  })

  return mapPatientDetails(response)
}

export async function checkInPatient(input: {
  name: string
  phoneNumber: string
  triageState: TriageState
}) {
  const response = await request<unknown>('/patient/check-in', {
    body: JSON.stringify({
      name: input.name.trim(),
      phone_number: input.phoneNumber.trim(),
      triage_state: input.triageState,
    }),
    method: 'POST',
  })

  return mapPatientCore(response)
}

export async function patchPatient(
  patientId: string,
  input: {
    name?: string
    phoneNumber?: string
    triageState?: TriageState
  },
) {
  const body: Record<string, string> = {}

  if (input.name !== undefined) {
    body.name = input.name.trim()
  }

  if (input.phoneNumber !== undefined) {
    body.phone_number = input.phoneNumber.trim()
  }

  if (input.triageState !== undefined) {
    body.triage_state = input.triageState
  }

  const response = await request<unknown>(`/patient/${patientId}`, {
    body: JSON.stringify(body),
    method: 'PATCH',
  })

  return mapPatientCore(response)
}

export async function attachPatientNote(patientId: string, note: string) {
  await request<void>(`/patient/note/${patientId}`, {
    body: JSON.stringify({
      note: note.trim(),
    }),
    method: 'POST',
  })
}

export async function deletePatient(patientId: string) {
  await request<{ checked_out: true }>(`/patient/check-out/${patientId}`, {
    method: 'DELETE',
  })
}
