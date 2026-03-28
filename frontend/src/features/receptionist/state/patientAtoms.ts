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

export const replaceHospitalStateAtom = atom(null, (_get, set, snapshot: HospitalSnapshot) => {
  set(doctorProfilesAtom, snapshot.doctors)
  set(notificationsAtom, snapshot.notifications)
  set(patientsAtom, snapshot.patients)
  set(isHospitalStateHydratedAtom, true)
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
