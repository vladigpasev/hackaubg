import { useEffect, useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  checkInPatient,
  checkoutPatient,
  getPatientById,
  getPatients,
} from '../services/mockPatientApi'
import { patientEventStream } from '../services/mockPatientEventStream'
import {
  isPatientQueueOnlineAtom,
  patientsAtom,
  replacePatientsAtom,
} from '../state/patientAtoms'
import type { CheckInPatientInput, Patient } from '../types/patient'
import { buildPatientQueueSummary } from '../utils/buildPatientQueueSummary'

export interface FeedbackState {
  tone: 'success' | 'error'
  message: string
}

interface PatientWorkspacePermissions {
  canRegisterPatients: boolean
  canCheckoutPatients: boolean
}

export function usePatientWorkspace({
  canCheckoutPatients,
  canRegisterPatients,
}: PatientWorkspacePermissions) {
  const patients = useAtomValue(patientsAtom)
  const replacePatients = useSetAtom(replacePatientsAtom)
  const [isPatientQueueOnline, setIsPatientQueueOnline] = useAtom(isPatientQueueOnlineAtom)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [reloadRequest, setReloadRequest] = useState(0)
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false)
  const [isSubmittingRegistration, setIsSubmittingRegistration] = useState(false)
  const [isCheckingOutPatientId, setIsCheckingOutPatientId] = useState<string | null>(null)
  const [isOpeningMoreOptionsPatientId, setIsOpeningMoreOptionsPatientId] = useState<string | null>(null)
  const [patientPendingCheckout, setPatientPendingCheckout] = useState<Patient | null>(null)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [isMoreOptionsOpen, setIsMoreOptionsOpen] = useState(false)

  useEffect(() => {
    setIsPatientQueueOnline(true)
  }, [setIsPatientQueueOnline])

  useEffect(() => {
    let isActive = true

    async function loadPatients() {
      setIsLoading(true)
      setLoadError(null)

      try {
        const nextPatients = await getPatients()

        if (!isActive) {
          return
        }

        replacePatients(nextPatients)
      } catch (error) {
        if (!isActive) {
          return
        }

        setLoadError(
          error instanceof Error
            ? error.message
            : 'The patient list could not be loaded right now. Please try again.',
        )
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    void loadPatients()

    return () => {
      isActive = false
    }
  }, [reloadRequest, replacePatients])

  useEffect(() => {
    if (!feedback || feedback.tone !== 'success') {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setFeedback((current) => (current?.tone === 'success' ? null : current))
    }, 2600)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [feedback])

  async function handleRegisterPatient(values: CheckInPatientInput) {
    if (!canRegisterPatients) {
      return
    }

    setIsSubmittingRegistration(true)

    try {
      const createdPatient = await checkInPatient(values)
      patientEventStream.emit('patient:new', createdPatient)
      setFeedback({
        tone: 'success',
        message: 'Patient checked in successfully.',
      })
      setIsRegisterModalOpen(false)
    } finally {
      setIsSubmittingRegistration(false)
    }
  }

  function openRegisterModal() {
    if (!canRegisterPatients) {
      return
    }

    setIsRegisterModalOpen(true)
  }

  function closeRegisterModal() {
    if (isSubmittingRegistration) {
      return
    }

    setIsRegisterModalOpen(false)
  }

  function requestCheckout(patient: Patient) {
    if (!canCheckoutPatients) {
      return
    }

    setPatientPendingCheckout(patient)
  }

  function closeCheckoutModal() {
    if (isCheckingOutPatientId) {
      return
    }

    setPatientPendingCheckout(null)
  }

  async function confirmCheckout() {
    if (!canCheckoutPatients || !patientPendingCheckout) {
      return
    }

    setIsCheckingOutPatientId(patientPendingCheckout.id)

    try {
      const payload = await checkoutPatient(patientPendingCheckout.id)
      patientEventStream.emit('patient:checkout', payload)
      setFeedback({
        tone: 'success',
        message: `${patientPendingCheckout.name} checked out.`,
      })
    } catch (error) {
      setFeedback({
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Checkout could not be completed right now. Please try again.',
      })
    } finally {
      setIsCheckingOutPatientId(null)
      setPatientPendingCheckout(null)
    }
  }

  async function handleOpenMoreOptions(patient: Patient) {
    setIsOpeningMoreOptionsPatientId(patient.id)

    try {
      const patientDetails = await getPatientById(patient.id)
      setSelectedPatient(patientDetails)
      setIsMoreOptionsOpen(true)
    } catch (error) {
      setFeedback({
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Patient details are unavailable right now. Please try again.',
      })
    } finally {
      setIsOpeningMoreOptionsPatientId(null)
    }
  }

  function closeMoreOptionsModal() {
    setIsMoreOptionsOpen(false)
    setSelectedPatient(null)
  }

  return {
    feedback,
    isLoading,
    isPatientQueueOnline,
    loadError,
    patients,
    summary: buildPatientQueueSummary(patients),
    goOffline: () => setIsPatientQueueOnline(false),
    goOnline: () => setIsPatientQueueOnline(true),
    reloadPatients: () => setReloadRequest((current) => current + 1),
    checkoutControls: canCheckoutPatients
      ? {
          isCheckingOutPatientId,
          onCheckout: requestCheckout,
          modal: {
            isSubmitting: Boolean(isCheckingOutPatientId),
            onClose: closeCheckoutModal,
            onConfirm: confirmCheckout,
            open: patientPendingCheckout !== null,
            patient: patientPendingCheckout,
          },
        }
      : null,
    patientDetailsControls: {
      isOpeningMoreOptionsPatientId,
      onClose: closeMoreOptionsModal,
      onOpenMoreOptions: handleOpenMoreOptions,
      open: isMoreOptionsOpen,
      patient: selectedPatient,
    },
    registerControls: canRegisterPatients
      ? {
          isSubmitting: isSubmittingRegistration,
          onClose: closeRegisterModal,
          onOpen: openRegisterModal,
          onSubmit: handleRegisterPatient,
          open: isRegisterModalOpen,
        }
      : null,
  }
}
