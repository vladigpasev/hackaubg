import { useEffect, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import type { AuthUser } from '../../../auth/types'
import {
  getHospitalSnapshot,
  subscribeToHospitalStream,
} from '../services/mockPatientApi'
import {
  doctorProfilesAtom,
  isHospitalStateHydratedAtom,
  notificationsAtom,
  patientsAtom,
  replaceDoctorProfilesAtom,
  replaceHospitalStateAtom,
  replaceNotificationsAtom,
  replacePatientsAtom,
} from '../state/patientAtoms'
import type { HospitalSnapshot } from '../types/patient'

export function useHospitalState(activeUser: AuthUser) {
  const doctors = useAtomValue(doctorProfilesAtom)
  const notifications = useAtomValue(notificationsAtom)
  const patients = useAtomValue(patientsAtom)
  const isHydrated = useAtomValue(isHospitalStateHydratedAtom)
  const replaceDoctors = useSetAtom(replaceDoctorProfilesAtom)
  const replaceHospitalState = useSetAtom(replaceHospitalStateAtom)
  const replaceNotifications = useSetAtom(replaceNotificationsAtom)
  const replacePatients = useSetAtom(replacePatientsAtom)
  const [isLoading, setIsLoading] = useState(!isHydrated)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadRequest, setReloadRequest] = useState(0)

  useEffect(() => {
    let isActive = true

    async function hydrateHospitalState() {
      if (isHydrated && reloadRequest === 0) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setLoadError(null)

      try {
        const snapshot = await getHospitalSnapshot(activeUser)

        if (!isActive) {
          return
        }

        replaceHospitalState(snapshot)
      } catch (error) {
        if (!isActive) {
          return
        }

        setLoadError(
          error instanceof Error
            ? error.message
            : 'The workspace could not be loaded right now. Please try again.',
        )
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    void hydrateHospitalState()

    return () => {
      isActive = false
    }
  }, [activeUser, isHydrated, reloadRequest, replaceHospitalState])

  useEffect(() => {
    if (!isHydrated) {
      return
    }

    const unsubscribe = subscribeToHospitalStream(
      activeUser,
      doctors,
      (snapshot) => {
        replaceHospitalState(snapshot)
        setLoadError(null)
      },
      (error) => {
        setLoadError(error.message)
      },
    )

    return unsubscribe
  }, [activeUser, doctors, isHydrated, replaceHospitalState])

  function replaceSnapshot(snapshot: HospitalSnapshot) {
    replaceHospitalState(snapshot)
  }

  return {
    doctors,
    isLoading,
    loadError,
    notifications,
    patients,
    reloadHospitalState: () => setReloadRequest((current) => current + 1),
    replaceDoctors,
    replaceNotifications,
    replacePatients,
    replaceSnapshot,
  }
}
