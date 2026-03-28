import { atom } from 'jotai'
import type { PatientCheckoutEvent, Patient } from '../types/patient'

export const patientsAtom = atom<Patient[]>([])
export const isPatientQueueOnlineAtom = atom(true)
export const isReceptionOnlineAtom = isPatientQueueOnlineAtom

export const replacePatientsAtom = atom(null, (_get, set, patients: Patient[]) => {
  set(patientsAtom, patients)
})

export const addPatientFromEventAtom = atom(null, (get, set, patient: Patient) => {
  const currentPatients = get(patientsAtom)
  const nextPatients = currentPatients.filter((currentPatient) => currentPatient.id !== patient.id)
  set(patientsAtom, [...nextPatients, patient])
})

export const removePatientFromEventAtom = atom(null, (get, set, payload: PatientCheckoutEvent) => {
  const currentPatients = get(patientsAtom)
  set(
    patientsAtom,
    currentPatients.filter((patient) => patient.id !== payload.id),
  )
})
