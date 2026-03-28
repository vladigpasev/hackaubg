import type { Patient } from '../../receptionist/types/patient'
import type {
  PublicPatientDetails,
  PublicPatientHistoryRecord,
  PublicPatientQueueRecord,
  PublicPatientStreamEvent,
  PublicPatientTriageState,
} from '../types/publicPatient'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '')

class PublicPatientApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'PublicPatientApiError'
    this.status = status
  }
}

interface BackendPatientQueueRecord {
  timestamp: string
  triage_state: 'GREEN' | 'YELLOW' | 'RED'
  specialty: string
  reffered_by_id: string
}

interface BackendPatientHistoryRecord {
  reffered_by_id: string
  specialty: string
  triage_state: 'GREEN' | 'YELLOW' | 'RED'
  reffered_to_id: string
  is_done: boolean
  timestamp: string
}

interface BackendPatientDetails {
  id: string
  name: string
  phone_number: string
  triage_state: 'GREEN' | 'YELLOW' | 'RED'
  admitted_at: string
  notes: string[]
  history: BackendPatientHistoryRecord[]
  queue: BackendPatientQueueRecord[]
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

function mapTriageState(value: BackendPatientDetails['triage_state']): PublicPatientTriageState {
  return value.toLowerCase() as PublicPatientTriageState
}

function mapQueueRecord(record: BackendPatientQueueRecord): PublicPatientQueueRecord {
  return {
    timestamp: record.timestamp,
    triageState: mapTriageState(record.triage_state),
    specialty: record.specialty,
    refferedById: record.reffered_by_id,
  }
}

function mapHistoryRecord(record: BackendPatientHistoryRecord): PublicPatientHistoryRecord {
  return {
    refferedById: record.reffered_by_id,
    specialty: record.specialty,
    triageState: mapTriageState(record.triage_state),
    refferedToId: record.reffered_to_id,
    isDone: record.is_done,
    timestamp: record.timestamp,
  }
}

function mapPatientDetails(patient: BackendPatientDetails): PublicPatientDetails {
  return {
    id: patient.id,
    name: patient.name,
    phoneNumber: patient.phone_number,
    triageState: mapTriageState(patient.triage_state),
    admittedAt: patient.admitted_at,
    notes: patient.notes,
    history: patient.history.map(mapHistoryRecord),
    queue: patient.queue.map(mapQueueRecord),
  }
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`)

  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw new PublicPatientApiError(
      getErrorMessage(payload, 'Patient details are unavailable right now.'),
      response.status,
    )
  }

  return payload as T
}

export async function getPublicPatientByPhoneNumber(phoneNumber: string): Promise<PublicPatientDetails> {
  const normalizedPhoneNumber = phoneNumber.trim()

  if (!normalizedPhoneNumber) {
    throw new Error('Enter the patient phone number.')
  }

  const response = await request<BackendPatientDetails>(
    `/public/patient/${encodeURIComponent(normalizedPhoneNumber)}`,
  )

  return mapPatientDetails(response)
}

export function createPublicPatientStream(patientId: string) {
  return new EventSource(`${API_BASE_URL}/public/stream?patient_id=${encodeURIComponent(patientId.trim())}`)
}

export function toPatientSummary(patient: PublicPatientDetails): Patient {
  return {
    id: patient.id,
    name: patient.name,
    phoneNumber: patient.phoneNumber,
    triageState: patient.triageState,
    admittedAt: patient.admittedAt,
  }
}

export function parsePublicPatientStreamEvent(rawEvent: MessageEvent<string>): PublicPatientStreamEvent | null {
  try {
    return JSON.parse(rawEvent.data) as PublicPatientStreamEvent
  } catch {
    return null
  }
}

export function isPublicPatientNotFoundError(error: unknown) {
  return error instanceof PublicPatientApiError && error.status === 404
}
