import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/useAuth'
import { CodeSelector } from '../features/receptionist/components/CodeSelector'
import { Modal } from '../features/receptionist/components/Modal'
import { PatientAgendaTimeline } from '../features/receptionist/components/PatientAgendaTimeline'
import { TriageBadge } from '../features/receptionist/components/TriageBadge'
import { TypeaheadInput } from '../features/receptionist/components/TypeaheadInput'
import { useHospitalState } from '../features/receptionist/hooks/useHospitalState'
import {
  addAssignments,
  buildSpecialtyCatalog,
  checkoutPatient,
  createPatient,
  getUnreadNotificationCount,
  getVisibleNotifications,
  markNotificationRead,
  prefetchPatientDetails,
  updatePatientCore,
} from '../features/receptionist/services/mockPatientApi'
import type {
  AssignmentCode,
  AssignmentDraft,
  CatalogOption,
  CheckInPatientInput,
  HospitalMutationResult,
  HospitalSnapshot,
  Patient,
  PatientMutationActor,
  UpdatePatientCoreInput,
  WorkspaceNotification,
} from '../features/receptionist/types/patient'
import {
  buildPatientOverviewSummary,
  canCheckoutPatient,
  getPatientAgendaPendingCount,
  getPatientBoardCode,
  getPatientDisplayStatus,
  getPatientNextDestinationLabel,
  sortPatientsForOverview,
} from '../features/receptionist/utils/patientQueue'

interface FeedbackState {
  message: string
  tone: 'error' | 'success'
}

interface PatientQueueRolePageProps {
  canCheckoutPatients: boolean
  canRegisterPatients: boolean
  contextLabel: string
}

const admittedAtFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const compactTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  month: 'short',
})

function formatAdmittedAt(value: string) {
  return admittedAtFormatter.format(new Date(value))
}

function formatCompactTime(value: string) {
  return compactTimeFormatter.format(new Date(value))
}

function statusStyles(status: ReturnType<typeof getPatientDisplayStatus>) {
  switch (status) {
    case 'with_staff':
      return 'border-[var(--blue-border)] bg-[var(--blue-soft)] text-[var(--blue-text)]'
    case 'lab_collection':
      return 'border-[var(--purple-border)] bg-[var(--purple-soft)] text-[var(--purple-text)]'
    case 'waiting_results':
      return 'border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber-text)]'
    case 'results_ready':
      return 'border-[var(--teal-border)] bg-[var(--teal-soft)] text-[var(--teal-strong)]'
    case 'done':
      return 'border-[var(--green-border)] bg-[var(--green-soft)] text-[var(--green-text)]'
    case 'checked_out':
      return 'border-[var(--border-soft)] bg-[var(--surface-soft)] text-[var(--text-secondary)]'
    case 'waiting':
      return 'border-[var(--border-soft)] bg-white text-[var(--text-primary)]'
  }
}

function statusLabel(status: ReturnType<typeof getPatientDisplayStatus>) {
  switch (status) {
    case 'with_staff':
      return 'With staff'
    case 'lab_collection':
      return 'Tests to take'
    case 'waiting_results':
      return 'Waiting for results'
    case 'results_ready':
      return 'Results ready'
    case 'done':
      return 'Done'
    case 'checked_out':
      return 'Checked out'
    case 'waiting':
      return 'Waiting'
  }
}

function Shell({
  actions,
  children,
  rightActions,
}: {
  actions: ReactNode
  children: ReactNode
  rightActions: ReactNode
}) {
  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-[1.35rem] border border-[var(--border-soft)] bg-white/92 px-4 py-3 shadow-[0_18px_50px_rgba(19,56,78,0.06)]">
          <div className="flex min-w-0 items-center gap-3">{actions}</div>
          <div className="flex flex-wrap items-center gap-2">{rightActions}</div>
        </header>
        {children}
      </div>
    </main>
  )
}

