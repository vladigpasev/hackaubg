import { useEffect, useMemo, useState } from 'react'
import { AuthPendingScreen } from '../auth/AuthPendingScreen'
import { useAuth } from '../auth/useAuth'
import { CodeSelector } from '../features/receptionist/components/CodeSelector'
import { Modal } from '../features/receptionist/components/Modal'
import { PatientAgendaTimeline } from '../features/receptionist/components/PatientAgendaTimeline'
import { TriageBadge } from '../features/receptionist/components/TriageBadge'
import { TypeaheadInput } from '../features/receptionist/components/TypeaheadInput'
import { useHospitalState } from '../features/receptionist/hooks/useHospitalState'
import {
  addAssignments,
  addPatientNote,
  buildUnifiedAssignmentCatalog,
  completeDoctorVisit,
  getUnreadNotificationCount,
  getVisibleNotifications,
  markDoctorVisitNotHere,
  markLabItemNotHere,
  markLabItemResultsReady,
  markLabItemTaken,
  markNotificationRead,
  prefetchPatientDetails,
  startDoctorVisit,
  startLabItem,
} from '../features/receptionist/services/mockPatientApi'
import type {
  AssignmentCode,
  AssignmentDraft,
  CatalogOption,
  HospitalMutationResult,
  HospitalSnapshot,
  PatientMutationActor,
  WorkspaceNotification,
} from '../features/receptionist/types/patient'
import {
  getDoctorVisits,
  getLabBatches,
  getPatientBoardCode,
  getPatientDisplayStatus,
  getPatientNextDestinationLabel,
  getStaffCurrentItem,
  getStaffQueueItems,
} from '../features/receptionist/utils/patientQueue'

interface FeedbackState {
  message: string
  tone: 'error' | 'success'
}

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const compactTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  month: 'short',
})

function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value))
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

