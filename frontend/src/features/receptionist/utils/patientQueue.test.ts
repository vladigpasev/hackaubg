import { describe, expect, it } from 'vitest'
import { normalizeBackendCode } from '../services/hospitalRepository'
import type { Patient, PatientAgendaEntry } from '../types/patient'
import {
  canCheckoutPatient,
  getPatientBoardCode,
  getPatientNextDestinationLabel,
} from './patientQueue'

function buildPatient(agenda: PatientAgendaEntry[]): Patient {
  return {
    admittedAt: '2026-03-28T08:00:00.000Z',
    agenda,
    checkedOutAt: null,
    core: {
      admittedAt: '2026-03-28T08:00:00.000Z',
      id: 'PAT-1',
      name: 'Patient One',
      notes: [],
      phoneNumber: '+359 888 123 456',
      triageState: 'GREEN',
    },
    defaultCode: 'GREEN',
    detail: null,
    id: 'PAT-1',
    lastUpdatedAt: '2026-03-28T08:00:00.000Z',
    name: 'Patient One',
    notes: [],
    overlay: {
      agenda,
    },
    phoneNumber: '+359 888 123 456',
  }
}

describe('patient agenda helpers', () => {
  it('normalizes legacy backend red to yellow', () => {
    expect(normalizeBackendCode('RED')).toBe('YELLOW')
  })

  it('uses pending lab work as the next destination until all tests are taken', () => {
    const patient = buildPatient([
      {
        assignedDoctorId: 'DOC-1',
        blockedByBatchId: null,
        code: 'GREEN',
        completedAt: '2026-03-28T08:15:00.000Z',
        createdAt: '2026-03-28T08:00:00.000Z',
        entryType: 'doctor_visit',
        id: 'VISIT-1',
        isReturnVisit: false,
        note: '',
        queueOrder: 0,
        requestedByLabel: 'Registry desk',
        sourceVisitId: null,
        specialty: 'Cardiology',
        status: 'done',
        updatedAt: '2026-03-28T08:15:00.000Z',
      },
      {
        createdAt: '2026-03-28T08:16:00.000Z',
        entryType: 'lab_batch',
        id: 'BATCH-1',
        items: [
          {
            assignedDoctorId: 'LAB-1',
            code: 'YELLOW',
            createdAt: '2026-03-28T08:16:00.000Z',
            id: 'LAB-ITEM-1',
            queueOrder: 1,
            status: 'queued',
            takenAt: null,
            takenByLabel: null,
            testName: 'Blood Test',
            testerSpecialty: 'Laboratory Medicine',
            updatedAt: '2026-03-28T08:16:00.000Z',
          },
        ],
        note: '',
        orderedByDoctorId: 'DOC-1',
        orderedByLabel: 'Dr. Petrova',
        resultsReadyAt: null,
        returnCode: 'YELLOW',
        returnCreatedAt: null,
        returnDoctorId: 'DOC-1',
        returnSpecialty: 'Cardiology',
        sourceVisitId: 'VISIT-1',
        status: 'collecting',
        updatedAt: '2026-03-28T08:16:00.000Z',
      },
      {
        assignedDoctorId: 'DOC-2',
        blockedByBatchId: 'BATCH-1',
        code: 'GREEN',
        completedAt: null,
        createdAt: '2026-03-28T08:17:00.000Z',
        entryType: 'doctor_visit',
        id: 'VISIT-2',
        isReturnVisit: false,
        note: '',
        queueOrder: 1,
        requestedByLabel: 'Dr. Petrova',
        sourceVisitId: 'VISIT-1',
        specialty: 'Pulmonology',
        status: 'queued',
        updatedAt: '2026-03-28T08:17:00.000Z',
      },
    ])

    expect(getPatientNextDestinationLabel(patient)).toBe('Blood Test')
    expect(getPatientBoardCode(patient)).toBe('YELLOW')

    const updatedPatient = buildPatient([
      patient.agenda[0],
      {
        ...(patient.agenda[1] as Extract<PatientAgendaEntry, { entryType: 'lab_batch' }>),
        items: [
          {
            ...(
              (patient.agenda[1] as Extract<PatientAgendaEntry, { entryType: 'lab_batch' }>).items[0]
            ),
            status: 'taken',
            takenAt: '2026-03-28T08:20:00.000Z',
            takenByLabel: 'Lab Tester',
            updatedAt: '2026-03-28T08:20:00.000Z',
          },
        ],
        status: 'waiting_results',
        updatedAt: '2026-03-28T08:20:00.000Z',
      },
      patient.agenda[2],
    ])

    expect(getPatientNextDestinationLabel(updatedPatient)).toBe('Pulmonology')
    expect(getPatientBoardCode(updatedPatient)).toBe('GREEN')
  })

  it('prioritizes an inserted return visit by its code after results are released', () => {
    const patient = buildPatient([
      {
        createdAt: '2026-03-28T08:16:00.000Z',
        entryType: 'lab_batch',
        id: 'BATCH-1',
        items: [
          {
            assignedDoctorId: 'LAB-1',
            code: 'GREEN',
            createdAt: '2026-03-28T08:16:00.000Z',
            id: 'LAB-ITEM-1',
            queueOrder: 0,
            status: 'taken',
            takenAt: '2026-03-28T08:20:00.000Z',
            takenByLabel: 'Lab Tester',
            testName: 'Blood Test',
            testerSpecialty: 'Laboratory Medicine',
            updatedAt: '2026-03-28T08:20:00.000Z',
          },
        ],
        note: '',
        orderedByDoctorId: 'DOC-1',
        orderedByLabel: 'Dr. Petrova',
        resultsReadyAt: '2026-03-28T08:30:00.000Z',
        returnCode: 'YELLOW',
        returnCreatedAt: '2026-03-28T08:30:00.000Z',
        returnDoctorId: 'DOC-1',
        returnSpecialty: 'Cardiology',
        sourceVisitId: 'VISIT-1',
        status: 'return_created',
        updatedAt: '2026-03-28T08:30:00.000Z',
      },
      {
        assignedDoctorId: 'DOC-2',
        blockedByBatchId: 'BATCH-1',
        code: 'GREEN',
        completedAt: null,
        createdAt: '2026-03-28T08:17:00.000Z',
        entryType: 'doctor_visit',
        id: 'VISIT-LATER',
        isReturnVisit: false,
        note: '',
        queueOrder: 1,
        requestedByLabel: 'Dr. Petrova',
        sourceVisitId: 'VISIT-1',
        specialty: 'Pulmonology',
        status: 'queued',
        updatedAt: '2026-03-28T08:17:00.000Z',
      },
      {
        assignedDoctorId: 'DOC-1',
        blockedByBatchId: null,
        code: 'YELLOW',
        completedAt: null,
        createdAt: '2026-03-28T08:30:00.000Z',
        entryType: 'doctor_visit',
        id: 'VISIT-RETURN',
        isReturnVisit: true,
        note: 'Return visit after lab results.',
        queueOrder: 2,
        requestedByLabel: 'Lab results',
        sourceVisitId: 'VISIT-1',
        specialty: 'Cardiology',
        status: 'queued',
        updatedAt: '2026-03-28T08:30:00.000Z',
      },
    ])

    expect(getPatientNextDestinationLabel(patient)).toBe('Cardiology')
    expect(getPatientBoardCode(patient)).toBe('YELLOW')
  })

  it('only allows checkout when visits are done and lab batches are fully closed', () => {
    const patientWaitingResults = buildPatient([
      {
        createdAt: '2026-03-28T08:16:00.000Z',
        entryType: 'lab_batch',
        id: 'BATCH-1',
        items: [],
        note: '',
        orderedByDoctorId: 'DOC-1',
        orderedByLabel: 'Dr. Petrova',
        resultsReadyAt: null,
        returnCode: 'GREEN',
        returnCreatedAt: null,
        returnDoctorId: 'DOC-1',
        returnSpecialty: 'Cardiology',
        sourceVisitId: 'VISIT-1',
        status: 'waiting_results',
        updatedAt: '2026-03-28T08:20:00.000Z',
      },
    ])

    expect(canCheckoutPatient(patientWaitingResults)).toBe(false)

    const patientClosed = buildPatient([
      {
        assignedDoctorId: 'DOC-1',
        blockedByBatchId: null,
        code: 'GREEN',
        completedAt: '2026-03-28T08:40:00.000Z',
        createdAt: '2026-03-28T08:00:00.000Z',
        entryType: 'doctor_visit',
        id: 'VISIT-1',
        isReturnVisit: false,
        note: '',
        queueOrder: 0,
        requestedByLabel: 'Registry desk',
        sourceVisitId: null,
        specialty: 'Cardiology',
        status: 'done',
        updatedAt: '2026-03-28T08:40:00.000Z',
      },
      {
        createdAt: '2026-03-28T08:16:00.000Z',
        entryType: 'lab_batch',
        id: 'BATCH-1',
        items: [],
        note: '',
        orderedByDoctorId: 'DOC-1',
        orderedByLabel: 'Dr. Petrova',
        resultsReadyAt: '2026-03-28T08:30:00.000Z',
        returnCode: 'GREEN',
        returnCreatedAt: '2026-03-28T08:30:00.000Z',
        returnDoctorId: 'DOC-1',
        returnSpecialty: 'Cardiology',
        sourceVisitId: 'VISIT-1',
        status: 'return_created',
        updatedAt: '2026-03-28T08:30:00.000Z',
      },
      {
        assignedDoctorId: 'DOC-1',
        blockedByBatchId: null,
        code: 'GREEN',
        completedAt: '2026-03-28T08:35:00.000Z',
        createdAt: '2026-03-28T08:30:00.000Z',
        entryType: 'doctor_visit',
        id: 'VISIT-RETURN',
        isReturnVisit: true,
        note: 'Return visit after lab results.',
        queueOrder: 0,
        requestedByLabel: 'Lab results',
        sourceVisitId: 'VISIT-1',
        specialty: 'Cardiology',
        status: 'done',
        updatedAt: '2026-03-28T08:35:00.000Z',
      },
    ])

    expect(canCheckoutPatient(patientClosed)).toBe(true)
  })
})
