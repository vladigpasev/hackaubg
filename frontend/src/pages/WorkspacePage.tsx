import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/useAuth'
import { TypeaheadInput } from '../features/receptionist/components/TypeaheadInput'
import { TriageBadge } from '../features/receptionist/components/TriageBadge'
import { useHospitalState } from '../features/receptionist/hooks/useHospitalState'
import {
  addDoctorTask,
  addPatientNote,
  buildSpecialtyCatalog,
  completeDoctorTask,
  createTestRequest,
  getTestCatalog,
  prefetchPatientDetails,
  getUnreadNotificationCount,
  getVisibleNotifications,
  markDoctorTaskNotHere,
  markNotificationRead,
  markTestItemDone,
  startDoctorTask,
} from '../features/receptionist/services/mockPatientApi'
import type {
  HospitalMutationResult,
  HospitalSnapshot,
  PatientDoctorTask,
  PatientMutationActor,
  QueueDraftItem,
  WorkspaceNotification,
} from '../features/receptionist/types/patient'
import {
  getDoctorCurrentItem,
  getDoctorLabelById,
  getDoctorQueueItems,
  getDoctorTasks,
  getPatientDisplayStatus,
  getTestRequests,
  getTriagePriority,
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
    case 'with_doctor':
      return 'border-[var(--blue-border)] bg-[var(--blue-soft)] text-[var(--blue-text)]'
    case 'tests_pending':
      return 'border-[var(--purple-border)] bg-[var(--purple-soft)] text-[var(--purple-text)]'
    case 'tests_ready':
      return 'border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber-text)]'
    case 'done':
      return 'border-[var(--green-border)] bg-[var(--green-soft)] text-[var(--green-text)]'
    case 'checked_out':
      return 'border-[var(--border-soft)] bg-[var(--surface-soft)] text-[var(--text-secondary)]'
    case 'waiting':
      return 'border-[var(--teal-border)] bg-[var(--teal-soft)] text-[var(--teal-strong)]'
  }
}

function statusLabel(status: ReturnType<typeof getPatientDisplayStatus>) {
  switch (status) {
    case 'with_doctor':
      return 'With doctor'
    case 'tests_pending':
      return 'Tests running'
    case 'tests_ready':
      return 'Tests ready'
    case 'done':
      return 'Done'
    case 'checked_out':
      return 'Checked out'
    case 'waiting':
      return 'Waiting'
  }
}

function taskStatusLabel(status: PatientDoctorTask['status']) {
  switch (status) {
    case 'with_doctor':
      return 'With doctor'
    case 'queued':
      return 'Queued'
    case 'not_here':
      return 'Not here'
    case 'done':
      return 'Done'
  }
}

function sortTasksForDisplay(tasks: PatientDoctorTask[]) {
  return [...tasks].sort((left, right) => {
    if (left.status === 'done' || right.status === 'done') {
      if (left.status === right.status) {
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      }

      return left.status === 'done' ? 1 : -1
    }

    const priorityDelta = getTriagePriority(left.triageState) - getTriagePriority(right.triageState)

    if (priorityDelta !== 0) {
      return priorityDelta
    }

    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  })
}

function Overlay({
  children,
  onClose,
  open,
  title,
}: {
  children: ReactNode
  onClose: () => void
  open: boolean
  title: string
}) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,35,45,0.46)] p-3 sm:p-5">
      <section
        aria-label={title}
        aria-modal="true"
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-[1.4rem] border border-[var(--border-soft)] bg-white p-4 shadow-[0_30px_80px_rgba(12,35,49,0.28)]"
        role="dialog"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            className="rounded-full border border-[var(--border-soft)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-secondary)]"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
        {children}
      </section>
    </div>
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
    <Overlay onClose={onClose} open={open} title="Doctor inbox">
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
                    className="rounded-full border border-[var(--border-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-white disabled:opacity-60"
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
    </Overlay>
  )
}