function QueueBadge({ isTester }: { isTester: boolean }) {
  return (
    <span className="rounded-full border border-[var(--teal-border)] bg-[var(--teal-soft)] px-3 py-1.5 text-xs font-semibold tracking-[0.16em] text-[var(--teal-strong)] uppercase">
      {isTester ? 'Lab' : 'Doctor'}
    </span>
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
    <Modal contextLabel="Queue inbox" onClose={onClose} open={open} title="Staff inbox">
      <div className="space-y-3">
        {notifications.length === 0 ? (
          <div className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
            No notifications.
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

function DraftList({
  drafts,
  onRemove,
}: {
  drafts: AssignmentDraft[]
  onRemove: (draftId: string) => void
}) {
  if (drafts.length === 0) {
    return (
      <div className="rounded-[1rem] border border-dashed border-[var(--border-soft)] bg-white p-4 text-sm text-[var(--text-secondary)]">
        Search and add doctor steps or lab items.
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
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                draft.destinationKind === 'lab'
                  ? 'border border-[var(--purple-border)] bg-[var(--purple-soft)] text-[var(--purple-text)]'
                  : 'border border-[var(--teal-border)] bg-[var(--teal-soft)] text-[var(--teal-strong)]'
              }`}
            >
              {draft.destinationKind === 'lab' ? 'Lab' : 'Doctor'}
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

function findCatalogOption(options: CatalogOption[], label: string) {
  return options.find((option) => option.label.trim().toLowerCase() === label.trim().toLowerCase()) ?? null
}

export function WorkspacePage() {
  const { logout, user } = useAuth()
  const activeUser = user!
  const {
    doctors,
    hasLoadedSnapshot,
    isLoading,
    loadError,
    notifications,
    patients,
    reloadHospitalState,
    replaceSnapshot,
  } = useHospitalState(activeUser)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [selectedQueueItemId, setSelectedQueueItemId] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [draftLabel, setDraftLabel] = useState('')
  const [draftCode, setDraftCode] = useState<AssignmentCode>('GREEN')
  const [drafts, setDrafts] = useState<AssignmentDraft[]>([])
  const [labNote, setLabNote] = useState('')

  const activeDoctor = doctors.find((doctor) => doctor.username === activeUser.username) ?? null
  const queueItems = useMemo(
    () => (activeDoctor ? getStaffQueueItems(patients, activeDoctor.id, activeUser.isTester) : []),
    [activeDoctor, activeUser.isTester, patients],
  )
  const currentItem = getStaffCurrentItem(queueItems)
  const pendingItems = queueItems.filter((item) => item.id !== currentItem?.id)
  const selectedItem =
    queueItems.find((item) => item.id === selectedQueueItemId) ?? currentItem ?? pendingItems[0] ?? null
  const selectedPatient = patients.find((patient) => patient.id === selectedItem?.patientId) ?? null
  const selectedDoctorVisit =
    selectedItem?.itemKind === 'doctor_visit' && selectedPatient
      ? getDoctorVisits(selectedPatient).find((visit) => visit.id === selectedItem.itemId) ?? null
      : null
  const selectedLabBatch =
    selectedItem?.itemKind === 'lab_item' && selectedPatient
      ? getLabBatches(selectedPatient).find((batch) => batch.id === selectedItem.batchId) ?? null
      : null
  const selectedLabItem =
    selectedItem?.itemKind === 'lab_item' && selectedLabBatch
      ? selectedLabBatch.items.find((item) => item.id === selectedItem.itemId) ?? null
      : null
  const patientStatus = selectedPatient ? getPatientDisplayStatus(selectedPatient) : null
  const doctorNotifications =
    activeDoctor ? getVisibleNotifications(notifications, 'doctor', activeDoctor.id) : []
  const unreadNotificationCount =
    activeDoctor ? getUnreadNotificationCount(notifications, 'doctor', activeDoctor.id) : 0
  const unifiedOptions = useMemo(() => buildUnifiedAssignmentCatalog(doctors), [doctors])

  useEffect(() => {
    if (!feedback || feedback.tone !== 'success') {
      return
    }

    const timeoutId = window.setTimeout(() => setFeedback(null), 2600)
    return () => window.clearTimeout(timeoutId)
  }, [feedback])

  useEffect(() => {
    if (!selectedQueueItemId) {
      return
    }

    if (!queueItems.some((item) => item.id === selectedQueueItemId)) {
      setSelectedQueueItemId(null)
    }
  }, [queueItems, selectedQueueItemId])

  useEffect(() => {
    if (!selectedPatient?.id) {
      return
    }

    void prefetchPatientDetails(selectedPatient.id)
  }, [selectedPatient?.id])

  useEffect(() => {
    setNoteText('')
    setDraftLabel('')
    setDraftCode(selectedPatient?.defaultCode ?? 'GREEN')
    setDrafts([])
    setLabNote('')
  }, [selectedPatient?.defaultCode, selectedPatient?.id, selectedPatient?.lastUpdatedAt])

  const actor: PatientMutationActor = {
    doctorId: activeDoctor?.id ?? null,
    isTester: activeUser.isTester,
    role: 'doctor',
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

  function addDraft() {
    if (!draftLabel.trim().length) {
      return
    }

    if (drafts.some((draft) => draft.label.trim().toLowerCase() === draftLabel.trim().toLowerCase())) {
      return
    }

    const option = findCatalogOption(unifiedOptions, draftLabel)

    setDrafts((current) => [
      ...current,
      {
        code: draftCode,
        destinationKind: option?.kind ?? 'doctor',
        id: crypto.randomUUID(),
        label: option?.label ?? draftLabel.trim(),
      },
    ])
    setDraftLabel('')
  }

  const sourceVisit =
    selectedDoctorVisit ??
    (selectedPatient
      ? getDoctorVisits(selectedPatient).find(
          (visit) => visit.assignedDoctorId === actor.doctorId && visit.status !== 'done',
        ) ?? null
      : null)

  const selectedWaitingResultsBatch =
    activeUser.isTester && selectedLabBatch?.status === 'waiting_results' ? selectedLabBatch : null
  const selectedLabItemAwaitingResults =
    activeUser.isTester &&
    selectedLabItem &&
    selectedLabItem.assignedDoctorId === actor.doctorId &&
    selectedLabItem.status === 'taken'
      ? selectedLabItem
      : null
  const selectedReadyResultCount = selectedWaitingResultsBatch
    ? selectedWaitingResultsBatch.items.filter((item) => item.status === 'results_ready').length
    : 0
  const selectedPendingResultCount = selectedWaitingResultsBatch
    ? selectedWaitingResultsBatch.items.filter((item) => item.status === 'taken').length
    : 0

  if (!hasLoadedSnapshot) {
    if (loadError) {
      return (
        <main className="min-h-screen bg-[var(--app-bg)] px-4 py-8 text-[var(--text-primary)]">
          <div className="mx-auto max-w-3xl rounded-[1.5rem] border border-[var(--red-border)] bg-white p-6 shadow-[0_24px_80px_rgba(21,54,74,0.08)]">
            <h1 className="text-2xl font-semibold">Unable to load the staff workspace</h1>
            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{loadError}</p>
            <button
              className="mt-4 min-h-12 rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
              onClick={reloadHospitalState}
              type="button"
            >
              Retry
            </button>
          </div>
        </main>
      )
    }

    return (
      <AuthPendingScreen
        title="Loading staff workspace"
        message="The app is loading the current hospital directory and queue before showing staff-specific state."
      />
    )
  }

  if (!activeDoctor) {
    return (
      <main className="min-h-screen bg-[var(--app-bg)] px-4 py-8 text-[var(--text-primary)]">
        <div className="mx-auto max-w-3xl rounded-[1.5rem] border border-[var(--red-border)] bg-white p-6 shadow-[0_24px_80px_rgba(21,54,74,0.08)]">
          <h1 className="text-2xl font-semibold">No staff profile found</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
            The signed-in user does not have a matching doctor or lab profile in the current directory.
          </p>
        </div>
      </main>
    )
  }

  return (
    <>
      <main className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)]">
        <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <header className="flex flex-wrap items-center justify-between gap-3 rounded-[1.35rem] border border-[var(--border-soft)] bg-white/92 px-4 py-3 shadow-[0_18px_50px_rgba(19,56,78,0.06)]">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <QueueBadge isTester={activeUser.isTester} />
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {activeDoctor.displayName}
              </span>
              <span className="text-sm text-[var(--text-secondary)]">
                {activeDoctor.specialties.join(' • ')}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="min-h-12 rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
                onClick={() => setIsNotificationsOpen(true)}
                type="button"
              >
                Inbox {unreadNotificationCount > 0 ? `(${unreadNotificationCount})` : ''}
              </button>
              <button
                className="min-h-12 rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
                onClick={() => {
                  void logout();
                }}
                type="button"
              >
                Sign out
              </button>
            </div>
          </header>

          <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [activeUser.isTester ? 'Lab queue' : 'Doctor queue', String(queueItems.length)],
              ['Current', currentItem ? currentItem.patientName : 'None'],
              ['Unread', String(unreadNotificationCount)],
              ['Selected next', selectedPatient ? getPatientNextDestinationLabel(selectedPatient) : 'None'],
            ].map(([label, value]) => (
              <article
                key={label}
                className="rounded-[1rem] border border-[var(--border-soft)] bg-white px-3 py-3 shadow-[0_12px_32px_rgba(19,56,78,0.04)]"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  {label}
                </p>
                <p className="mt-1.5 text-xl font-semibold text-[var(--text-primary)] break-words">{value}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
            <section className="rounded-[1.2rem] border border-[var(--border-soft)] bg-white p-3 shadow-[0_16px_36px_rgba(19,56,78,0.05)]">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border-soft)] pb-3">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  {activeUser.isTester ? 'My lab queue' : 'My doctor queue'}
                </h2>
                {isLoading ? <span className="text-xs text-[var(--text-muted)]">Loading...</span> : null}
              </div>

              {loadError ? (
                <div className="mt-3 rounded-[1rem] border border-[var(--red-border)] bg-[var(--red-soft)] p-4">
                  <p className="text-sm font-semibold text-[var(--red-text)]">{loadError}</p>
                  <button
                    className="mt-3 min-h-12 rounded-full border border-[var(--border-soft)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
                    onClick={reloadHospitalState}
                    type="button"
                  >
                    Retry
                  </button>
                </div>
              ) : queueItems.length === 0 ? (
                <div className="mt-3 rounded-[1rem] bg-[var(--surface-soft)] px-4 py-10 text-center text-sm text-[var(--text-secondary)]">
                  No queue items.
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {currentItem ? (
                    <article className="rounded-[1rem] border border-[var(--blue-border)] bg-[var(--blue-soft)] p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--blue-text)]">
                        Current
                      </p>
                      <button
                        className="mt-2 w-full rounded-[0.95rem] bg-white px-3 py-3 text-left transition hover:bg-[var(--surface-soft)]"
                        onClick={() => setSelectedQueueItemId(currentItem.id)}
                        type="button"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <TriageBadge triageState={currentItem.code} />
                          <span className="text-xs text-[var(--text-muted)]">{currentItem.specialty}</span>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                          {currentItem.patientName}
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">{currentItem.title}</p>
                      </button>
                    </article>
                  ) : null}

                  {pendingItems.map((item, index) => (
                    <button
                      key={item.id}
                      className={`w-full rounded-[1rem] border px-3 py-3 text-left transition ${
                        item.id === selectedItem?.id
                          ? 'border-[var(--teal-border)] bg-[var(--teal-soft)]'
                          : 'border-[var(--border-soft)] bg-[var(--surface-soft)] hover:bg-white'
                      }`}
                      onClick={() => setSelectedQueueItemId(item.id)}
                      type="button"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-[var(--border-soft)] bg-white px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">
                          {index + 1}
                        </span>
                        <TriageBadge triageState={item.code} />
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            item.itemKind === 'lab_item'
                              ? 'border border-[var(--purple-border)] bg-[var(--purple-soft)] text-[var(--purple-text)]'
                              : 'border border-[var(--teal-border)] bg-white text-[var(--teal-strong)]'
                          }`}
                        >
                          {item.itemKind === 'lab_item' ? 'Lab' : 'Doctor'}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{item.patientName}</p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">{item.title}</p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">{item.specialty}</p>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-[1.2rem] border border-[var(--border-soft)] bg-white p-4 shadow-[0_16px_36px_rgba(19,56,78,0.05)]">
              {!selectedPatient || !selectedItem ? (
                <div className="rounded-[1rem] bg-[var(--surface-soft)] px-4 py-10 text-center text-sm text-[var(--text-secondary)]">
                  Select a queue item.
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <TriageBadge triageState={getPatientBoardCode(selectedPatient)} />
                    {patientStatus ? (
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles(patientStatus)}`}>
                        {statusLabel(patientStatus)}
                      </span>
                    ) : null}
                    <span className="rounded-full border border-[var(--border-soft)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                      {selectedPatient.id}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                        {selectedPatient.name}
                      </h2>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        {formatDateTime(selectedPatient.admittedAt)}
                      </p>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        Next: {getPatientNextDestinationLabel(selectedPatient)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!activeUser.isTester && selectedDoctorVisit ? (
                        <>
                          {selectedDoctorVisit.status !== 'with_staff' ? (
                            <button
                              className="min-h-12 rounded-full border border-[var(--teal-strong)] bg-[var(--teal)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--teal-strong)] disabled:opacity-60"
                              disabled={busyKey !== null}
                              onClick={() =>
                                void runMutation(
                                  'start-visit',
                                  () =>
                                    startDoctorVisit(
                                      patients,
                                      doctors,
                                      notifications,
                                      selectedPatient.id,
                                      selectedDoctorVisit.id,
                                      actor,
                                    ),
                                  (result) =>
                                    'patient' in result
                                      ? `Now seeing ${result.patient.name}.`
                                      : 'Visit started.',
                                )
                              }
                              type="button"
                            >
                              I’m with this patient
                            </button>
                          ) : null}
                          <button
                            className="min-h-12 rounded-full border border-[var(--amber-border)] bg-[var(--amber-soft)] px-4 py-2 text-sm font-semibold text-[var(--amber-text)] transition hover:bg-white disabled:opacity-60"
                            disabled={busyKey !== null}
                            onClick={() =>
                              void runMutation(
                                'visit-not-here',
                                () =>
                                  markDoctorVisitNotHere(
                                    patients,
                                    doctors,
                                    notifications,
                                    selectedPatient.id,
                                    selectedDoctorVisit.id,
                                    actor,
                                  ),
                                (result) =>
                                  'patient' in result
                                    ? `${result.patient.name} marked as not here.`
                                    : 'Visit updated.',
                              )
                            }
                            type="button"
                          >
                            Patient not here
                          </button>
                          <button
                            className="min-h-12 rounded-full border border-[var(--green-border)] bg-[var(--green-soft)] px-4 py-2 text-sm font-semibold text-[var(--green-text)] transition hover:bg-white disabled:opacity-60"
                            disabled={busyKey !== null}
                            onClick={() =>
                              void runMutation(
                                'complete-visit',
                                () =>
                                  completeDoctorVisit(
                                    patients,
                                    doctors,
                                    notifications,
                                    selectedPatient.id,
                                    selectedDoctorVisit.id,
                                    actor,
                                  ),
                                (result) =>
                                  'patient' in result
                                    ? `${result.patient.name} visit completed.`
                                    : 'Visit completed.',
                              )
                            }
                            type="button"
                          >
                            Mark visit done
                          </button>
                        </>
                      ) : null}

                      {activeUser.isTester &&
                      selectedLabItem &&
                      selectedLabBatch &&
                      selectedLabItem.status !== 'taken' &&
                      selectedLabItem.status !== 'results_ready' ? (
                        <>
                          {selectedLabItem.status !== 'with_staff' ? (
                            <button
                              className="min-h-12 rounded-full border border-[var(--teal-strong)] bg-[var(--teal)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--teal-strong)] disabled:opacity-60"
                              disabled={busyKey !== null}
                              onClick={() =>
                                void runMutation(
                                  'start-lab',
                                  () =>
                                    startLabItem(
                                      patients,
                                      doctors,
                                      notifications,
                                      selectedPatient.id,
                                      selectedLabBatch.id,
                                      selectedLabItem.id,
                                      actor,
                                    ),
                                  (result) =>
                                    'patient' in result
                                      ? `Now seeing ${result.patient.name} in lab.`
                                      : 'Lab item started.',
                                )
                              }
                              type="button"
                            >
                              Patient is here
                            </button>
                          ) : null}
                          <button
                            className="min-h-12 rounded-full border border-[var(--amber-border)] bg-[var(--amber-soft)] px-4 py-2 text-sm font-semibold text-[var(--amber-text)] transition hover:bg-white disabled:opacity-60"
                            disabled={busyKey !== null}
                            onClick={() =>
                              void runMutation(
                                'lab-not-here',
                                () =>
                                  markLabItemNotHere(
                                    patients,
                                    doctors,
                                    notifications,
                                    selectedPatient.id,
                                    selectedLabBatch.id,
                                    selectedLabItem.id,
                                    actor,
                                  ),
                                (result) =>
                                  'patient' in result
                                    ? `${result.patient.name} marked as not here.`
                                    : 'Lab item updated.',
                              )
                            }
                            type="button"
                          >
                            Patient not here
                          </button>
                          <button
                            className="min-h-12 rounded-full border border-[var(--green-border)] bg-[var(--green-soft)] px-4 py-2 text-sm font-semibold text-[var(--green-text)] transition hover:bg-white disabled:opacity-60"
                            disabled={busyKey !== null}
                            onClick={() =>
                              void runMutation(
                                'lab-taken',
                                () =>
                                  markLabItemTaken(
                                    patients,
                                    doctors,
                                    notifications,
                                    selectedPatient.id,
                                    selectedLabBatch.id,
                                    selectedLabItem.id,
                                    actor,
                                  ),
                                (result) =>
                                  'patient' in result
                                    ? `${result.patient.name} test marked as taken.`
                                    : 'Lab item updated.',
                              )
                            }
                            type="button"
                          >
                            Test taken
                          </button>
                        </>
                      ) : null}

                      {activeUser.isTester && selectedLabItemAwaitingResults && selectedLabBatch ? (
                        <button
                          className="min-h-12 rounded-full border border-[var(--teal-strong)] bg-[var(--teal)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--teal-strong)] disabled:opacity-60"
                          disabled={busyKey !== null}
                          onClick={() =>
                            void runMutation(
                              'results-ready',
                              () =>
                                markLabItemResultsReady(
                                  patients,
                                  doctors,
                                  notifications,
                                  selectedPatient.id,
                                  selectedLabBatch.id,
                                  selectedLabItemAwaitingResults.id,
                                  actor,
                                ),
                              (result) =>
                                'patient' in result
                                  ? `${result.patient.name} test marked as results ready.`
                                  : 'Result updated.',
                            )
                          }
                          type="button"
                        >
                          Results ready
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <section className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Add note</p>
                      <textarea
                        className="mt-3 min-h-24 w-full rounded-[1rem] border border-[var(--border-soft)] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--teal-strong)]"
                        onChange={(event) => setNoteText(event.target.value)}
                        placeholder="Short note"
                        value={noteText}
                      />
                      <button
                        className="mt-3 min-h-12 rounded-[1rem] border border-[var(--teal-strong)] bg-[var(--teal)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--teal-strong)] disabled:opacity-60"
                        disabled={busyKey !== null || noteText.trim().length === 0}
                        onClick={() =>
                          void runMutation(
                            'add-note',
                            () => addPatientNote(patients, doctors, notifications, selectedPatient.id, noteText, actor),
                            (result) =>
                              'patient' in result ? `Note saved for ${result.patient.name}.` : 'Note saved.',
                          ).then(() => setNoteText(''))
                        }
                        type="button"
                      >
                        Save note
                      </button>
                    </section>

                    {!activeUser.isTester ? (
                      <section className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-[var(--text-primary)]">Add next steps</p>
                            <p className="mt-1 text-sm text-[var(--text-secondary)]">
                              Search specialties and lab items in one place.
                            </p>
                          </div>
                          <TriageBadge triageState={getPatientBoardCode(selectedPatient)} />
                        </div>
                        <div className="mt-4 space-y-4">
                          <TypeaheadInput
                            label="Search destinations"
                            onChange={setDraftLabel}
                            onSelect={setDraftLabel}
                            options={unifiedOptions}
                            placeholder="Search cardiology or blood test"
                            value={draftLabel}
                          />
                          <div>
                            <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Assignment code</p>
                            <CodeSelector onChange={setDraftCode} value={draftCode} />
                          </div>
                          <button
                            className="min-h-12 rounded-[1rem] border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-white disabled:opacity-60"
                            disabled={busyKey !== null || draftLabel.trim().length === 0}
                            onClick={addDraft}
                            type="button"
                          >
                            Add step
                          </button>
                          <DraftList
                            drafts={drafts}
                            onRemove={(draftId) =>
                              setDrafts((current) => current.filter((candidate) => candidate.id !== draftId))
                            }
                          />
                          <textarea
                            className="min-h-20 w-full rounded-[1rem] border border-[var(--border-soft)] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--teal-strong)]"
                            onChange={(event) => setLabNote(event.target.value)}
                            placeholder="Optional note for lab work in this batch"
                            value={labNote}
                          />
                          {sourceVisit ? (
                            <p className="text-xs text-[var(--text-muted)]">
                              Using {sourceVisit.specialty} as the source visit for any lab work in this update.
                            </p>
                          ) : (
                            <p className="text-xs text-[var(--text-muted)]">
                              Select one of your doctor visits before ordering lab work.
                            </p>
                          )}
                          <button
                            className="min-h-14 rounded-[1rem] border border-[var(--teal-strong)] bg-[var(--teal)] px-5 py-3 text-base font-semibold text-white transition hover:bg-[var(--teal-strong)] disabled:opacity-60"
                            disabled={
                              busyKey !== null ||
                              drafts.length === 0 ||
                              drafts.some((draft) => draft.destinationKind === 'lab') &&
                                sourceVisit === null
                            }
                            onClick={() =>
                              void runMutation(
                                'save-assignments',
                                () =>
                                  addAssignments(
                                    patients,
                                    doctors,
                                    notifications,
                                    selectedPatient.id,
                                    {
                                      assignments: drafts,
                                      note: labNote,
                                      sourceVisitId: sourceVisit?.id ?? null,
                                    },
                                    actor,
                                  ),
                                (result) =>
                                  'patient' in result ? `Agenda updated for ${result.patient.name}.` : 'Agenda updated.',
                              ).then(() => {
                                setDrafts([])
                                setDraftLabel('')
                                setLabNote('')
                              })
                            }
                            type="button"
                          >
                            Save next steps
                          </button>
                        </div>
                      </section>
                    ) : (
                      <section className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Lab workflow</p>
                        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                          Tester users can guide the patient through queued lab items, then mark each completed test as results ready. When the last result in a batch is ready, the ordering doctor is added back to the agenda automatically.
                        </p>
                        {selectedWaitingResultsBatch ? (
                          <div className="mt-4 rounded-[1rem] border border-[var(--teal-border)] bg-white p-4">
                            <p className="text-sm font-semibold text-[var(--text-primary)]">
                              Results progress for this batch
                            </p>
                            <p className="mt-1 text-sm text-[var(--text-secondary)]">
                              {selectedReadyResultCount} of {selectedWaitingResultsBatch.items.length} tests are ready.
                            </p>
                            <p className="mt-1 text-sm text-[var(--text-secondary)]">
                              Pending results: {selectedPendingResultCount}
                            </p>
                            <p className="mt-1 text-sm text-[var(--text-secondary)]">
                              Return target: {selectedWaitingResultsBatch.returnSpecialty}
                            </p>
                          </div>
                        ) : null}
                      </section>
                    )}
                  </div>

                  <section className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Patient agenda</p>
                      <span className="text-xs text-[var(--text-muted)]">
                        Next: {getPatientNextDestinationLabel(selectedPatient)}
                      </span>
                    </div>
                    <PatientAgendaTimeline doctors={doctors} patient={selectedPatient} />
                  </section>

                  <section className="space-y-3">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Notes</p>
                    {selectedPatient.notes.length === 0 ? (
                      <div className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
                        No notes.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedPatient.notes.map((note) => (
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
              )}
            </section>
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
        </div>
      </main>

      <NotificationsDialog
        isSubmitting={busyKey === 'notification'}
        notifications={doctorNotifications}
        onClose={() => {
          if (!busyKey) {
            setIsNotificationsOpen(false)
          }
        }}
        onMarkRead={(notificationId) =>
          runMutation('notification', () =>
            markNotificationRead(patients, doctors, notifications, notificationId),
          )
        }
        open={isNotificationsOpen}
      />
    </>
  )
}
