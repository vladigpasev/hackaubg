export type TriageState = 'unknown' | 'green' | 'yellow' | 'red'

export type Patient = {
  id: string
  name: string
  phoneNumber: string
  triageState: TriageState
  admittedAt: string
}

export interface CheckInPatientInput {
  name: string
  phoneNumber: string
}

export interface PatientCheckoutEvent {
  id: string
}
