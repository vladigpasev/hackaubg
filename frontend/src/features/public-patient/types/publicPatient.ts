import type { Patient, TriageState } from '../../receptionist/types/patient'

export type PublicPatientTriageState = Exclude<TriageState, 'unknown'>

export interface PublicPatientQueueRecord {
  timestamp: string
  triageState: PublicPatientTriageState
  specialty: string
  refferedById: string
}

export interface PublicPatientHistoryRecord {
  refferedById: string
  specialty: string
  triageState: PublicPatientTriageState
  refferedToId: string
  isDone: boolean
  timestamp: string
}

export interface PublicPatientDetails extends Patient {
  triageState: PublicPatientTriageState
  notes: string[]
  history: PublicPatientHistoryRecord[]
  queue: PublicPatientQueueRecord[]
}

export interface PublicPatientStreamEvent {
  type: string
  data: {
    id?: string
  }
}