export function WorkspacePage() {
  const { logout, user } = useAuth()
  const activeUser = user!
  const {
    doctors,
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
  const [draftKind, setDraftKind] = useState<'specialty' | 'test'>('specialty')
  const [draftLabel, setDraftLabel] = useState('')
  const [queueDrafts, setQueueDrafts] = useState<QueueDraftItem[]>([])
  const [testNote, setTestNote] = useState('')

  const activeDoctor = doctors.find((doctor) => doctor.username === activeUser.username) ?? null
  const queueItems = useMemo(
    () => (activeDoctor ? getDoctorQueueItems(patients, activeDoctor.id) : []),
    [activeDoctor, patients],
  )
  const currentItem = getDoctorCurrentItem(queueItems)
  const pendingItems = queueItems.filter((item) => item.id !== currentItem?.id)
  const selectedItem =
    queueItems.find((item) => item.id === selectedQueueItemId) ?? currentItem ?? pendingItems[0] ?? null
  const selectedPatient = patients.find((patient) => patient.id === selectedItem?.patientId) ?? null
  const selectedDoctorTask =
    selectedItem?.kind === 'doctor_task' && selectedPatient
      ? getDoctorTasks(selectedPatient).find((task) => task.id === selectedItem.taskId) ?? null
      : null
  const selectedTestRequest =
    selectedItem?.kind === 'test_item' && selectedPatient
      ? getTestRequests(selectedPatient).find((request) => request.id === selectedItem.testRequestId) ?? null
      : null
  const selectedTestItem =
    selectedItem?.kind === 'test_item' && selectedTestRequest
      ? selectedTestRequest.items.find((item) => item.id === selectedItem.testItemId) ?? null
      : null
  const doctorNotifications =
    activeDoctor ? getVisibleNotifications(notifications, 'doctor', activeDoctor.id) : []
  const unreadNotificationCount =
    activeDoctor ? getUnreadNotificationCount(notifications, 'doctor', activeDoctor.id) : 0
  const specialtyOptions = useMemo(() => buildSpecialtyCatalog(doctors), [doctors])
  const testOptions = useMemo(() => getTestCatalog(), [])

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
    if (!selectedPatient?.id) {
      return
    }

    setQueueDrafts([])
    setDraftLabel('')
    setDraftKind('specialty')
    setTestNote('')
  }, [selectedPatient?.id])

  useEffect(() => {
    setNoteText('')
  }, [selectedPatient?.id])

  const actor: PatientMutationActor = {
    doctorId: activeDoctor?.id ?? null,
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

  const patientStatus = selectedPatient ? getPatientDisplayStatus(selectedPatient) : null
  const patientDoctorTasks = selectedPatient ? sortTasksForDisplay(getDoctorTasks(selectedPatient)) : []
  const patientTestRequests = selectedPatient ? getTestRequests(selectedPatient) : []
  const sourceDoctorTask =
    selectedDoctorTask ??
    patientDoctorTasks.find(
      (task) => task.assignedDoctorId === actor.doctorId && task.status !== 'done',
    ) ??
    null
  const isFirstPendingDoctorTask =
    selectedItem?.kind === 'doctor_task' && pendingItems[0]?.id === selectedItem.id
  const selectedDraftOptions = draftKind === 'specialty' ? specialtyOptions : testOptions
  const canAddDraft =
    selectedPatient !== null &&
    draftLabel.trim().length > 0 &&
    !queueDrafts.some(
      (draft) =>
        draft.kind === draftKind &&
        draft.label.trim().toLowerCase() === draftLabel.trim().toLowerCase(),
    )

  async function submitQueueDrafts() {
    if (!selectedPatient) {
      throw new Error('Select a patient first.')
    }

    if (queueDrafts.length === 0) {
      throw new Error('Add at least one queue item.')
    }

    let latestResult: HospitalMutationResult | HospitalSnapshot | null = null
    const specialtyDrafts = queueDrafts.filter((draft) => draft.kind === 'specialty')
    const testDrafts = queueDrafts.filter((draft) => draft.kind === 'test')

    for (const draft of specialtyDrafts) {
      latestResult = await addDoctorTask(
        patients,
        doctors,
        notifications,
        selectedPatient.id,
        { specialty: draft.label },
        actor,
      )
    }

    if (testDrafts.length > 0) {
      const latestPatient =
        latestResult && 'patient' in latestResult ? latestResult.patient : selectedPatient
      const latestSourceDoctorTask =
        sourceDoctorTask ??
        getDoctorTasks(latestPatient).find(
          (task) => task.assignedDoctorId === actor.doctorId && task.status !== 'done',
        ) ??
        null

      if (!latestSourceDoctorTask) {
        throw new Error('Select one of your assigned queue items before ordering tests.')
      }

      latestResult = await createTestRequest(
        patients,
        doctors,
        notifications,
        selectedPatient.id,
        latestSourceDoctorTask.id,
        {
          note: testNote,
          tests: testDrafts.map((draft) => draft.label),
        },
        actor,
      )
    }

    if (!latestResult) {
      throw new Error('No queue updates were submitted.')
    }

    return latestResult
  }

  return (
    <>
      <main className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)]">
        <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <header className="flex flex-wrap items-center justify-between gap-3 rounded-[1.35rem] border border-[var(--border-soft)] bg-white/92 px-4 py-3 shadow-[0_18px_50px_rgba(19,56,78,0.06)]">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <span className="rounded-full border border-[var(--teal-border)] bg-[var(--teal-soft)] px-3 py-1.5 text-xs font-semibold tracking-[0.16em] text-[var(--teal-strong)] uppercase">
                Doctor
              </span>
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {activeDoctor?.displayName ?? activeUser.username}
              </span>
              {activeDoctor ? (
                <span className="text-sm text-[var(--text-secondary)]">
                  {activeDoctor.specialties.join(' • ')}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="rounded-full border border-[var(--border-soft)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
                onClick={() => setIsNotificationsOpen(true)}
                type="button"
              >
                Inbox {unreadNotificationCount > 0 ? `(${unreadNotificationCount})` : ''}
              </button>
              <button
                className="rounded-full border border-[var(--border-soft)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
                onClick={() => {
                  void logout()
                }}
                type="button"
              >
                Sign out
              </button>
            </div>
          </header>

          <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Queue', String(queueItems.length)],
              ['Current', currentItem ? currentItem.patientName : 'None'],
              ['Test work', String(queueItems.filter((item) => item.kind === 'test_item').length)],
              ['Unread', String(unreadNotificationCount)],
            ].map(([label, value]) => (
              <article
                key={label}
                className="rounded-[1rem] border border-[var(--border-soft)] bg-white px-3 py-3 shadow-[0_12px_32px_rgba(19,56,78,0.04)]"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  {label}
                </p>
                <p className="mt-1.5 text-xl font-semibold text-[var(--text-primary)]">{value}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
            <section className="rounded-[1.2rem] border border-[var(--border-soft)] bg-white p-3 shadow-[0_16px_36px_rgba(19,56,78,0.05)]">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border-soft)] pb-3">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">My queue</h2>
                {isLoading ? <span className="text-xs text-[var(--text-muted)]">Loading...</span> : null}
              </div>

              {loadError ? (
                <div className="mt-3 rounded-[1rem] border border-[var(--red-border)] bg-[var(--red-soft)] p-4">
                  <p className="text-sm font-semibold text-[var(--red-text)]">{loadError}</p>
                  <button
                    className="mt-3 rounded-full border border-[var(--border-soft)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
                    onClick={reloadHospitalState}
                    type="button"
                  >
                    Retry
                  </button>
                </div>
              ) : queueItems.length === 0 ? (
                <div className="mt-3 rounded-[1rem] bg-[var(--surface-soft)] px-4 py-10 text-center text-sm text-[var(--text-secondary)]">
                  No tasks in queue.
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
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
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
                        <TriageBadge triageState={item.triageState} />
                        {item.kind === 'test_item' ? (
                          <span className="rounded-full border border-[var(--purple-border)] bg-[var(--purple-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--purple-text)]">
                            Test
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                        {item.patientName}
                      </p>
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
                    <TriageBadge triageState={selectedPatient.triageState} />
                    {patientStatus ? (
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles(patientStatus)}`}>
                        {statusLabel(patientStatus)}
                      </span>
                    ) : null}
                    <span className="rounded-full border border-[var(--border-soft)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                      {selectedPatient.id}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                        {selectedPatient.name}
                      </h2>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        {formatDateTime(selectedPatient.admittedAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedDoctorTask ? (
                        <>
                          {selectedDoctorTask.status !== 'with_doctor' ? (
                            <button
                              className="rounded-full border border-[var(--teal-strong)] bg-[var(--teal)] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[var(--teal-strong)] disabled:opacity-60"
                              disabled={busyKey !== null}
                              onClick={() =>
                                void runMutation(
                                  'start-task',
                                  () =>
                                    startDoctorTask(
                                      patients,
                                      doctors,
                                      notifications,
                                      selectedPatient.id,
                                      selectedDoctorTask.id,
                                      actor,
                                    ),
                                (result) =>
                                  'patient' in result
                                    ? `Now seeing ${result.patient.name}.`
                                      : 'Queue item started.',
                                )
                              }
                              type="button"
                            >
                              I’m with this patient
                            </button>
                          ) : null}
                          {isFirstPendingDoctorTask && selectedDoctorTask.status !== 'with_doctor' ? (
                            <button
                              className="rounded-full border border-[var(--amber-border)] bg-[var(--amber-soft)] px-3 py-2 text-sm font-semibold text-[var(--amber-text)] transition hover:bg-white disabled:opacity-60"
                              disabled={busyKey !== null}
                              onClick={() =>
                                void runMutation(
                                  'not-here',
                                  () =>
                                    markDoctorTaskNotHere(
                                      patients,
                                      doctors,
                                      notifications,
                                      selectedPatient.id,
                                      selectedDoctorTask.id,
                                      actor,
                                    ),
                                (result) =>
                                  'patient' in result
                                      ? `${result.patient.name} moved behind the next task.`
                                      : 'Queue item updated.',
                                )
                              }
                              type="button"
                            >
                              Patient not here
                            </button>
                          ) : null}
                          <button
                            className="rounded-full border border-[var(--green-border)] bg-[var(--green-soft)] px-3 py-2 text-sm font-semibold text-[var(--green-text)] transition hover:bg-white disabled:opacity-60"
                            disabled={busyKey !== null}
                            onClick={() =>
                              void runMutation(
                                'complete-task',
                                () =>
                                  completeDoctorTask(
                                    patients,
                                    doctors,
                                    notifications,
                                    selectedPatient.id,
                                    selectedDoctorTask.id,
                                    actor,
                                  ),
                                (result) =>
                                  'patient' in result
                                    ? `${result.patient.name} queue item completed.`
                                    : 'Queue item completed.',
                              )
                            }
                            type="button"
                          >
                            Mark queue item done
                          </button>
                        </>
                      ) : null}
                      {selectedTestItem && selectedTestRequest ? (
                        <button
                          className="rounded-full border border-[var(--teal-border)] bg-[var(--teal-soft)] px-3 py-2 text-sm font-semibold text-[var(--teal-strong)] transition hover:bg-white disabled:opacity-60"
                          disabled={busyKey !== null}
                          onClick={() =>
                            void runMutation(
                              'mark-test',
                              () =>
                                markTestItemDone(
                                  patients,
                                  doctors,
                                  notifications,
                                  selectedPatient.id,
                                  selectedTestRequest.id,
                                  selectedTestItem.id,
                                  actor,
                                ),
                              (result) =>
                                'patient' in result ? `Updated tests for ${result.patient.name}.` : 'Test updated.',
                            )
                          }
                          type="button"
                        >
                          Mark test done
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <section className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-3">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Add note</p>
                      <textarea
                        className="mt-3 min-h-24 w-full rounded-[1rem] border border-[var(--border-soft)] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--teal-strong)]"
                        onChange={(event) => setNoteText(event.target.value)}
                        placeholder="Short note"
                        value={noteText}
                      />
                      <button
                        className="mt-3 rounded-full border border-[var(--teal-strong)] bg-[var(--teal)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--teal-strong)] disabled:opacity-60"
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

                    <section className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Queue composer</p>
                        <TriageBadge triageState={selectedPatient.triageState} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            draftKind === 'specialty'
                              ? 'border-[var(--teal-border)] bg-[var(--teal-soft)] text-[var(--teal-strong)]'
                              : 'border-[var(--border-soft)] bg-white text-[var(--text-secondary)]'
                          }`}
                          onClick={() => setDraftKind('specialty')}
                          type="button"
                        >
                          Specialty
                        </button>
                        <button
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            draftKind === 'test'
                              ? 'border-[var(--purple-border)] bg-[var(--purple-soft)] text-[var(--purple-text)]'
                              : 'border-[var(--border-soft)] bg-white text-[var(--text-secondary)]'
                          }`}
                          onClick={() => setDraftKind('test')}
                          type="button"
                        >
                          Test
                        </button>
                      </div>
                      <div className="mt-3">
                        <TypeaheadInput
                          label={draftKind === 'specialty' ? 'Specialty' : 'Test'}
                          onChange={setDraftLabel}
                          onSelect={setDraftLabel}
                          options={selectedDraftOptions}
                          placeholder={draftKind === 'specialty' ? 'Search specialty' : 'Search test'}
                          value={draftLabel}
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {queueDrafts.map((draft) => (
                          <span
                            key={draft.id}
                            className="inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]"
                          >
                            <TriageBadge triageState={draft.triageState} />
                            <span>{draft.kind === 'specialty' ? draft.label : `Test: ${draft.label}`}</span>
                            <button
                              className="text-[var(--text-muted)]"
                              onClick={() =>
                                setQueueDrafts((current) => current.filter((candidate) => candidate.id !== draft.id))
                              }
                              type="button"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <button
                        className="mt-3 rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-white disabled:opacity-60"
                        disabled={busyKey !== null || !canAddDraft}
                        onClick={() => {
                          if (!selectedPatient || !canAddDraft) {
                            return
                          }

                          setQueueDrafts((current) => [
                            ...current,
                            {
                              id: crypto.randomUUID(),
                              kind: draftKind,
                              label: draftLabel.trim(),
                              triageState: selectedPatient.triageState,
                            },
                          ])
                          setDraftLabel('')
                        }}
                        type="button"
                      >
                        Add to queue
                      </button>
                      <textarea
                        className="mt-3 min-h-20 w-full rounded-[1rem] border border-[var(--border-soft)] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--teal-strong)]"
                        onChange={(event) => setTestNote(event.target.value)}
                        placeholder="Optional note for any test items"
                        value={testNote}
                      />
                      {selectedTestItem ? (
                        <p className="mt-3 text-xs text-[var(--text-muted)]">
                          Current test item: {selectedTestItem.testName} • {selectedTestItem.testerSpecialty}
                        </p>
                      ) : null}
                      {sourceDoctorTask ? (
                        <p className="mt-2 text-xs text-[var(--text-muted)]">
                          Test results will return to {sourceDoctorTask.specialty}.
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-[var(--text-muted)]">
                          Tests can only be ordered while you have an assigned doctor queue item on this patient.
                        </p>
                      )}
                      <button
                        className="mt-3 rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-white disabled:opacity-60"
                        disabled={busyKey !== null || queueDrafts.length === 0}
                        onClick={() =>
                          void runMutation(
                            'queue-composer',
                            () => submitQueueDrafts(),
                            (result) =>
                              'patient' in result ? `Queue updated for ${result.patient.name}.` : 'Queue updated.',
                          ).then(() => {
                            setQueueDrafts([])
                            setDraftLabel('')
                            setDraftKind('specialty')
                            setTestNote('')
                          })
                        }
                        type="button"
                      >
                        Submit queue items
                      </button>
                    </section>
                  </div>

                  <section className="space-y-3">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Queue items</p>
                    <div className="space-y-2">
                      {patientDoctorTasks.map((task) => (
                        <article
                          key={task.id}
                          className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <TriageBadge triageState={task.triageState} />
                            <span className="rounded-full border border-[var(--border-soft)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                              {taskStatusLabel(task.status)}
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                            {task.specialty}
                          </p>
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            {getDoctorLabelById(doctors, task.assignedDoctorId)}
                          </p>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="space-y-3">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Tests</p>
                    {patientTestRequests.length === 0 ? (
                      <div className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
                        No tests.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {patientTestRequests.map((request) => (
                          <article
                            key={request.id}
                            className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-3"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <TriageBadge triageState={request.triageState} />
                              <span className="rounded-full border border-[var(--border-soft)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                                {request.status === 'pending'
                                  ? 'Pending'
                                  : request.status === 'ready_for_return'
                                    ? 'Ready for nurse return'
                                    : 'Returned'}
                              </span>
                            </div>
                            <div className="mt-3 space-y-2">
                              {request.items.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-[0.9rem] border border-[var(--border-soft)] bg-white px-3 py-2"
                                >
                                  <div>
                                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                                      {item.testName}
                                    </p>
                                    <p className="text-xs text-[var(--text-muted)]">
                                      {item.testerSpecialty} • {getDoctorLabelById(doctors, item.assignedDoctorId)}
                                    </p>
                                  </div>
                                  {item.status === 'pending' ? (
                                    <button
                                      className="rounded-full border border-[var(--teal-border)] bg-[var(--teal-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--teal-strong)] transition hover:bg-white disabled:opacity-60"
                                      disabled={busyKey !== null}
                                      onClick={() =>
                                        void runMutation(
                                          'mark-test-inline',
                                          () =>
                                            markTestItemDone(
                                              patients,
                                              doctors,
                                              notifications,
                                              selectedPatient.id,
                                              request.id,
                                              item.id,
                                              actor,
                                            ),
                                          (result) =>
                                            'patient' in result
                                              ? `Updated tests for ${result.patient.name}.`
                                              : 'Test updated.',
                                        )
                                      }
                                      type="button"
                                    >
                                      Mark done
                                    </button>
                                  ) : (
                                    <span className="text-xs text-[var(--green-text)]">
                                      Done{item.completedByLabel ? ` by ${item.completedByLabel}` : ''}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
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
