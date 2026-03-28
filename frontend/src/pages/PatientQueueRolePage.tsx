import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/useAuth'
import { TypeaheadInput } from '../features/receptionist/components/TypeaheadInput'
import { TriageBadge } from '../features/receptionist/components/TriageBadge'
import { useHospitalState } from '../features/receptionist/hooks/useHospitalState'
import {
  addDoctorTask,
  checkoutPatient,
  createPatient,
  getPatientDoctorLabel,
  getPatientOpenTaskCount,
  getPatientPendingTestCount,
  getPatientReadyReturnCount,
  getUnreadNotificationCount,
  getVisibleNotifications,
  markNotificationRead,
  markTestItemDone,
  sendPatientBackToDoctor,
  updateDoctorTask,
  updatePatientCore,
} from '../features/receptionist/services/mockPatientApi'
import type {
  CheckInPatientInput,
  DoctorTaskDraft,
  HospitalMutationResult,
  HospitalSnapshot,
  Patient,
  PatientDoctorTask,
  PatientMutationActor,
  TriageCode,
  UpdatePatientCoreInput,
  WorkspaceNotification,
} from '../features/receptionist/types/patient'
import {
  buildPatientOverviewSummary,
  canCheckoutPatient,
  getActiveDoctorTasks,
  getDoctorLabelById,
  getDoctorTasks,
  getPatientDisplayStatus,
  getPatientPriorityCode,
  getTestRequests,
  getTriagePriority,
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

interface TaskDraftRow extends DoctorTaskDraft {
  id: string
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

function buildTaskDraftRow(code: TriageCode = 'unknown', specialty = ''): TaskDraftRow {
  return {
    code,
    id: `${code}-${specialty}-${crypto.randomUUID()}`,
    specialty,
  }
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
          <div className="flex min-w-0 items-center gap-3">
            {actions}
          </div>
          <div className="flex flex-wrap items-center gap-2">{rightActions}</div>
        </header>
        {children}
      </div>
    </main>
  )
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
        className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[1.5rem] border border-[var(--border-soft)] bg-white p-4 shadow-[0_30px_80px_rgba(12,35,49,0.28)] sm:p-5"
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
  specialtyOptions: Array<{ id: string; keywords: string[]; label: string }>
}) {
  const [initialTasks, setInitialTasks] = useState<TaskDraftRow[]>(() => [buildTaskDraftRow()])
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')

  const canSubmit =
    name.trim().length >= 2 && initialTasks.every((task) => task.specialty.trim().length > 0)

  return (
    <Overlay onClose={onClose} open={open} title="New patient">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <label className="block text-sm font-medium text-[var(--text-secondary)]">
            Name
            <input
              className="mt-1.5 min-h-11 w-full rounded-[1rem] border border-[var(--border-soft)] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--teal-strong)]"
              onChange={(event) => setName(event.target.value)}
              placeholder="Patient name"
              type="text"
              value={name}
            />
          </label>
          <label className="block text-sm font-medium text-[var(--text-secondary)]">
            Phone
            <input
              className="mt-1.5 min-h-11 w-full rounded-[1rem] border border-[var(--border-soft)] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--teal-strong)]"
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="Optional"
              type="text"
              value={phoneNumber}
            />
          </label>
          <label className="block text-sm font-medium text-[var(--text-secondary)]">
            Intake note
            <textarea
              className="mt-1.5 min-h-28 w-full rounded-[1rem] border border-[var(--border-soft)] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--teal-strong)]"
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Short note"
              value={notes}
            />
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Needed specialties</p>
            <button
              className="rounded-full border border-[var(--border-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-secondary)]"
              onClick={() => setInitialTasks((current) => [...current, buildTaskDraftRow()])}
              type="button"
            >
              Add specialty
            </button>
          </div>

          {initialTasks.map((task, index) => (
            <div
              key={task.id}
              className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-3"
            >
              <TypeaheadInput
                label={`Specialty ${index + 1}`}
                onChange={(value) =>
                  setInitialTasks((current) =>
                    current.map((candidate, candidateIndex) =>
                      candidateIndex === index ? { ...candidate, specialty: value } : candidate,
                    ),
                  )
                }
                onSelect={(value) =>
                  setInitialTasks((current) =>
                    current.map((candidate, candidateIndex) =>
                      candidateIndex === index ? { ...candidate, specialty: value } : candidate,
                    ),
                  )
                }
                options={specialtyOptions}
                placeholder="Search specialty"
                value={task.specialty}
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <CodeSelector
                  onChange={(code) =>
                    setInitialTasks((current) =>
                      current.map((candidate, candidateIndex) =>
                        candidateIndex === index ? { ...candidate, code } : candidate,
                      ),
                    )
                  }
                  value={task.code}
                />
                {initialTasks.length > 1 ? (
                  <button
                    className="rounded-full border border-[var(--red-border)] px-3 py-1.5 text-xs font-semibold text-[var(--red-text)] transition hover:bg-[var(--red-soft)]"
                    onClick={() =>
                      setInitialTasks((current) => current.filter((candidate) => candidate.id !== task.id))
                    }
                    type="button"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button
          className="rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-secondary)]"
          onClick={onClose}
          type="button"
        >
          Cancel
        </button>
        <button
          className="rounded-full border border-[var(--teal-strong)] bg-[var(--teal)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--teal-strong)] disabled:opacity-60"
          disabled={isSubmitting || !canSubmit}
          onClick={() =>
            void onSubmit({
              initialTasks: initialTasks.map(({ code, specialty }) => ({ code, specialty })),
              name,
              notes,
              phoneNumber,
            })
          }
          type="button"
        >
          Register
        </button>
      </div>
    </Overlay>
  )
}

function NotificationsDialog({
  isSubmitting,
  notifications,
  onClose,
  onMarkRead,
  onSendBack,
  open,
}: {
  isSubmitting: boolean
  notifications: WorkspaceNotification[]
  onClose: () => void
  onMarkRead: (notificationId: string) => Promise<void>
  onSendBack: (notification: WorkspaceNotification) => Promise<void>
  open: boolean
}) {
  return (
    <Overlay onClose={onClose} open={open} title="Nurse inbox">
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
                <div className="flex flex-wrap gap-2">
                  {notification.action ? (
                    <button
                      className="rounded-full border border-[var(--teal-strong)] bg-[var(--teal)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--teal-strong)] disabled:opacity-60"
                      disabled={isSubmitting}
                      onClick={() => void onSendBack(notification)}
                      type="button"
                    >
                      Send back
                    </button>
                  ) : null}
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
              </div>
            </article>
          ))
        )}
      </div>
    </Overlay>
  )
}

function PatientDetailsDialog({
  canCheckoutPatients,
  doctors,
  isSubmitting,
  onAddTask,
  onCheckout,
  onClose,
  onMarkTestDone,
  onSaveCore,
  onUpdateTask,
  open,
  patient,
  specialtyOptions,
}: {
  canCheckoutPatients: boolean
  doctors: HospitalSnapshot['doctors']
  isSubmitting: boolean
  onAddTask: (values: DoctorTaskDraft) => Promise<void>
  onCheckout: () => Promise<void>
  onClose: () => void
  onMarkTestDone: (requestId: string, testItemId: string) => Promise<void>
  onSaveCore: (values: UpdatePatientCoreInput) => Promise<void>
  onUpdateTask: (taskId: string, values: { code: TriageCode; specialty: string }) => Promise<void>
  open: boolean
  patient: Patient | null
  specialtyOptions: Array<{ id: string; keywords: string[]; label: string }>
}) {
  const [coreName, setCoreName] = useState(patient?.name ?? '')
  const [coreNote, setCoreNote] = useState('')
  const [corePhone, setCorePhone] = useState(patient?.phoneNumber ?? '')
  const [newTaskCode, setNewTaskCode] = useState<TriageCode>('unknown')
  const [newTaskSpecialty, setNewTaskSpecialty] = useState('')
  const [taskForms, setTaskForms] = useState<Record<string, { code: TriageCode; specialty: string }>>(
    () =>
      patient
        ? Object.fromEntries(
            getDoctorTasks(patient).map((task) => [task.id, { code: task.code, specialty: task.specialty }]),
          )
        : {},
  )

  if (!patient) {
    return null
  }

  const displayStatus = getPatientDisplayStatus(patient)
  const doctorTasks = sortTasksForDisplay(getDoctorTasks(patient))
  const testRequests = getTestRequests(patient)

  return (
    <Overlay onClose={onClose} open={open} title={patient.name}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {getPatientPriorityCode(patient) ? <TriageBadge triageCode={getPatientPriorityCode(patient)!} /> : null}
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles(displayStatus)}`}>
            {statusLabel(displayStatus)}
          </span>
          <span className="rounded-full border border-[var(--border-soft)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
            {patient.id}
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-3">
            <label className="block text-sm font-medium text-[var(--text-secondary)]">
              Name
              <input
                className="mt-1.5 min-h-11 w-full rounded-[1rem] border border-[var(--border-soft)] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--teal-strong)]"
                onChange={(event) => setCoreName(event.target.value)}
                type="text"
                value={coreName}
              />
            </label>
            <label className="block text-sm font-medium text-[var(--text-secondary)]">
              Phone
              <input
                className="mt-1.5 min-h-11 w-full rounded-[1rem] border border-[var(--border-soft)] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--teal-strong)]"
                onChange={(event) => setCorePhone(event.target.value)}
                type="text"
                value={corePhone}
              />
            </label>
            <label className="block text-sm font-medium text-[var(--text-secondary)]">
              Add note
              <textarea
                className="mt-1.5 min-h-24 w-full rounded-[1rem] border border-[var(--border-soft)] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--teal-strong)]"
                onChange={(event) => setCoreNote(event.target.value)}
                placeholder="Optional"
                value={coreNote}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
              <span>Admitted {formatAdmittedAt(patient.admittedAt)}</span>
              <span className="text-[var(--border-soft)]">•</span>
              <span>{getPatientDoctorLabel(doctors, patient)}</span>
            </div>
            <button
              className="rounded-full border border-[var(--teal-strong)] bg-[var(--teal)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--teal-strong)] disabled:opacity-60"
              disabled={isSubmitting || coreName.trim().length < 2}
              onClick={() => void onSaveCore({ name: coreName, note: coreNote, phoneNumber: corePhone })}
              type="button"
            >
              Save patient
            </button>
          </div>

          <div className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-3">
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
              disabled={isSubmitting || newTaskSpecialty.trim().length === 0}
              onClick={() => void onAddTask({ code: newTaskCode, specialty: newTaskSpecialty })}
              type="button"
            >
              Add task
            </button>
          </div>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Doctor tasks</p>
            <span className="text-xs text-[var(--text-muted)]">{doctorTasks.length} total</span>
          </div>
          <div className="space-y-3">
            {doctorTasks.map((task) => {
              const formValues = taskForms[task.id] ?? { code: task.code, specialty: task.specialty }

              return (
                <article
                  key={task.id}
                  className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <TriageBadge triageCode={task.code} />
                    <span className="rounded-full border border-[var(--border-soft)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                      {taskStatusLabel(task.status)}
                    </span>
                    {task.type === 'return_to_doctor_task' ? (
                      <span className="rounded-full border border-[var(--blue-border)] bg-[var(--blue-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--blue-text)]">
                        Return
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                    <TypeaheadInput
                      label="Specialty"
                      onChange={(value) =>
                        setTaskForms((current) => ({
                          ...current,
                          [task.id]: { ...formValues, specialty: value },
                        }))
                      }
                      onSelect={(value) =>
                        setTaskForms((current) => ({
                          ...current,
                          [task.id]: { ...formValues, specialty: value },
                        }))
                      }
                      options={specialtyOptions}
                      placeholder="Search specialty"
                      value={formValues.specialty}
                    />
                    <div className="flex min-w-0 flex-col justify-between gap-3">
                      <CodeSelector
                        disabled={task.status === 'done'}
                        onChange={(code) =>
                          setTaskForms((current) => ({
                            ...current,
                            [task.id]: { ...formValues, code },
                          }))
                        }
                        value={formValues.code}
                      />
                      <div className="text-xs text-[var(--text-muted)]">
                        {getDoctorLabelById(doctors, task.assignedDoctorId)}
                      </div>
                    </div>
                  </div>
                  {task.status !== 'done' ? (
                    <button
                      className="mt-3 rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-white disabled:opacity-60"
                      disabled={
                        isSubmitting ||
                        formValues.specialty.trim().length === 0 ||
                        (formValues.specialty === task.specialty && formValues.code === task.code)
                      }
                      onClick={() => void onUpdateTask(task.id, formValues)}
                      type="button"
                    >
                      Update task
                    </button>
                  ) : null}
                </article>
              )
            })}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Tests</p>
            <span className="text-xs text-[var(--text-muted)]">{testRequests.length} groups</span>
          </div>
          {testRequests.length === 0 ? (
            <div className="rounded-[1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
              No tests yet.
            </div>
          ) : (
            <div className="space-y-3">
              {testRequests.map((request) => (
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
                    <span className="text-xs text-[var(--text-muted)]">
                      Ordered by {request.orderedByLabel}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {request.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-[0.9rem] border border-[var(--border-soft)] bg-white px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-semibold text-[var(--text-primary)]">{item.testName}</p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {item.testerSpecialty} • {getDoctorLabelById(doctors, item.assignedDoctorId)}
                          </p>
                        </div>
                        {item.status === 'pending' ? (
                          <button
                            className="rounded-full border border-[var(--teal-border)] bg-[var(--teal-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--teal-strong)] transition hover:bg-white disabled:opacity-60"
                            disabled={isSubmitting}
                            onClick={() => void onMarkTestDone(request.id, item.id)}
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

        {canCheckoutPatients && canCheckoutPatient(patient) ? (
          <div className="flex justify-end">
            <button
              className="rounded-full border border-[var(--green-border)] bg-[var(--green-soft)] px-4 py-2 text-sm font-semibold text-[var(--green-text)] transition hover:bg-white disabled:opacity-60"
              disabled={isSubmitting}
              onClick={() => void onCheckout()}
              type="button"
            >
              Checkout patient
            </button>
          </div>
        ) : null}
      </div>
    </Overlay>
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

  const searchableSpecialties = useMemo(
    () =>
      doctors.length > 0
        ? Array.from(
            new Map(
              doctors
                .flatMap((doctor) => doctor.specialties)
                .map((label) => [
                  label.toLowerCase(),
                  { id: `doctor-specialty-${label.toLowerCase()}`, keywords: [], label },
                ]),
            ).values(),
          )
        : [],
    [doctors],
  )
  const selectedPatient = rawPatients.find((patient) => patient.id === selectedPatientId) ?? null
  const nurseNotifications =
    activeUser.role === 'nurse'
      ? getVisibleNotifications(notifications, 'nurse')
      : []
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

  const actor: PatientMutationActor = {
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
                className="rounded-full border border-[var(--border-soft)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
                onClick={() => setIsNotificationsOpen(true)}
                type="button"
              >
                Inbox {unreadNotificationCount > 0 ? `(${unreadNotificationCount})` : ''}
              </button>
            ) : null}
            {canRegisterPatients ? (
              <button
                className="rounded-full border border-[var(--teal-strong)] bg-[var(--teal)] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[var(--teal-strong)]"
                onClick={() => setIsRegisterOpen(true)}
                type="button"
              >
                New patient
              </button>
            ) : null}
            <button
              className="rounded-full border border-[var(--border-soft)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
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
            ['Open tasks', String(summary.openDoctorTaskCount)],
            ['Pending tests', String(summary.pendingTestCount)],
            ['Ready returns', String(summary.readyReturnCount)],
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
                className="mt-3 rounded-full border border-[var(--border-soft)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]"
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
                const activeTasks = sortTasksForDisplay(getActiveDoctorTasks(patient))
                const leadTask = activeTasks[0] ?? null
                const primaryCode = getPatientPriorityCode(patient)

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
                          {primaryCode ? <TriageBadge triageCode={primaryCode} /> : null}
                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles(displayStatus)}`}
                          >
                            {statusLabel(displayStatus)}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]">
                          <span>{formatAdmittedAt(patient.admittedAt)}</span>
                          <span>{leadTask ? leadTask.specialty : 'No active task'}</span>
                          <span>{getPatientDoctorLabel(doctors, patient)}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
                          <span>{getPatientOpenTaskCount(patient)} open tasks</span>
                          <span>{getPatientPendingTestCount(patient)} pending tests</span>
                          <span>{getPatientReadyReturnCount(patient)} ready returns</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="rounded-full border border-[var(--border-soft)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-white"
                          onClick={() => setSelectedPatientId(patient.id)}
                          type="button"
                        >
                          Open
                        </button>
                        {canCheckoutPatients && canCheckoutPatient(patient) ? (
                          <button
                            className="rounded-full border border-[var(--green-border)] bg-[var(--green-soft)] px-3 py-2 text-sm font-semibold text-[var(--green-text)] transition hover:bg-white"
                            onClick={() => {
                              setSelectedPatientId(patient.id)
                            }}
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
        specialtyOptions={searchableSpecialties}
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
        onSendBack={(notification) =>
          runMutation(
            'nurse-notification',
            () => {
              if (!notification.action) {
                throw new Error('Notification action is unavailable.')
              }

              return sendPatientBackToDoctor(
                rawPatients,
                doctors,
                notifications,
                notification.action.patientId,
                notification.action.requestId,
                {
                  role: 'nurse',
                  username: activeUser.username,
                },
              )
            },
            (result) =>
              'patient' in result ? `${result.patient.name} was returned to the ordering doctor.` : 'Patient returned.',
          )
        }
        open={isNotificationsOpen}
      />

      <PatientDetailsDialog
        canCheckoutPatients={canCheckoutPatients}
        doctors={doctors}
        isSubmitting={busyKey !== null}
        key={selectedPatient ? `${selectedPatient.id}-${selectedPatient.lastUpdatedAt}` : 'no-patient'}
        onAddTask={(values) =>
          runMutation(
            'patient-task',
            () => addDoctorTask(rawPatients, doctors, notifications, selectedPatient!.id, values, actor),
            (result) =>
              'patient' in result ? `${result.patient.name} now has an extra specialty task.` : 'Task added.',
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
        onMarkTestDone={(requestId, testItemId) =>
          runMutation(
            'test-done',
            () =>
              markTestItemDone(rawPatients, doctors, notifications, selectedPatient!.id, requestId, testItemId, actor),
            (result) =>
              'patient' in result ? `Updated tests for ${result.patient.name}.` : 'Test updated.',
          )
        }
        onSaveCore={(values) =>
          runMutation(
            'patient-core',
            () => updatePatientCore(rawPatients, doctors, notifications, selectedPatient!.id, values, actor),
            (result) =>
              'patient' in result ? `${result.patient.name} updated.` : 'Patient updated.',
          )
        }
        onUpdateTask={(taskId, values) =>
          runMutation(
            'patient-task-update',
            () => updateDoctorTask(rawPatients, doctors, notifications, selectedPatient!.id, taskId, values),
            (result) =>
              'patient' in result ? `${result.patient.name} task updated.` : 'Task updated.',
          )
        }
        open={selectedPatient !== null}
        patient={selectedPatient}
        specialtyOptions={searchableSpecialties}
      />
    </>
  )
}