function NextStepDrafts({
  drafts,
  onRemove,
}: {
  drafts: AssignmentDraft[]
  onRemove: (draftId: string) => void
}) {
  if (drafts.length === 0) {
    return (
      <div className="rounded-[1rem] border border-dashed border-[var(--border-soft)] bg-white p-4 text-sm text-[var(--text-secondary)]">
        No next steps added yet.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {drafts.map((draft) => (
        <div
          key={draft.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border border-[var(--border-soft)] bg-white px-3 py-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[var(--teal-border)] bg-[var(--teal-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--teal-strong)]">
              Doctor
            </span>
            <TriageBadge triageState={draft.code} />
            <span className="text-sm font-semibold text-[var(--text-primary)]">{draft.label}</span>
          </div>
          <button
            className="min-h-12 rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-secondary)]"
            onClick={() => onRemove(draft.id)}
            type="button"
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  )
}

function RegisterPatientDialog({
  isSubmitting,
  onClose,
  onSubmit,
  open,
  specialtyOptions,
}: {
  isSubmitting: boolean
  onClose: () => void
  onSubmit: (values: CheckInPatientInput) => Promise<void>
  open: boolean
  specialtyOptions: CatalogOption[]
}) {
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [code, setCode] = useState<AssignmentCode>('GREEN')
  const [firstSpecialty, setFirstSpecialty] = useState('')

  const canSubmit =
    name.trim().length >= 2 &&
    phoneNumber.trim().length > 0 &&
    firstSpecialty.trim().length > 0

  return (
    <Modal
      contextLabel="Registry"
      onClose={onClose}
      open={open}
      title="Register patient"
      footer={
        <>
          <button
            className="min-h-12 rounded-[1rem] border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-secondary)]"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="min-h-14 rounded-[1rem] border border-[var(--teal-strong)] bg-[var(--teal)] px-5 py-3 text-base font-semibold text-white transition hover:bg-[var(--teal-strong)] disabled:opacity-60"
            disabled={isSubmitting || !canSubmit}
            onClick={() =>
              void onSubmit({
                defaultCode: code,
                firstAssignmentCode: code,
                firstSpecialty,
                name,
                notes,
                phoneNumber,
              })
            }
            type="button"
          >
            Register patient
          </button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <label className="block text-sm font-semibold text-[var(--text-primary)]">
            Name
            <input
              className="mt-2 min-h-14 w-full rounded-[1.1rem] border border-[var(--border-soft)] px-4 py-3 text-base outline-none transition focus:border-[var(--teal-strong)]"
              onChange={(event) => setName(event.target.value)}
              placeholder="Patient name"
              type="text"
              value={name}
            />
          </label>
          <label className="block text-sm font-semibold text-[var(--text-primary)]">
            Phone
            <input
              className="mt-2 min-h-14 w-full rounded-[1.1rem] border border-[var(--border-soft)] px-4 py-3 text-base outline-none transition focus:border-[var(--teal-strong)]"
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="Required"
              type="text"
              value={phoneNumber}
            />
          </label>
          <label className="block text-sm font-semibold text-[var(--text-primary)]">
            Intake note
            <textarea
              className="mt-2 min-h-28 w-full rounded-[1.1rem] border border-[var(--border-soft)] px-4 py-3 text-base outline-none transition focus:border-[var(--teal-strong)]"
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional short note"
              value={notes}
            />
          </label>
        </div>

        <div className="space-y-4 rounded-[1.25rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            First destination
          </p>
          <TypeaheadInput
            label="Doctor specialty"
            onChange={setFirstSpecialty}
            onSelect={setFirstSpecialty}
            options={specialtyOptions}
            placeholder="Search specialty"
            value={firstSpecialty}
          />
          <div>
            <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Code</p>
            <CodeSelector onChange={setCode} value={code} />
          </div>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">
            The registry assigns the first doctor specialty and the patient is routed to the doctor with the smallest queue for that specialty.
          </p>
        </div>
      </div>
    </Modal>
  )
}

function NotificationsDialog({
  isSubmitting,
  notifications,
  onClose,
  onMarkRead,
  open,
}: {
  isSubmitting: boolean
  notifications: WorkspaceNotification[]
  onClose: () => void
  onMarkRead: (notificationId: string) => Promise<void>
  open: boolean
}) {
  return (
    <Modal contextLabel="Nurse station" onClose={onClose} open={open} title="Guidance inbox">
      <div className="space-y-3">
        {notifications.length === 0 ? (
          <div className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
            No guidance notifications right now.
          </div>
        ) : (
          notifications.map((notification) => (
            <article
              key={notification.id}
              className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{notification.title}</p>
                    {!notification.readAt ? (
                      <span className="rounded-full bg-[var(--amber-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--amber-text)]">
                        New
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{notification.message}</p>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    {formatCompactTime(notification.createdAt)}
                  </p>
                </div>
                {!notification.readAt ? (
                  <button
                    className="min-h-12 rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-white disabled:opacity-60"
                    disabled={isSubmitting}
                    onClick={() => void onMarkRead(notification.id)}
                    type="button"
                  >
                    Mark read
                  </button>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>
    </Modal>
  )
}

function PatientDetailsDialog({
  canCheckoutPatients,
  doctors,
  isSubmitting,
  onAddAssignments,
  onCheckout,
  onClose,
  onSaveCore,
  open,
  patient,
  specialtyOptions,
}: {
  canCheckoutPatients: boolean
  doctors: HospitalSnapshot['doctors']
  isSubmitting: boolean
  onAddAssignments: (drafts: AssignmentDraft[]) => Promise<void>
  onCheckout: () => Promise<void>
  onClose: () => void
  onSaveCore: (values: UpdatePatientCoreInput) => Promise<void>
  open: boolean
  patient: Patient | null
  specialtyOptions: CatalogOption[]
}) {
  const [coreName, setCoreName] = useState(patient?.name ?? '')
  const [coreNote, setCoreNote] = useState('')
  const [corePhone, setCorePhone] = useState(patient?.phoneNumber ?? '')
  const [coreCode, setCoreCode] = useState<AssignmentCode>(patient?.defaultCode ?? 'GREEN')
  const [nextStepLabel, setNextStepLabel] = useState('')
  const [nextStepCode, setNextStepCode] = useState<AssignmentCode>('GREEN')
  const [drafts, setDrafts] = useState<AssignmentDraft[]>([])

  if (!patient) {
    return null
  }

  const displayStatus = getPatientDisplayStatus(patient)

  function addDraft() {
    if (nextStepLabel.trim().length === 0) {
      return
    }

    const duplicate = drafts.some(
      (draft) => draft.label.trim().toLowerCase() === nextStepLabel.trim().toLowerCase(),
    )

    if (duplicate) {
      return
    }

    setDrafts((current) => [
      ...current,
      {
        code: nextStepCode,
        destinationKind: 'doctor',
        id: crypto.randomUUID(),
        label: nextStepLabel.trim(),
      },
    ])
    setNextStepLabel('')
  }

  return (
    <Modal
      contextLabel="Patient agenda"
      onClose={onClose}
      open={open}
      title={patient.name}
      footer={
        <>
          <button
            className="min-h-12 rounded-[1rem] border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-secondary)]"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
          {canCheckoutPatients && canCheckoutPatient(patient) ? (
            <button
              className="min-h-12 rounded-[1rem] border border-[var(--green-border)] bg-[var(--green-soft)] px-4 py-2 text-sm font-semibold text-[var(--green-text)] transition hover:bg-white disabled:opacity-60"
              disabled={isSubmitting}
              onClick={() => void onCheckout()}
              type="button"
            >
              Checkout patient
            </button>
          ) : null}
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <TriageBadge triageState={getPatientBoardCode(patient)} />
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles(displayStatus)}`}>
            {statusLabel(displayStatus)}
          </span>
          <span className="rounded-full border border-[var(--border-soft)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
            {patient.id}
          </span>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="space-y-4">
            <label className="block text-sm font-semibold text-[var(--text-primary)]">
              Name
              <input
                className="mt-2 min-h-14 w-full rounded-[1.1rem] border border-[var(--border-soft)] px-4 py-3 text-base outline-none transition focus:border-[var(--teal-strong)]"
                onChange={(event) => setCoreName(event.target.value)}
                type="text"
                value={coreName}
              />
            </label>
            <label className="block text-sm font-semibold text-[var(--text-primary)]">
              Phone
              <input
                className="mt-2 min-h-14 w-full rounded-[1.1rem] border border-[var(--border-soft)] px-4 py-3 text-base outline-none transition focus:border-[var(--teal-strong)]"
                onChange={(event) => setCorePhone(event.target.value)}
                type="text"
                value={corePhone}
              />
            </label>
            <div>
              <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Default code</p>
              <CodeSelector disabled={isSubmitting} onChange={setCoreCode} value={coreCode} />
            </div>
            <label className="block text-sm font-semibold text-[var(--text-primary)]">
              Add note
              <textarea
                className="mt-2 min-h-24 w-full rounded-[1.1rem] border border-[var(--border-soft)] px-4 py-3 text-base outline-none transition focus:border-[var(--teal-strong)]"
                onChange={(event) => setCoreNote(event.target.value)}
                placeholder="Optional"
                value={coreNote}
              />
            </label>
            <button
              className="min-h-14 rounded-[1rem] border border-[var(--teal-strong)] bg-[var(--teal)] px-5 py-3 text-base font-semibold text-white transition hover:bg-[var(--teal-strong)] disabled:opacity-60"
              disabled={isSubmitting || coreName.trim().length < 2 || corePhone.trim().length === 0}
              onClick={() =>
                void onSaveCore({
                  defaultCode: coreCode,
                  name: coreName,
                  note: coreNote,
                  phoneNumber: corePhone,
                })
              }
              type="button"
            >
              Save patient
            </button>
          </section>

          <section className="rounded-[1.25rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Next steps
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Add doctor specialties only.
                </p>
              </div>
              <TriageBadge triageState={getPatientBoardCode(patient)} />
            </div>

            <div className="mt-4 space-y-4">
              <TypeaheadInput
                label="Doctor specialty"
                onChange={setNextStepLabel}
                onSelect={setNextStepLabel}
                options={specialtyOptions}
                placeholder="Search specialty"
                value={nextStepLabel}
              />
              <div>
                <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Assignment code</p>
                <CodeSelector onChange={setNextStepCode} value={nextStepCode} />
              </div>
              <button
                className="min-h-12 rounded-[1rem] border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-white disabled:opacity-60"
                disabled={isSubmitting || nextStepLabel.trim().length === 0}
                onClick={addDraft}
                type="button"
              >
                Add doctor step
              </button>
              <NextStepDrafts
                drafts={drafts}
                onRemove={(draftId) =>
                  setDrafts((current) => current.filter((candidate) => candidate.id !== draftId))
                }
              />
              <button
                className="min-h-14 rounded-[1rem] border border-[var(--teal-strong)] bg-[var(--teal)] px-5 py-3 text-base font-semibold text-white transition hover:bg-[var(--teal-strong)] disabled:opacity-60"
                disabled={isSubmitting || drafts.length === 0}
                onClick={() =>
                  void onAddAssignments(drafts).then(() => {
                    setDrafts([])
                    setNextStepLabel('')
                    setNextStepCode(patient.defaultCode)
                  })
                }
                type="button"
              >
                Save next steps
              </button>
            </div>
          </section>
        </div>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Patient agenda</p>
            <span className="text-xs text-[var(--text-muted)]">
              Next: {getPatientNextDestinationLabel(patient)}
            </span>
          </div>
          <PatientAgendaTimeline doctors={doctors} patient={patient} />
        </section>

        <section className="space-y-3">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Notes</p>
          {patient.notes.length === 0 ? (
            <div className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
              No notes.
            </div>
          ) : (
            <div className="space-y-2">
              {patient.notes.map((note) => (
                <article
                  key={note.id}
                  className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{note.authorLabel}</p>
                    <span className="text-xs text-[var(--text-muted)]">
                      {formatCompactTime(note.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">{note.text}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}

export function PatientQueueRolePage({
  canCheckoutPatients,
  canRegisterPatients,
  contextLabel,
}: PatientQueueRolePageProps) {
  const { logout, user } = useAuth()
  const activeUser = user!
  const {
    doctors,
    isLoading,
    loadError,
    notifications,
    patients: rawPatients,
    reloadHospitalState,
    replaceSnapshot,
  } = useHospitalState(activeUser)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [isRegisterOpen, setIsRegisterOpen] = useState(false)
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)

  const specialtyOptions = useMemo(() => buildSpecialtyCatalog(doctors), [doctors])
  const selectedPatient = rawPatients.find((patient) => patient.id === selectedPatientId) ?? null
  const nurseNotifications = activeUser.role === 'nurse' ? getVisibleNotifications(notifications, 'nurse') : []
  const unreadNotificationCount =
    activeUser.role === 'nurse' ? getUnreadNotificationCount(notifications, 'nurse') : 0
  const patients = sortPatientsForOverview(rawPatients)
  const summary = buildPatientOverviewSummary(rawPatients, nurseNotifications)

  useEffect(() => {
    if (!feedback || feedback.tone !== 'success') {
      return
    }

    const timeoutId = window.setTimeout(() => setFeedback(null), 2600)
    return () => window.clearTimeout(timeoutId)
  }, [feedback])

  useEffect(() => {
    if (selectedPatientId && !rawPatients.some((patient) => patient.id === selectedPatientId)) {
      setSelectedPatientId(null)
    }
  }, [rawPatients, selectedPatientId])

  useEffect(() => {
    if (!selectedPatientId) {
      return
    }

    void prefetchPatientDetails(selectedPatientId)
  }, [selectedPatientId])

  const actor: PatientMutationActor = {
    isTester: activeUser.isTester,
    role: activeUser.role,
    username: activeUser.username,
  }

  function applyResult(result: HospitalMutationResult | HospitalSnapshot) {
    replaceSnapshot({
      doctors: result.doctors,
      notifications: result.notifications,
      patients: result.patients,
    })
  }

  async function runMutation(
    key: string,
    run: () => Promise<HospitalMutationResult | HospitalSnapshot>,
    buildMessage?: (result: HospitalMutationResult | HospitalSnapshot) => string,
  ) {
    setBusyKey(key)

    try {
      const result = await run()
      applyResult(result)

      if (buildMessage) {
        setFeedback({
          message: buildMessage(result),
          tone: 'success',
        })
      }
    } catch (error) {
      setFeedback({
        message:
          error instanceof Error
            ? error.message
            : 'The action could not be completed right now. Please try again.',
        tone: 'error',
      })
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <>
      <Shell
        actions={
          <>
            <span className="rounded-full border border-[var(--teal-border)] bg-[var(--teal-soft)] px-3 py-1.5 text-xs font-semibold tracking-[0.16em] text-[var(--teal-strong)] uppercase">
              {contextLabel}
            </span>
            <span className="text-sm text-[var(--text-secondary)]">{activeUser.username}</span>
          </>
        }
        rightActions={
          <>
            {activeUser.role === 'nurse' ? (
              <button
                className="min-h-12 rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
                onClick={() => setIsNotificationsOpen(true)}
                type="button"
              >
                Inbox {unreadNotificationCount > 0 ? `(${unreadNotificationCount})` : ''}
              </button>
            ) : null}
            {canRegisterPatients ? (
              <button
                className="min-h-12 rounded-full border border-[var(--teal-strong)] bg-[var(--teal)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--teal-strong)]"
                onClick={() => setIsRegisterOpen(true)}
                type="button"
              >
                New patient
              </button>
            ) : null}
            <button
              className="min-h-12 rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
              onClick={() => {
                void logout()
              }}
              type="button"
            >
              Sign out
            </button>
          </>
        }
      >
        <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['Patients', String(summary.patientCount)],
            ['Open visits', String(summary.openVisitCount)],
            ['Pending labs', String(summary.pendingLabItemCount)],
            ['Waiting results', String(summary.waitingResultsCount)],
            ['Checkout', String(summary.checkoutReadyCount)],
          ].map(([label, value]) => (
            <article
              key={label}
              className="rounded-[1rem] border border-[var(--border-soft)] bg-white px-3 py-3 shadow-[0_12px_32px_rgba(19,56,78,0.04)]"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                {label}
              </p>
              <p className="mt-1.5 text-2xl font-semibold text-[var(--text-primary)]">{value}</p>
            </article>
          ))}
        </section>

        <section className="rounded-[1.2rem] border border-[var(--border-soft)] bg-white p-3 shadow-[0_16px_36px_rgba(19,56,78,0.05)]">
          {isLoading ? (
            <div className="rounded-[1rem] bg-[var(--surface-soft)] px-4 py-10 text-center text-sm text-[var(--text-secondary)]">
              Loading patients...
            </div>
          ) : loadError ? (
            <div className="rounded-[1rem] border border-[var(--red-border)] bg-[var(--red-soft)] p-4">
              <p className="text-sm font-semibold text-[var(--red-text)]">{loadError}</p>
              <button
                className="mt-3 min-h-12 rounded-full border border-[var(--border-soft)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
                onClick={reloadHospitalState}
                type="button"
              >
                Retry
              </button>
            </div>
          ) : patients.length === 0 ? (
            <div className="rounded-[1rem] bg-[var(--surface-soft)] px-4 py-10 text-center text-sm text-[var(--text-secondary)]">
              No patients.
            </div>
          ) : (
            <div className="space-y-3">
              {patients.map((patient) => {
                const displayStatus = getPatientDisplayStatus(patient)
                const boardCode = getPatientBoardCode(patient)

                return (
                  <article
                    key={patient.id}
                    className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-3"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-base font-semibold break-words text-[var(--text-primary)]">
                            {patient.name}
                          </h2>
                          <TriageBadge triageState={boardCode} />
                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles(displayStatus)}`}
                          >
                            {statusLabel(displayStatus)}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]">
                          <span>{formatAdmittedAt(patient.admittedAt)}</span>
                          <span>Next: {getPatientNextDestinationLabel(patient)}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
                          <span>{getPatientAgendaPendingCount(patient)} pending items</span>
                          <span>Default code {patient.defaultCode.toLowerCase()}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="min-h-12 rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-white"
                          onClick={() => setSelectedPatientId(patient.id)}
                          type="button"
                        >
                          Open
                        </button>
                        {canCheckoutPatients && canCheckoutPatient(patient) ? (
                          <button
                            className="min-h-12 rounded-full border border-[var(--green-border)] bg-[var(--green-soft)] px-4 py-2 text-sm font-semibold text-[var(--green-text)] transition hover:bg-white"
                            onClick={() => setSelectedPatientId(patient.id)}
                            type="button"
                          >
                            Ready to checkout
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        {feedback ? (
          <div className="pointer-events-none fixed right-4 bottom-4 z-40 w-full max-w-sm">
            <div
              className={`rounded-[1rem] border px-4 py-3 text-sm font-semibold shadow-[0_18px_48px_rgba(19,56,78,0.18)] ${
                feedback.tone === 'success'
                  ? 'border-[var(--teal-border)] bg-[var(--teal-soft)] text-[var(--teal-strong)]'
                  : 'border-[var(--red-border)] bg-[var(--red-soft)] text-[var(--red-text)]'
              }`}
              role="status"
            >
              {feedback.message}
            </div>
          </div>
        ) : null}
      </Shell>

      <RegisterPatientDialog
        key={isRegisterOpen ? 'register-open' : 'register-closed'}
        isSubmitting={busyKey === 'create-patient'}
        onClose={() => {
          if (!busyKey) {
            setIsRegisterOpen(false)
          }
        }}
        onSubmit={async (values) => {
          await runMutation(
            'create-patient',
            () =>
              createPatient(rawPatients, doctors, notifications, values, {
                ...actor,
                role: 'registry',
              }),
            (result) =>
              'patient' in result ? `${result.patient.name} added to the board.` : 'Patient created.',
          )
          setIsRegisterOpen(false)
        }}
        open={isRegisterOpen}
        specialtyOptions={specialtyOptions}
      />

      <NotificationsDialog
        isSubmitting={busyKey === 'nurse-notification'}
        notifications={nurseNotifications}
        onClose={() => {
          if (!busyKey) {
            setIsNotificationsOpen(false)
          }
        }}
        onMarkRead={(notificationId) =>
          runMutation('nurse-notification', () =>
            markNotificationRead(rawPatients, doctors, notifications, notificationId),
          )
        }
        open={isNotificationsOpen}
      />

      <PatientDetailsDialog
        canCheckoutPatients={canCheckoutPatients}
        doctors={doctors}
        isSubmitting={busyKey !== null}
        key={selectedPatient ? `${selectedPatient.id}-${selectedPatient.lastUpdatedAt}` : 'no-patient'}
        onAddAssignments={(drafts) =>
          runMutation(
            'patient-assignments',
            () =>
              addAssignments(rawPatients, doctors, notifications, selectedPatient!.id, {
                assignments: drafts,
                note: '',
              }, actor),
            (result) =>
              'patient' in result ? `Agenda updated for ${result.patient.name}.` : 'Agenda updated.',
          )
        }
        onCheckout={() =>
          runMutation(
            'checkout',
            () => checkoutPatient(rawPatients, doctors, notifications, selectedPatient!.id),
            (result) =>
              'patient' in result ? `${result.patient.name} checked out.` : 'Patient checked out.',
          )
        }
        onClose={() => {
          if (!busyKey) {
            setSelectedPatientId(null)
          }
        }}
        onSaveCore={(values) =>
          runMutation(
            'patient-core',
            () => updatePatientCore(rawPatients, doctors, notifications, selectedPatient!.id, values, actor),
            (result) =>
              'patient' in result ? `${result.patient.name} updated.` : 'Patient updated.',
          )
        }
        open={selectedPatient !== null}
        patient={selectedPatient}
        specialtyOptions={specialtyOptions}
      />
    </>
  )
}
