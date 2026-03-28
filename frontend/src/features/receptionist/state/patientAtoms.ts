import { atom } from 'jotai'
import type {
  DoctorProfile,
  HospitalSnapshot,
  Patient,
  WorkspaceNotification,
} from '../types/patient'

export const patientsAtom = atom<Patient[]>([])
export const doctorProfilesAtom = atom<DoctorProfile[]>([])
export const notificationsAtom = atom<WorkspaceNotification[]>([])
export const isHospitalStateHydratedAtom = atom(false)
export const hospitalStateOwnerAtom = atom<string | null>(null)

export const replaceHospitalStateAtom = atom(
  null,
  (_get, set, payload: { sessionKey: string; snapshot: HospitalSnapshot }) => {
    set(doctorProfilesAtom, payload.snapshot.doctors)
    set(notificationsAtom, payload.snapshot.notifications)
    set(patientsAtom, payload.snapshot.patients)
    set(hospitalStateOwnerAtom, payload.sessionKey)
    set(isHospitalStateHydratedAtom, true)
  },
)

export const resetHospitalStateAtom = atom(null, (_get, set) => {
  set(doctorProfilesAtom, [])
  set(notificationsAtom, [])
  set(patientsAtom, [])
  set(hospitalStateOwnerAtom, null)
  set(isHospitalStateHydratedAtom, false)
})

export const replacePatientsAtom = atom(null, (_get, set, patients: Patient[]) => {
  set(patientsAtom, patients)
})

export const replaceDoctorProfilesAtom = atom(null, (_get, set, doctors: DoctorProfile[]) => {
  set(doctorProfilesAtom, doctors)
})

export const replaceNotificationsAtom = atom(
  null,
  (_get, set, notifications: WorkspaceNotification[]) => {
    set(notificationsAtom, notifications)
  },
)
