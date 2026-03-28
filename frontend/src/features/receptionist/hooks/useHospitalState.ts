import { useEffect, useMemo, useRef, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import type { AuthUser } from '../../../auth/types'
import {
  getHospitalSnapshot,
  subscribeToHospitalStream,
} from '../services/mockPatientApi'
import {
  doctorProfilesAtom,
  hospitalStateOwnerAtom,
  isHospitalStateHydratedAtom,
  notificationsAtom,
  patientsAtom,
  replaceDoctorProfilesAtom,
  replaceHospitalStateAtom,
  replaceNotificationsAtom,
  replacePatientsAtom,
} from '../state/patientAtoms'
import type { HospitalSnapshot } from '../types/patient'

function buildHospitalSessionKey(activeUser: AuthUser) {
  return [
    activeUser.role,
    activeUser.username,
    activeUser.isTester ? 'tester' : 'staff',
    [...activeUser.specialties].sort().join(','),
  ].join('|')
}

export function useHospitalState(activeUser: AuthUser) {
  const doctors = useAtomValue(doctorProfilesAtom)
  const hospitalStateOwner = useAtomValue(hospitalStateOwnerAtom)
  const notifications = useAtomValue(notificationsAtom)
  const patients = useAtomValue(patientsAtom)
  const isHydrated = useAtomValue(isHospitalStateHydratedAtom)
  const replaceDoctors = useSetAtom(replaceDoctorProfilesAtom)
  const replaceHospitalState = useSetAtom(replaceHospitalStateAtom)
  const replaceNotifications = useSetAtom(replaceNotificationsAtom)
  const replacePatients = useSetAtom(replacePatientsAtom)
  const sessionKey = useMemo(() => buildHospitalSessionKey(activeUser), [activeUser])
  const hasLoadedSnapshot = isHydrated && hospitalStateOwner === sessionKey
  const runtimeDoctorsRef = useRef(doctors)
  const [isLoading, setIsLoading] = useState(!hasLoadedSnapshot)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadRequest, setReloadRequest] = useState(0)

  useEffect(() => {
    runtimeDoctorsRef.current = doctors
  }, [doctors])

  useEffect(() => {
    let isActive = true

    async function hydrateHospitalState() {
      if (hasLoadedSnapshot && reloadRequest === 0) {
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

        replaceHospitalState({
          sessionKey,
          snapshot,
        })
        setLoadError(null)
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
  }, [activeUser, hasLoadedSnapshot, reloadRequest, replaceHospitalState, sessionKey])

  useEffect(() => {
    if (!hasLoadedSnapshot) {
      return
    }

    const unsubscribe = subscribeToHospitalStream(
      activeUser,
      () => runtimeDoctorsRef.current,
      (snapshot) => {
        replaceHospitalState({
          sessionKey,
          snapshot,
        })
        setLoadError(null)
      },
      (error) => {
        setLoadError(error.message)
      },
    )

    return unsubscribe
  }, [activeUser, hasLoadedSnapshot, replaceHospitalState, sessionKey])

  function replaceSnapshot(snapshot: HospitalSnapshot) {
    replaceHospitalState({
      sessionKey,
      snapshot,
    })
  }

  return {
    doctors,
    hasLoadedSnapshot,
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
