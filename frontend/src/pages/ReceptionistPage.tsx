import { useEffect, useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useAuth } from '../auth/useAuth'
import { CheckoutConfirmModal } from '../features/receptionist/components/CheckoutConfirmModal'
import { PatientList } from '../features/receptionist/components/PatientList'
import { PatientMoreOptionsModal } from '../features/receptionist/components/PatientMoreOptionsModal'
import { RegisterPatientModal } from '../features/receptionist/components/RegisterPatientModal'
import {
  checkInPatient,
  checkoutPatient,
  getPatientById,
  getPatients,
} from '../features/receptionist/services/mockPatientApi'
import { patientEventStream } from '../features/receptionist/services/mockPatientEventStream'
import {
  isReceptionOnlineAtom,
  patientsAtom,
  replacePatientsAtom,
} from '../features/receptionist/state/patientAtoms'
import type { CheckInPatientInput, Patient } from '../features/receptionist/types/patient'

type FeedbackState =
  | {
      tone: 'success' | 'error'
      message: string
    }
  | null

export function ReceptionistPage() {
  const { logout, user } = useAuth()
  const patients = useAtomValue(patientsAtom)
  const replacePatients = useSetAtom(replacePatientsAtom)
  const [isReceptionOnline, setIsReceptionOnline] = useAtom(isReceptionOnlineAtom)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<FeedbackState>(null)
  const [reloadRequest, setReloadRequest] = useState(0)
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false)
  const [isSubmittingRegistration, setIsSubmittingRegistration] = useState(false)
  const [isCheckingOutPatientId, setIsCheckingOutPatientId] = useState<string | null>(null)
  const [isOpeningMoreOptionsPatientId, setIsOpeningMoreOptionsPatientId] = useState<string | null>(null)
  const [patientPendingCheckout, setPatientPendingCheckout] = useState<Patient | null>(null)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [isMoreOptionsOpen, setIsMoreOptionsOpen] = useState(false)

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

  function handleCheckout(patient: Patient) {
    setPatientPendingCheckout(patient)
  }

  function closeCheckoutModal() {
    if (isCheckingOutPatientId) {
      return
    }

    setPatientPendingCheckout(null)
  }

  async function confirmCheckout() {
    if (!patientPendingCheckout) {
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

  const unknownCount = patients.filter((patient) => patient.triageState === 'unknown').length
  const greenCount = patients.filter((patient) => patient.triageState === 'green').length
  const yellowCount = patients.filter((patient) => patient.triageState === 'yellow').length
  const redCount = patients.filter((patient) => patient.triageState === 'red').length
  const oldestPatient = patients.reduce<Patient | null>((oldest, patient) => {
    if (!oldest) {
      return patient
    }

    return new Date(patient.admittedAt).getTime() < new Date(oldest.admittedAt).getTime()
      ? patient
      : oldest
  }, null)
  const attentionCount = yellowCount + redCount
  const oldestPatientName = oldestPatient ? oldestPatient.name : 'No patients'

  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-5 px-5 py-6 sm:px-8 lg:px-10">
        <div className="relative">
          <div
            aria-hidden={isReceptionOnline ? undefined : 'true'}
            className={isReceptionOnline ? 'space-y-5' : 'pointer-events-none space-y-5 blur-[6px]'}
          >
            <header className="flex flex-col gap-4 rounded-[1.75rem] border border-[var(--border-soft)] bg-white/90 px-5 py-4 shadow-[0_24px_80px_rgba(21,54,74,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="min-w-0">
                <div className="inline-flex max-w-full flex-wrap items-center gap-3 rounded-full border border-[var(--teal-border)] bg-[var(--teal-soft)] px-4 py-2 text-sm font-semibold tracking-[0.18em] text-[var(--teal-strong)] uppercase">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--teal)]" />
                  Reception desk
                </div>
                <h1 className="mt-3 text-3xl font-semibold leading-tight break-words sm:text-4xl">
                  Patients
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                <span
                  className={`inline-flex max-w-full items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold ${
                    isReceptionOnline
                      ? 'border border-[var(--green-border)] bg-[var(--green-soft)] text-[var(--green-text)]'
                      : 'border border-[var(--border-soft)] bg-[var(--surface-secondary)] text-[var(--text-secondary)]'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full bg-current/12 text-[10px] font-bold ${
                      isReceptionOnline
                        ? ''
                        : 'border border-[var(--border-soft)] bg-white text-[var(--text-secondary)]'
                    }`}
                  >
                    {isReceptionOnline ? 'OK' : 'PA'}
                  </span>
                  {isReceptionOnline ? 'Live' : 'On break'}
                </span>
                <div className="rounded-full border border-[var(--border-soft)] bg-white px-4 py-2 text-sm text-[var(--text-secondary)]">
                  <span className="font-semibold text-[var(--text-primary)]">{user?.username}</span>
                </div>
                {isReceptionOnline ? (
                  <button
                    className="min-h-12 rounded-[1rem] border border-[var(--border-soft)] bg-white px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
                    onClick={() => setIsReceptionOnline(false)}
                    type="button"
                  >
                    Take a break
                  </button>
                ) : null}
                <button
                  className="min-h-12 rounded-[1rem] border border-[var(--border-soft)] bg-white px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
                  onClick={logout}
                  type="button"
                >
                  Sign out
                </button>
              </div>
            </header>

            <section className="grid gap-4 sm:grid-cols-3">
              <article className="rounded-[1.5rem] border border-[var(--border-soft)] bg-white px-4 py-4 shadow-[0_16px_36px_rgba(19,56,78,0.05)]">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Total queue
                </p>
                <p className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">{patients.length}</p>
              </article>

              <article className="rounded-[1.5rem] border border-[var(--border-soft)] bg-white px-4 py-4 shadow-[0_16px_36px_rgba(19,56,78,0.05)]">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Needs attention
                </p>
                <p className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">{attentionCount}</p>
              </article>

              <article className="rounded-[1.5rem] border border-[var(--border-soft)] bg-white px-4 py-4 shadow-[0_16px_36px_rgba(19,56,78,0.05)]">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  First in queue
                </p>
                <p className="mt-3 text-lg font-semibold text-[var(--text-primary)]">{oldestPatientName}</p>
              </article>
            </section>

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <section className="rounded-[2rem] border border-[var(--border-soft)] bg-white p-5 shadow-[0_18px_50px_rgba(19,56,78,0.06)] sm:p-6">
                <div className="flex flex-col gap-4 border-b border-[var(--border-soft)] pb-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-semibold break-words">Current queue</h2>
                    <span className="inline-flex rounded-full border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-1.5 text-sm font-semibold text-[var(--text-secondary)]">
                      {patients.length} patients
                    </span>
                  </div>

                  <button
                    className="min-h-14 rounded-[1.2rem] border border-[var(--teal-strong)] bg-[var(--teal)] px-5 text-base font-semibold text-white shadow-[0_18px_40px_rgba(15,143,138,0.22)] transition hover:bg-[var(--teal-strong)]"
                    onClick={() => setIsRegisterModalOpen(true)}
                    type="button"
                  >
                    Register New Patient
                  </button>
                </div>

                <div className="mt-5">
                  {isLoading ? (
                    <div className="rounded-[1.5rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-8 text-center text-sm leading-6 text-[var(--text-secondary)]">
                      Loading patients...
                    </div>
                  ) : loadError ? (
                    <div className="rounded-[1.5rem] border border-[var(--red-border)] bg-[var(--red-soft)] p-4">
                      <p className="text-sm font-semibold text-[var(--red-text)]">{loadError}</p>
                      <button
                        className="mt-4 min-h-12 rounded-[1.05rem] border border-[var(--border-soft)] bg-white px-4 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
                        onClick={() => setReloadRequest((current) => current + 1)}
                        type="button"
                      >
                        Retry
                      </button>
                    </div>
                  ) : patients.length === 0 ? (
                    <div className="rounded-[1.5rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-8 text-center">
                      <p className="text-lg font-semibold text-[var(--text-primary)]">No patients yet.</p>
                    </div>
                  ) : (
                    <PatientList
                      isCheckingOutPatientId={isCheckingOutPatientId}
                      isOpeningMoreOptionsPatientId={isOpeningMoreOptionsPatientId}
                      onCheckout={handleCheckout}
                      onOpenMoreOptions={handleOpenMoreOptions}
                      patients={patients}
                    />
                  )}
                </div>
              </section>

              <aside className="hidden xl:flex xl:flex-col xl:gap-5">
                <section className="rounded-[1.75rem] border border-[var(--border-soft)] bg-white p-5 shadow-[0_16px_36px_rgba(19,56,78,0.05)]">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Triage overview
                  </p>
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between rounded-[1.1rem] border border-[var(--border-soft)] bg-[var(--surface-secondary)] px-4 py-3">
                      <span className="font-semibold text-[var(--text-secondary)]">Unknown</span>
                      <span className="text-lg font-semibold text-[var(--text-secondary)]">{unknownCount}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-[1.1rem] border border-[var(--green-border)] bg-[var(--green-soft)] px-4 py-3">
                      <span className="font-semibold text-[var(--green-text)]">Green</span>
                      <span className="text-lg font-semibold text-[var(--green-text)]">{greenCount}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-[1.1rem] border border-[var(--amber-border)] bg-[var(--amber-soft)] px-4 py-3">
                      <span className="font-semibold text-[var(--amber-text)]">Yellow</span>
                      <span className="text-lg font-semibold text-[var(--amber-text)]">{yellowCount}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-[1.1rem] border border-[var(--red-border)] bg-[var(--red-soft)] px-4 py-3">
                      <span className="font-semibold text-[var(--red-text)]">Red</span>
                      <span className="text-lg font-semibold text-[var(--red-text)]">{redCount}</span>
                    </div>
                  </div>
                </section>
              </aside>
            </section>
          </div>

          {!isReceptionOnline ? (
            <div className="absolute inset-0 z-10 flex items-start justify-center rounded-[2rem] bg-[rgba(244,248,251,0.38)] px-4 py-4 sm:items-center sm:py-6">
              <div className="w-full max-w-md rounded-[1.75rem] border border-[var(--border-soft)] bg-white/96 p-6 text-center shadow-[0_24px_80px_rgba(21,54,74,0.12)] backdrop-blur">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Break mode
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
                  You are offline for updates.
                </h2>
                <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                  Live patient events are paused until you reconnect.
                </p>
                <button
                  className="mt-5 min-h-14 rounded-[1.2rem] border border-[var(--teal-strong)] bg-[var(--teal)] px-5 text-base font-semibold text-white shadow-[0_18px_40px_rgba(15,143,138,0.22)] transition hover:bg-[var(--teal-strong)]"
                  onClick={() => setIsReceptionOnline(true)}
                  type="button"
                >
                  Get back online
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <RegisterPatientModal
        isSubmitting={isSubmittingRegistration}
        onClose={() => setIsRegisterModalOpen(false)}
        onSubmit={handleRegisterPatient}
        open={isRegisterModalOpen}
      />
      <CheckoutConfirmModal
        isSubmitting={Boolean(isCheckingOutPatientId)}
        onClose={closeCheckoutModal}
        onConfirm={confirmCheckout}
        open={patientPendingCheckout !== null}
        patient={patientPendingCheckout}
      />
      <PatientMoreOptionsModal
        onClose={closeMoreOptionsModal}
        open={isMoreOptionsOpen}
        patient={selectedPatient}
      />
      {feedback ? (
        <div className="pointer-events-none fixed right-4 bottom-4 z-40 w-full max-w-sm sm:right-6 sm:bottom-6">
          <section
            className={`rounded-[1.35rem] border px-4 py-3 text-base font-semibold leading-6 shadow-[0_24px_60px_rgba(18,42,56,0.2)] backdrop-blur ${
              feedback.tone === 'success'
                ? 'border-[var(--teal-strong)] bg-[var(--teal-soft)] text-[var(--teal-strong)]'
                : 'border-[var(--red-text)] bg-[var(--red-soft)] text-[var(--red-text)]'
            }`}
            role="status"
          >
            {feedback.message}
          </section>
        </div>
      ) : null}
    </main>
  )
}
