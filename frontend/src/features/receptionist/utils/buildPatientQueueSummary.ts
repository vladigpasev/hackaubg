import type { Patient, TriageState } from '../types/patient'

export interface PatientQueueSummary {
  totalCount: number
  attentionCount: number
  firstInQueueLabel: string
  triageCounts: Record<TriageState, number>
}

export function buildPatientQueueSummary(patients: Patient[]): PatientQueueSummary {
  const triageCounts: Record<TriageState, number> = {
    unknown: 0,
    green: 0,
    yellow: 0,
    red: 0,
  }

  let oldestPatient: Patient | null = null

  for (const patient of patients) {
    triageCounts[patient.triageState] += 1

    if (!oldestPatient || new Date(patient.admittedAt).getTime() < new Date(oldestPatient.admittedAt).getTime()) {
      oldestPatient = patient
    }
  }

  return {
    totalCount: patients.length,
    attentionCount: triageCounts.yellow + triageCounts.red,
    firstInQueueLabel: oldestPatient?.name ?? 'No patients',
    triageCounts,
  }
}
