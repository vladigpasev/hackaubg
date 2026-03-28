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
  getUnreadNotificationCount,
  getVisibleNotifications,
  markDoctorTaskNotHere,
  markNotificationRead,
  markTestItemDone,
  startDoctorTask,
  updateDoctorTask,
} from '../features/receptionist/services/mockPatientApi'
import type {
  HospitalMutationResult,
  HospitalSnapshot,
  PatientDoctorTask,
  PatientMutationActor,
  TriageCode,
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

    const priorityDelta = getTriagePriority(left.code) - getTriagePriority(right.code)

    if (priorityDelta !== 0) {
      return priorityDelta
    }

    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  })
}

function CodeSelector({
  disabled,
  onChange,
  value,
}: {
  disabled?: boolean
  onChange: (value: TriageCode) => void
  value: TriageCode
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(['unknown', 'green', 'yellow'] as const).map((code) => {
        const isActive = value === code
        const toneClass =
          code === 'green'
            ? isActive
              ? 'border-[var(--green-border)] bg-[var(--green-soft)] text-[var(--green-text)]'
              : 'border-[var(--border-soft)] bg-white text-[var(--text-secondary)]'
            : code === 'yellow'
              ? isActive
                ? 'border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber-text)]'
                : 'border-[var(--border-soft)] bg-white text-[var(--text-secondary)]'
              : isActive
                ? 'border-[var(--teal-border)] bg-[var(--teal-soft)] text-[var(--teal-strong)]'
                : 'border-[var(--border-soft)] bg-white text-[var(--text-secondary)]'

        return (
          <button
            key={code}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${toneClass}`}
            disabled={disabled}
            onClick={() => onChange(code)}
            type="button"
          >
            {code}
          </button>
        )
      })}
    </div>
  )
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
  const [newTaskCode, setNewTaskCode] = useState<TriageCode>('green')
  const [newTaskSpecialty, setNewTaskSpecialty] = useState('')
  const [noteText, setNoteText] = useState('')
  const [queuedTests, setQueuedTests] = useState<string[]>([])
  const [selectedTestName, setSelectedTestName] = useState('')
  const [taskCode, setTaskCode] = useState<TriageCode>('green')
  const [taskSpecialty, setTaskSpecialty] = useState('')
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
    if (!selectedDoctorTask) {
      return
    }

    setTaskCode(selectedDoctorTask.code)
    setTaskSpecialty(selectedDoctorTask.specialty)
    setQueuedTests([])
    setSelectedTestName('')
    setTestNote('')
  }, [selectedDoctorTask])

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
  const isFirstPendingDoctorTask =
    selectedItem?.kind === 'doctor_task' && pendingItems[0]?.id === selectedItem.id

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
                        <TriageBadge triageCode={item.code} />
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
                  Select a task from the queue.
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedDoctorTask ? <TriageBadge triageCode={selectedDoctorTask.code} /> : null}
                    {selectedItem.kind === 'test_item' && selectedTestRequest ? (
                      <TriageBadge triageCode={selectedTestRequest.code} />
                    ) : null}
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
                                      : 'Task started.',
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
                                      : 'Task updated.',
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
                                    ? `${result.patient.name} task completed.`
                                    : 'Task completed.',
                              )
                            }
                            type="button"
                          >
                            Mark task done
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
                    {selectedDoctorTask ? (
                      <section className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-3">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Selected task</p>
                        <div className="mt-3">
                          <TypeaheadInput
                            label="Specialty"
                            onChange={setTaskSpecialty}
                            onSelect={setTaskSpecialty}
                            options={specialtyOptions}
                            placeholder="Search specialty"
                            value={taskSpecialty}
                          />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                          <CodeSelector onChange={setTaskCode} value={taskCode} />
                          <span className="text-xs text-[var(--text-muted)]">
                            {getDoctorLabelById(doctors, selectedDoctorTask.assignedDoctorId)}
                          </span>
                        </div>
                        <button
                          className="mt-3 rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-white disabled:opacity-60"
                          disabled={
                            busyKey !== null ||
                            taskSpecialty.trim().length === 0 ||
                            (taskSpecialty === selectedDoctorTask.specialty && taskCode === selectedDoctorTask.code)
                          }
                          onClick={() =>
                            void runMutation(
                              'update-task',
                              () =>
                                updateDoctorTask(
                                  patients,
                                  doctors,
                                  notifications,
                                  selectedPatient.id,
                                  selectedDoctorTask.id,
                                  { code: taskCode, specialty: taskSpecialty },
                                ),
                              (result) =>
                                'patient' in result ? `${result.patient.name} task updated.` : 'Task updated.',
                            )
                          }
                          type="button"
                        >
                          Update task
                        </button>
                      </section>
                    ) : (
                      <section className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-3">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Selected test</p>
                        <p className="mt-2 text-sm text-[var(--text-secondary)]">
                          {selectedTestItem?.testName}
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          {selectedTestItem?.testerSpecialty} • {getDoctorLabelById(doctors, selectedTestItem?.assignedDoctorId ?? null)}
                        </p>
                      </section>
                    )}

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
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <section className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Add specialty</p>
                        <CodeSelector onChange={setNewTaskCode} value={newTaskCode} />
                      </div>
                      <div className="mt-3">
                        <TypeaheadInput
                          label="Specialty"
                          onChange={setNewTaskSpecialty}
                          onSelect={setNewTaskSpecialty}
                          options={specialtyOptions}
                          placeholder="Search specialty"
                          value={newTaskSpecialty}
                        />
                      </div>
                      <button
                        className="mt-3 rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-white disabled:opacity-60"
                        disabled={busyKey !== null || newTaskSpecialty.trim().length === 0}
                        onClick={() =>
                          void runMutation(
                            'add-specialty',
                            () =>
                              addDoctorTask(
                                patients,
                                doctors,
                                notifications,
                                selectedPatient.id,
                                { code: newTaskCode, specialty: newTaskSpecialty },
                                actor,
                              ),
                            (result) =>
                              'patient' in result
                                ? `${result.patient.name} added to another doctor queue.`
                                : 'Task added.',
                          ).then(() => {
                            setNewTaskSpecialty('')
                            setNewTaskCode('green')
                          })
                        }
                        type="button"
                      >
                        Add task
                      </button>
                    </section>

                    <section className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-3">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Order tests</p>
                      <div className="mt-3">
                        <TypeaheadInput
                          label="Test"
                          onChange={setSelectedTestName}
                          onSelect={setSelectedTestName}
                          options={testOptions}
                          placeholder="Search test"
                          value={selectedTestName}
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {queuedTests.map((testName) => (
                          <span
                            key={testName}
                            className="inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]"
                          >
                            {testName}
                            <button
                              className="text-[var(--text-muted)]"
                              onClick={() => setQueuedTests((current) => current.filter((candidate) => candidate !== testName))}
                              type="button"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className="rounded-full border border-[var(--border-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-white disabled:opacity-60"
                          disabled={
                            selectedTestName.trim().length === 0 ||
                            queuedTests.includes(selectedTestName.trim())
                          }
                          onClick={() => {
                            if (selectedTestName.trim().length === 0) {
                              return
                            }

                            setQueuedTests((current) => [...current, selectedTestName.trim()])
                            setSelectedTestName('')
                          }}
                          type="button"
                        >
                          Add test
                        </button>
                      </div>
                      <textarea
                        className="mt-3 min-h-20 w-full rounded-[1rem] border border-[var(--border-soft)] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--teal-strong)]"
                        onChange={(event) => setTestNote(event.target.value)}
                        placeholder="Optional note"
                        value={testNote}
                      />
                      <button
                        className="mt-3 rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-white disabled:opacity-60"
                        disabled={busyKey !== null || !selectedDoctorTask || queuedTests.length === 0}
                        onClick={() =>
                          void runMutation(
                            'order-tests',
                            () =>
                              createTestRequest(
                                patients,
                                doctors,
                                notifications,
                                selectedPatient.id,
                                selectedDoctorTask!.id,
                                { note: testNote, tests: queuedTests },
                                actor,
                              ),
                            (result) =>
                              'patient' in result ? `Tests ordered for ${result.patient.name}.` : 'Tests ordered.',
                          ).then(() => {
                            setQueuedTests([])
                            setSelectedTestName('')
                            setTestNote('')
                          })
                        }
                        type="button"
                      >
                        Order grouped tests
                      </button>
                    </section>
                  </div>

                  <section className="space-y-3">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Doctor tasks</p>
                    <div className="space-y-2">
                      {patientDoctorTasks.map((task) => (
                        <article
                          key={task.id}
                          className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <TriageBadge triageCode={task.code} />
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
                              <TriageBadge triageCode={request.code} />
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
