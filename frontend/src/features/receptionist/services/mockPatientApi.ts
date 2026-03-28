import type { CheckInPatientInput, Patient } from '../types/patient'

const NETWORK_DELAY_MS = 420

let patientCounter = 104

let mockPatients: Patient[] = [
  {
    id: 'PT-101',
    name: 'Mila Petrova',
    phoneNumber: '+359 888 101 101',
    triageState: 'yellow',
    admittedAt: '2026-03-28T08:10:00.000Z',
  },
  {
    id: 'PT-102',
    name: 'Georgi Ivanov',
    phoneNumber: '+359 888 202 202',
    triageState: 'green',
    admittedAt: '2026-03-28T08:24:00.000Z',
  },
  {
    id: 'PT-103',
    name: 'Elena Nikolova',
    phoneNumber: '+359 888 303 303',
    triageState: 'red',
    admittedAt: '2026-03-28T08:41:00.000Z',
  },
]

function delay<T>(value: T, duration = NETWORK_DELAY_MS): Promise<T> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(value), duration)
  })
}

function clonePatient(patient: Patient): Patient {
  return { ...patient }
}

function clonePatients(patients: Patient[]) {
  return patients.map(clonePatient)
}

function buildPatientId() {
  patientCounter += 1
  return `PT-${patientCounter}`
}

function ensureFilled(value: string, fieldLabel: string) {
  if (value.trim().length === 0) {
    throw new Error(`${fieldLabel} is required.`)
  }
}

function validatePatientName(name: string) {
  const trimmedName = name.trim()

  ensureFilled(trimmedName, 'Name')

  if (trimmedName.length < 2) {
    throw new Error('Name must be at least 2 characters.')
  }

  if (!/^[a-zA-Z\s'-]+$/.test(trimmedName)) {
    throw new Error('Name can use only letters, spaces, apostrophes, or hyphens.')
  }
}

function validatePatientPhoneNumber(phoneNumber: string) {
  const trimmedPhoneNumber = phoneNumber.trim()
  const digitsOnly = trimmedPhoneNumber.replace(/\D/g, '')

  ensureFilled(trimmedPhoneNumber, 'Phone number')

  if (!/^\+?[0-9\s()-]+$/.test(trimmedPhoneNumber)) {
    throw new Error('Phone number can use only digits and common phone symbols.')
  }

  if (digitsOnly.length < 7) {
    throw new Error('Phone number must be valid.')
  }
}

export async function getPatients(): Promise<Patient[]> {
  return delay(clonePatients(mockPatients))
}

export async function checkInPatient(input: CheckInPatientInput): Promise<Patient> {
  validatePatientName(input.name)
  validatePatientPhoneNumber(input.phoneNumber)

  const patient: Patient = {
    id: buildPatientId(),
    name: input.name.trim(),
    phoneNumber: input.phoneNumber.trim(),
    triageState: 'unknown',
    admittedAt: new Date().toISOString(),
  }

  mockPatients = [...mockPatients, patient]

  return delay(clonePatient(patient))
}

export async function checkoutPatient(id: string): Promise<{ id: string }> {
  const exists = mockPatients.some((patient) => patient.id === id)

  if (!exists) {
    throw new Error('Patient could not be found for checkout.')
  }

  mockPatients = mockPatients.filter((patient) => patient.id !== id)

  return delay({ id })
}

export async function getPatientById(id: string): Promise<Patient> {
  const patient = mockPatients.find((candidate) => candidate.id === id)

  if (!patient) {
    throw new Error('Patient details are unavailable right now.')
  }

  return delay(clonePatient(patient))
}
