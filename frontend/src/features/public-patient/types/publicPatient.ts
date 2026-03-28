export type PublicPatientTriageState = 'green' | 'yellow' | 'red'

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

export interface PublicPatientDetails {
  id: string
  name: string
  phoneNumber: string
  triageState: PublicPatientTriageState
  admittedAt: string
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
