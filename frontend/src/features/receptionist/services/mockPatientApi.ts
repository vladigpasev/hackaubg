import type { AuthUser } from '../../../auth/types'
import {
  seededDoctorProfiles,
  seededNotifications,
  seededPatients,
  specialtyCatalogSeed,
  testCatalogSeed,
} from '../data/mockHospitalData'
import type {
  CatalogOption,
  CheckInPatientInput,
  CreateTestRequestInput,
  DoctorProfile,
  DoctorTaskDraft,
  HospitalMutationResult,
  HospitalSnapshot,
  Patient,
  PatientDoctorTask,
  PatientMutationActor,
  PatientTestItem,
  PatientTestRequest,
  TriageCode,
  UpdateDoctorTaskInput,
  UpdatePatientCoreInput,
  WorkspaceNotification,
} from '../types/patient'
import {
  canCheckoutPatient,
  getDoctorLabelById,
  getDoctorTasks,
  getPendingTestItems,
  getReadyReturnRequests,
  getTestRequests,
  getTriagePriority,
} from '../utils/patientQueue'

const NETWORK_DELAY_MS = 240

let patientCounter = 200
let noteCounter = 300
let taskCounter = 300
let testItemCounter = 400
let notificationCounter = 200

function delay<T>(value: T, duration = NETWORK_DELAY_MS): Promise<T> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(value), duration)
  })
}

function normalizeValue(value: string) {
  return value.trim().toLowerCase()
}

function cloneDoctor(doctor: DoctorProfile): DoctorProfile {
  return {
    ...doctor,
    specialties: [...doctor.specialties],
  }
}

function cloneNotification(notification: WorkspaceNotification): WorkspaceNotification {
  return {
    ...notification,
    action: notification.action ? { ...notification.action } : null,
  }
}

function cloneTask(task: Patient['tasks'][number]) {
  if (task.type === 'test_request') {
    return {
      ...task,
      items: task.items.map((item) => ({ ...item })),
    } satisfies PatientTestRequest
  }

  return {
    ...task,
  } satisfies PatientDoctorTask
}

function clonePatient(patient: Patient): Patient {
  return {
    ...patient,
    notes: patient.notes.map((note) => ({ ...note })),
    tasks: patient.tasks.map(cloneTask),
  }
}

function cloneSnapshot(snapshot: HospitalSnapshot): HospitalSnapshot {
  return {
    doctors: snapshot.doctors.map(cloneDoctor),
    notifications: snapshot.notifications.map(cloneNotification),
    patients: snapshot.patients.map(clonePatient),
  }
}

function buildPatientId() {
  patientCounter += 1
  return `PT-${patientCounter}`
}

function buildNoteId() {
  noteCounter += 1
  return `NOTE-${noteCounter}`
}

function buildDoctorTaskId() {
  taskCounter += 1
  return `DT-${taskCounter}`
}

function buildTestRequestId() {
  taskCounter += 1
  return `TR-${taskCounter}`
}

function buildTestItemId() {
  testItemCounter += 1
  return `TI-${testItemCounter}`
}

function buildNotificationId() {
  notificationCounter += 1
  return `NT-${notificationCounter}`
}

function ensureFilled(value: string, fieldLabel: string) {
  if (value.trim().length === 0) {
    throw new Error(`${fieldLabel} is required.`)
  }
}

function validatePatientName(name: string) {
  const trimmedName = name.trim()

  ensureFilled(trimmedName, 'Name')

  if (trimmedName.length < 2) {
    throw new Error('Name must be at least 2 characters.')
  }
}

function validatePhoneNumber(phoneNumber: string) {
  const trimmedPhoneNumber = phoneNumber.trim()

  if (trimmedPhoneNumber.length === 0) {
    return
  }

  const digitsOnly = trimmedPhoneNumber.replace(/\D/g, '')

  if (digitsOnly.length < 7 || !/^\+?[0-9\s()-]+$/.test(trimmedPhoneNumber)) {
    throw new Error('Phone number must be valid.')
  }
}

function validateTriageCode(code: TriageCode) {
  if (code !== 'unknown' && code !== 'green' && code !== 'yellow') {
    throw new Error('Code must be unknown, green, or yellow.')
  }
}

function findPatientOrThrow(patients: Patient[], patientId: string) {
  const patient = patients.find((candidate) => candidate.id === patientId)

  if (!patient) {
    throw new Error('Patient details are unavailable right now.')
  }

  return patient
}

function findDoctorTaskOrThrow(patient: Patient, taskId: string) {
  const task = getDoctorTasks(patient).find((candidate) => candidate.id === taskId)

  if (!task) {
    throw new Error('Doctor task details are unavailable right now.')
  }

  return task
}

function findTestRequestOrThrow(patient: Patient, requestId: string) {
  const request = getTestRequests(patient).find((candidate) => candidate.id === requestId)

  if (!request) {
    throw new Error('Test request details are unavailable right now.')
  }

  return request
}

function findTestItemOrThrow(request: PatientTestRequest, testItemId: string) {
  const item = request.items.find((candidate) => candidate.id === testItemId)

  if (!item) {
    throw new Error('Test details are unavailable right now.')
  }

  return item
}

function buildDoctorIdFromUsername(username: string) {
  return `DOC-${normalizeValue(username).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`
}

function toDisplayName(username: string) {
  return username
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => `${segment[0]?.toUpperCase() ?? ''}${segment.slice(1)}`)
    .join(' ')
}

function buildRuntimeDoctorProfile(user: AuthUser): DoctorProfile {
  return {
    displayName: toDisplayName(user.username).startsWith('Dr')
      ? toDisplayName(user.username)
      : `Dr. ${toDisplayName(user.username)}`,
    id: buildDoctorIdFromUsername(user.username),
    isTester: user.isTester,
    specialties:
      user.specialties.length > 0
        ? [...user.specialties]
        : [user.isTester ? 'Laboratory Medicine' : 'Internal Medicine'],
    username: user.username,
  }
}

function getActorLabel(actor: PatientMutationActor, doctors: DoctorProfile[]) {
  if (actor.role === 'registry') {
    return 'Registry desk'
  }

  if (actor.role === 'nurse') {
    return 'Nurse station'
  }

  return doctors.find((doctor) => doctor.id === actor.doctorId)?.displayName ?? actor.username
}

function addNote(patient: Patient, text: string, authorLabel: string, createdAt: string) {
  const trimmedText = text.trim()

  if (trimmedText.length === 0) {
    return
  }

  patient.notes = [
    {
      authorLabel,
      createdAt,
      id: buildNoteId(),
      text: trimmedText,
    },
    ...patient.notes,
  ]
}

function getMatchingDoctors(doctors: DoctorProfile[], specialty: string) {
  const normalizedSpecialty = normalizeValue(specialty)

  return doctors.filter((doctor) =>
    doctor.specialties.some((candidate) => normalizeValue(candidate) === normalizedSpecialty),
  )
}

function getDoctorTaskLoadExcludingTask(patients: Patient[], doctorId: string, excludedTaskId?: string) {
  return patients.reduce((count, patient) => {
    if (patient.checkedOutAt) {
      return count
    }

    return (
      count +
      getDoctorTasks(patient).filter(
        (task) =>
          task.assignedDoctorId === doctorId &&
          task.status !== 'done' &&
          task.id !== excludedTaskId,
      ).length
    )
  }, 0)
}

function getTestItemLoad(patients: Patient[], doctorId: string, excludedItemId?: string) {
  return patients.reduce((count, patient) => {
    if (patient.checkedOutAt) {
      return count
    }

    return (
      count +
      getTestRequests(patient).reduce(
        (requestCount, request) =>
          requestCount +
          request.items.filter(
            (item) =>
              item.assignedDoctorId === doctorId &&
              item.status === 'pending' &&
              item.id !== excludedItemId,
          ).length,
        0,
      )
    )
  }, 0)
}

function chooseBestDoctorId(
  specialty: string,
  doctors: DoctorProfile[],
  patients: Patient[],
  excludedTaskId?: string,
) {
  const matchingDoctors = getMatchingDoctors(doctors, specialty).filter((doctor) => !doctor.isTester)

  if (matchingDoctors.length === 0) {
    return null
  }

  return [...matchingDoctors]
    .sort((left, right) => {
      const leftLoad = getDoctorTaskLoadExcludingTask(patients, left.id, excludedTaskId)
      const rightLoad = getDoctorTaskLoadExcludingTask(patients, right.id, excludedTaskId)

      if (leftLoad !== rightLoad) {
        return leftLoad - rightLoad
      }

      return left.displayName.localeCompare(right.displayName)
    })[0]
    .id
}

function chooseBestTesterDoctorId(
  testerSpecialty: string,
  doctors: DoctorProfile[],
  patients: Patient[],
  excludedItemId?: string,
) {
  const matchingDoctors = getMatchingDoctors(doctors, testerSpecialty).filter((doctor) => doctor.isTester)

  if (matchingDoctors.length === 0) {
    return null
  }

  return [...matchingDoctors]
    .sort((left, right) => {
      const leftLoad = getTestItemLoad(patients, left.id, excludedItemId)
      const rightLoad = getTestItemLoad(patients, right.id, excludedItemId)

      if (leftLoad !== rightLoad) {
        return leftLoad - rightLoad
      }

      return left.displayName.localeCompare(right.displayName)
    })[0]
    .id
}

function compareTaskPriority(left: PatientDoctorTask, right: PatientDoctorTask) {
  const priorityDelta = getTriagePriority(left.code) - getTriagePriority(right.code)

  if (priorityDelta !== 0) {
    return priorityDelta
  }

  const createdAtDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()

  if (createdAtDelta !== 0) {
    return createdAtDelta
  }

  return left.id.localeCompare(right.id)
}

function rebalanceDoctorQueueForDoctor(patients: Patient[], doctorId: string) {
  const activeDoctorTasks = patients.flatMap((patient) =>
    getDoctorTasks(patient).filter(
      (task) => task.assignedDoctorId === doctorId && task.status !== 'done',
    ),
  )

  const currentTasks = activeDoctorTasks
    .filter((task) => task.status === 'with_doctor')
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())

  currentTasks.slice(1).forEach((task) => {
    task.status = 'queued'
  })

  const currentTask = currentTasks[0] ?? null

  if (currentTask) {
    currentTask.queueOrder = 0
  }

  activeDoctorTasks
    .filter((task) => task.id !== currentTask?.id)
    .sort(compareTaskPriority)
    .forEach((task, index) => {
      task.queueOrder = index + 1
    })
}

function rebalanceAllDoctorQueues(patients: Patient[], doctors: DoctorProfile[]) {
  doctors.forEach((doctor) => {
    rebalanceDoctorQueueForDoctor(patients, doctor.id)
  })
}

function reconcileAssignments(doctors: DoctorProfile[], patients: Patient[]) {
  patients.forEach((patient) => {
    getDoctorTasks(patient).forEach((task) => {
      if (task.status === 'done') {
        return
      }

      task.assignedDoctorId =
        task.type === 'return_to_doctor_task' && task.assignedDoctorId
          ? doctors.some((doctor) => doctor.id === task.assignedDoctorId)
            ? task.assignedDoctorId
            : chooseBestDoctorId(task.specialty, doctors, patients, task.id)
          : chooseBestDoctorId(task.specialty, doctors, patients, task.id)
    })

    getTestRequests(patient).forEach((request) => {
      request.items.forEach((item) => {
        if (item.status === 'done') {
          return
        }

        item.assignedDoctorId = chooseBestTesterDoctorId(
          item.testerSpecialty,
          doctors,
          patients,
          item.id,
        )
      })
    })
  })

  rebalanceAllDoctorQueues(patients, doctors)
}

function syncSnapshot(doctors: DoctorProfile[], patients: Patient[], notifications: WorkspaceNotification[]) {
  hospitalState = {
    doctors,
    notifications,
    patients,
  }
}

function createSnapshotResponse() {
  return delay(cloneSnapshot(hospitalState))
}

function createMutationResult(
  doctors: DoctorProfile[],
  patients: Patient[],
  notifications: WorkspaceNotification[],
  patient: Patient,
) {
  syncSnapshot(doctors, patients, notifications)

  return delay({
    doctors: doctors.map(cloneDoctor),
    notifications: notifications.map(cloneNotification),
    patient: clonePatient(patient),
    patients: patients.map(clonePatient),
  } satisfies HospitalMutationResult)
}

function createTestsReadyNotification(
  notifications: WorkspaceNotification[],
  patient: Patient,
  request: PatientTestRequest,
  timestamp: string,
) {
  const existingNotification = notifications.find((notification) => notification.id === request.notificationId)

  if (existingNotification) {
    existingNotification.createdAt = timestamp
    existingNotification.message = `${patient.name} has completed all requested tests and can be sent back to ${request.returnSpecialty}.`
    existingNotification.readAt = null
    existingNotification.title = 'Tests ready'
    return existingNotification.id
  }

  const notificationId = buildNotificationId()

  notifications.unshift({
    action: {
      patientId: patient.id,
      requestId: request.id,
      type: 'send_back_to_doctor',
    },
    createdAt: timestamp,
    id: notificationId,
    message: `${patient.name} has completed all requested tests and can be sent back to ${request.returnSpecialty}.`,
    patientId: patient.id,
    readAt: null,
    targetDoctorId: null,
    targetRole: 'nurse',
    title: 'Tests ready',
    type: 'tests_ready',
  })

  return notificationId
}

function maybeCreateDoctorQueueNotification(
  notifications: WorkspaceNotification[],
  patients: Patient[],
  doctorId: string | null,
  patient: Patient,
  specialty: string,
  timestamp: string,
  excludedTaskId?: string,
) {
  if (!doctorId) {
    return
  }

  const currentLoad = getDoctorTaskLoadExcludingTask(patients, doctorId, excludedTaskId)

  if (currentLoad !== 0) {
    return
  }

  notifications.unshift({
    action: null,
    createdAt: timestamp,
    id: buildNotificationId(),
    message: `${patient.name} was added to your ${specialty} queue.`,
    patientId: patient.id,
    readAt: null,
    targetDoctorId: doctorId,
    targetRole: 'doctor',
    title: 'New patient',
    type: 'doctor_queue',
  })
}

function validateTaskDrafts(taskDrafts: DoctorTaskDraft[]) {
  if (taskDrafts.length === 0) {
    throw new Error('At least one specialty is required.')
  }

  taskDrafts.forEach((taskDraft) => {
    ensureFilled(taskDraft.specialty, 'Specialty')
    validateTriageCode(taskDraft.code)
  })
}

function getCatalogTestOrThrow(testName: string) {
  const match = testCatalogSeed.find((option) => normalizeValue(option.label) === normalizeValue(testName))

  if (!match?.testerSpecialty) {
    throw new Error(`Unknown test: ${testName}.`)
  }

  return match as CatalogOption & { testerSpecialty: string }
}

function buildInitialSnapshot() {
  const snapshot = cloneSnapshot({
    doctors: seededDoctorProfiles,
    notifications: seededNotifications,
    patients: seededPatients,
  })

  reconcileAssignments(snapshot.doctors, snapshot.patients)

  return snapshot
}

let hospitalState: HospitalSnapshot = buildInitialSnapshot()

export function buildSpecialtyCatalog(doctors: DoctorProfile[]): CatalogOption[] {
  const mergedCatalog = specialtyCatalogSeed.map((option) => ({
    ...option,
    keywords: [...option.keywords],
  }))
  const seenSpecialties = new Set(mergedCatalog.map((option) => normalizeValue(option.label)))

  doctors.forEach((doctor) => {
    doctor.specialties.forEach((specialty) => {
      const normalizedSpecialty = normalizeValue(specialty)

      if (seenSpecialties.has(normalizedSpecialty)) {
        return
      }

      seenSpecialties.add(normalizedSpecialty)
      mergedCatalog.push({
        id: `sp-runtime-${normalizedSpecialty.replace(/[^a-z0-9]+/g, '-')}`,
        keywords: [],
        label: specialty,
      })
    })
  })

  return mergedCatalog
}

export function getTestCatalog() {
  return testCatalogSeed.map((option) => ({
    ...option,
    keywords: [...option.keywords],
  }))
}

export async function getHospitalSnapshot(activeUser: AuthUser | null): Promise<HospitalSnapshot> {
  if (
    activeUser?.role === 'doctor' &&
    !hospitalState.doctors.some((doctor) => doctor.username === activeUser.username)
  ) {
    const nextSnapshot = cloneSnapshot(hospitalState)
    nextSnapshot.doctors.push(buildRuntimeDoctorProfile(activeUser))
    reconcileAssignments(nextSnapshot.doctors, nextSnapshot.patients)
    syncSnapshot(nextSnapshot.doctors, nextSnapshot.patients, nextSnapshot.notifications)
  }

  return createSnapshotResponse()
}

export async function ensureDoctorProfile(
  currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  currentNotifications: WorkspaceNotification[],
  activeUser: AuthUser,
) {
  if (
    activeUser.role !== 'doctor' ||
    currentDoctors.some((doctor) => doctor.username === activeUser.username)
  ) {
    return delay({
      doctors: currentDoctors.map(cloneDoctor),
      notifications: currentNotifications.map(cloneNotification),
      patients: currentPatients.map(clonePatient),
    } satisfies HospitalSnapshot)
  }

  const doctors = currentDoctors.map(cloneDoctor)
  const patients = currentPatients.map(clonePatient)
  const notifications = currentNotifications.map(cloneNotification)

  doctors.push(buildRuntimeDoctorProfile(activeUser))
  reconcileAssignments(doctors, patients)
  syncSnapshot(doctors, patients, notifications)

  return delay({
    doctors: doctors.map(cloneDoctor),
    notifications: notifications.map(cloneNotification),
    patients: patients.map(clonePatient),
  } satisfies HospitalSnapshot)
}

export async function createPatient(
  currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  currentNotifications: WorkspaceNotification[],
  input: CheckInPatientInput,
  actor: PatientMutationActor,
) {
  validatePatientName(input.name)
  validatePhoneNumber(input.phoneNumber)
  validateTaskDrafts(input.initialTasks)

  const doctors = currentDoctors.map(cloneDoctor)
  const notifications = currentNotifications.map(cloneNotification)
  const patients = currentPatients.map(clonePatient)
  const timestamp = new Date().toISOString()
  const actorLabel = getActorLabel(actor, doctors)
  const patient: Patient = {
    admittedAt: timestamp,
    checkedOutAt: null,
    id: buildPatientId(),
    lastUpdatedAt: timestamp,
    name: input.name.trim(),
    notes: [],
    phoneNumber: input.phoneNumber.trim(),
    tasks: [],
  }

  input.initialTasks.forEach((taskDraft) => {
    const assignedDoctorId = chooseBestDoctorId(taskDraft.specialty, doctors, [...patients, patient])
    maybeCreateDoctorQueueNotification(
      notifications,
      patients,
      assignedDoctorId,
      patient,
      taskDraft.specialty.trim(),
      timestamp,
    )

    patient.tasks.push({
      assignedDoctorId,
      code: taskDraft.code,
      completedAt: null,
      createdAt: timestamp,
      id: buildDoctorTaskId(),
      note: '',
      queueOrder: 0,
      requestedByLabel: actorLabel,
      sourceTaskId: null,
      specialty: taskDraft.specialty.trim(),
      status: 'queued',
      type: 'doctor_task',
      updatedAt: timestamp,
    })
  })

  addNote(patient, input.notes, actorLabel, timestamp)
  patients.push(patient)
  reconcileAssignments(doctors, patients)

  return createMutationResult(doctors, patients, notifications, patient)
}

export async function updatePatientCore(
  currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  currentNotifications: WorkspaceNotification[],
  patientId: string,
  input: UpdatePatientCoreInput,
  actor: PatientMutationActor,
) {
  validatePatientName(input.name)
  validatePhoneNumber(input.phoneNumber)

  const doctors = currentDoctors.map(cloneDoctor)
  const notifications = currentNotifications.map(cloneNotification)
  const patients = currentPatients.map(clonePatient)
  const patient = findPatientOrThrow(patients, patientId)
  const timestamp = new Date().toISOString()

  patient.name = input.name.trim()
  patient.phoneNumber = input.phoneNumber.trim()
  patient.lastUpdatedAt = timestamp
  addNote(patient, input.note, getActorLabel(actor, doctors), timestamp)

  return createMutationResult(doctors, patients, notifications, patient)
}

export async function addDoctorTask(
  currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  currentNotifications: WorkspaceNotification[],
  patientId: string,
  taskDraft: DoctorTaskDraft,
  actor: PatientMutationActor,
) {
  ensureFilled(taskDraft.specialty, 'Specialty')
  validateTriageCode(taskDraft.code)

  const doctors = currentDoctors.map(cloneDoctor)
  const notifications = currentNotifications.map(cloneNotification)
  const patients = currentPatients.map(clonePatient)
  const patient = findPatientOrThrow(patients, patientId)
  const timestamp = new Date().toISOString()
  const assignedDoctorId = chooseBestDoctorId(taskDraft.specialty, doctors, patients)

  maybeCreateDoctorQueueNotification(
    notifications,
    patients,
    assignedDoctorId,
    patient,
    taskDraft.specialty.trim(),
    timestamp,
  )

  patient.tasks.push({
    assignedDoctorId,
    code: taskDraft.code,
    completedAt: null,
    createdAt: timestamp,
    id: buildDoctorTaskId(),
    note: '',
    queueOrder: 0,
    requestedByLabel: getActorLabel(actor, doctors),
    sourceTaskId: null,
    specialty: taskDraft.specialty.trim(),
    status: 'queued',
    type: 'doctor_task',
    updatedAt: timestamp,
  })
  patient.lastUpdatedAt = timestamp

  reconcileAssignments(doctors, patients)

  return createMutationResult(doctors, patients, notifications, patient)
}

export async function updateDoctorTask(
  currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  currentNotifications: WorkspaceNotification[],
  patientId: string,
  taskId: string,
  input: UpdateDoctorTaskInput,
) {
  ensureFilled(input.specialty, 'Specialty')
  validateTriageCode(input.code)

  const doctors = currentDoctors.map(cloneDoctor)
  const notifications = currentNotifications.map(cloneNotification)
  const patients = currentPatients.map(clonePatient)
  const patient = findPatientOrThrow(patients, patientId)
  const task = findDoctorTaskOrThrow(patient, taskId)
  const timestamp = new Date().toISOString()

  task.specialty = input.specialty.trim()
  task.code = input.code
  task.updatedAt = timestamp

  if (task.status !== 'done') {
    const nextDoctorId =
      task.type === 'return_to_doctor_task' && task.assignedDoctorId
        ? task.assignedDoctorId
        : chooseBestDoctorId(task.specialty, doctors, patients, task.id)

    maybeCreateDoctorQueueNotification(
      notifications,
      patients,
      nextDoctorId,
      patient,
      task.specialty,
      timestamp,
      task.id,
    )

    task.assignedDoctorId = nextDoctorId
  }

  patient.lastUpdatedAt = timestamp
  reconcileAssignments(doctors, patients)

  return createMutationResult(doctors, patients, notifications, patient)
}

export async function addPatientNote(
  currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  currentNotifications: WorkspaceNotification[],
  patientId: string,
  noteText: string,
  actor: PatientMutationActor,
) {
  ensureFilled(noteText, 'Note')

  const doctors = currentDoctors.map(cloneDoctor)
  const notifications = currentNotifications.map(cloneNotification)
  const patients = currentPatients.map(clonePatient)
  const patient = findPatientOrThrow(patients, patientId)
  const timestamp = new Date().toISOString()

  addNote(patient, noteText, getActorLabel(actor, doctors), timestamp)
  patient.lastUpdatedAt = timestamp

  return createMutationResult(doctors, patients, notifications, patient)
}

export async function startDoctorTask(
  currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  currentNotifications: WorkspaceNotification[],
  patientId: string,
  taskId: string,
  actor: PatientMutationActor,
) {
  if (!actor.doctorId) {
    throw new Error('Doctor actions require an assigned doctor profile.')
  }

  const doctors = currentDoctors.map(cloneDoctor)
  const notifications = currentNotifications.map(cloneNotification)
  const patients = currentPatients.map(clonePatient)
  const patient = findPatientOrThrow(patients, patientId)
  const task = findDoctorTaskOrThrow(patient, taskId)
  const timestamp = new Date().toISOString()

  if (task.assignedDoctorId !== actor.doctorId) {
    throw new Error('This task is not assigned to the current doctor.')
  }

  patients.forEach((candidatePatient) => {
    getDoctorTasks(candidatePatient)
      .filter(
        (candidateTask) =>
          candidateTask.assignedDoctorId === actor.doctorId &&
          candidateTask.id !== task.id &&
          candidateTask.status === 'with_doctor',
      )
      .forEach((candidateTask) => {
        candidateTask.status = 'queued'
        candidateTask.updatedAt = timestamp
      })
  })

  task.status = 'with_doctor'
  task.updatedAt = timestamp
  patient.lastUpdatedAt = timestamp

  rebalanceDoctorQueueForDoctor(patients, actor.doctorId)

  return createMutationResult(doctors, patients, notifications, patient)
}

export async function markDoctorTaskNotHere(
  currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  currentNotifications: WorkspaceNotification[],
  patientId: string,
  taskId: string,
  actor: PatientMutationActor,
) {
  if (!actor.doctorId) {
    throw new Error('Doctor actions require an assigned doctor profile.')
  }

  const doctors = currentDoctors.map(cloneDoctor)
  const notifications = currentNotifications.map(cloneNotification)
  const patients = currentPatients.map(clonePatient)
  const patient = findPatientOrThrow(patients, patientId)
  const task = findDoctorTaskOrThrow(patient, taskId)
  const timestamp = new Date().toISOString()

  if (task.assignedDoctorId !== actor.doctorId || task.status === 'done' || task.status === 'with_doctor') {
    throw new Error('Only queued doctor tasks can be marked as not here.')
  }

  rebalanceDoctorQueueForDoctor(patients, actor.doctorId)

  const queue = patients
    .flatMap((candidatePatient) =>
      getDoctorTasks(candidatePatient).filter(
        (candidateTask) =>
          candidateTask.assignedDoctorId === actor.doctorId &&
          candidateTask.status !== 'done' &&
          candidateTask.status !== 'with_doctor',
      ),
    )
    .sort((left, right) => left.queueOrder - right.queueOrder)

  const queueIndex = queue.findIndex((candidateTask) => candidateTask.id === task.id)

  if (queueIndex === -1) {
    throw new Error('Task queue details are unavailable right now.')
  }

  task.status = 'not_here'
  task.updatedAt = timestamp

  const nextTask = queue[queueIndex + 1]

  if (nextTask) {
    const previousQueueOrder = task.queueOrder
    task.queueOrder = nextTask.queueOrder
    nextTask.queueOrder = previousQueueOrder
  }

  patient.lastUpdatedAt = timestamp

  return createMutationResult(doctors, patients, notifications, patient)
}

export async function completeDoctorTask(
  currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  currentNotifications: WorkspaceNotification[],
  patientId: string,
  taskId: string,
  actor: PatientMutationActor,
) {
  if (!actor.doctorId) {
    throw new Error('Doctor actions require an assigned doctor profile.')
  }

  const doctors = currentDoctors.map(cloneDoctor)
  const notifications = currentNotifications.map(cloneNotification)
  const patients = currentPatients.map(clonePatient)
  const patient = findPatientOrThrow(patients, patientId)
  const task = findDoctorTaskOrThrow(patient, taskId)
  const timestamp = new Date().toISOString()

  if (task.assignedDoctorId !== actor.doctorId) {
    throw new Error('This task is not assigned to the current doctor.')
  }

  task.completedAt = timestamp
  task.status = 'done'
  task.updatedAt = timestamp
  patient.lastUpdatedAt = timestamp

  if (task.assignedDoctorId) {
    rebalanceDoctorQueueForDoctor(patients, task.assignedDoctorId)
  }

  return createMutationResult(doctors, patients, notifications, patient)
}

export async function createTestRequest(
  currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  currentNotifications: WorkspaceNotification[],
  patientId: string,
  sourceTaskId: string,
  input: CreateTestRequestInput,
  actor: PatientMutationActor,
) {
  if (!actor.doctorId) {
    throw new Error('Doctor actions require an assigned doctor profile.')
  }

  const uniqueTests = [...new Set(input.tests.map((value) => value.trim()).filter(Boolean))]

  if (uniqueTests.length === 0) {
    throw new Error('Choose at least one test.')
  }

  const doctors = currentDoctors.map(cloneDoctor)
  const notifications = currentNotifications.map(cloneNotification)
  const patients = currentPatients.map(clonePatient)
  const patient = findPatientOrThrow(patients, patientId)
  const sourceTask = findDoctorTaskOrThrow(patient, sourceTaskId)
  const timestamp = new Date().toISOString()

  if (sourceTask.assignedDoctorId !== actor.doctorId) {
    throw new Error('Only the assigned doctor can create tests for this task.')
  }

  const items: PatientTestItem[] = uniqueTests.map((testName) => {
    const catalogTest = getCatalogTestOrThrow(testName)

    return {
      assignedDoctorId: chooseBestTesterDoctorId(catalogTest.testerSpecialty, doctors, patients),
      completedAt: null,
      completedByLabel: null,
      createdAt: timestamp,
      id: buildTestItemId(),
      status: 'pending',
      testName: catalogTest.label,
      testerSpecialty: catalogTest.testerSpecialty,
      updatedAt: timestamp,
    }
  })

  patient.tasks.push({
    code: sourceTask.code,
    createdAt: timestamp,
    id: buildTestRequestId(),
    items,
    note: input.note.trim(),
    notificationId: null,
    orderedByDoctorId: actor.doctorId,
    orderedByLabel: getActorLabel(actor, doctors),
    returnedAt: null,
    returnDoctorId: sourceTask.assignedDoctorId,
    returnSpecialty: sourceTask.specialty,
    sourceTaskId: sourceTask.id,
    status: 'pending',
    type: 'test_request',
    updatedAt: timestamp,
  })
  patient.lastUpdatedAt = timestamp

  if (input.note.trim().length > 0) {
    addNote(patient, input.note, getActorLabel(actor, doctors), timestamp)
  }

  return createMutationResult(doctors, patients, notifications, patient)
}

export async function markTestItemDone(
  currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  currentNotifications: WorkspaceNotification[],
  patientId: string,
  requestId: string,
  testItemId: string,
  actor: PatientMutationActor,
) {
  const doctors = currentDoctors.map(cloneDoctor)
  const notifications = currentNotifications.map(cloneNotification)
  const patients = currentPatients.map(clonePatient)
  const patient = findPatientOrThrow(patients, patientId)
  const request = findTestRequestOrThrow(patient, requestId)
  const testItem = findTestItemOrThrow(request, testItemId)
  const timestamp = new Date().toISOString()

  if (testItem.status === 'done') {
    return createMutationResult(doctors, patients, notifications, patient)
  }

  testItem.completedAt = timestamp
  testItem.completedByLabel = getActorLabel(actor, doctors)
  testItem.status = 'done'
  testItem.updatedAt = timestamp
  request.updatedAt = timestamp

  if (request.items.every((item) => item.status === 'done')) {
    request.status = 'ready_for_return'
    request.notificationId = createTestsReadyNotification(notifications, patient, request, timestamp)
  }

  patient.lastUpdatedAt = timestamp

  return createMutationResult(doctors, patients, notifications, patient)
}

export async function sendPatientBackToDoctor(
  currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  currentNotifications: WorkspaceNotification[],
  patientId: string,
  requestId: string,
  actor: PatientMutationActor,
) {
  if (actor.role !== 'nurse') {
    throw new Error('Only nurses can send patients back to the ordering doctor.')
  }

  const doctors = currentDoctors.map(cloneDoctor)
  const notifications = currentNotifications.map(cloneNotification)
  const patients = currentPatients.map(clonePatient)
  const patient = findPatientOrThrow(patients, patientId)
  const request = findTestRequestOrThrow(patient, requestId)
  const timestamp = new Date().toISOString()

  if (request.status !== 'ready_for_return') {
    throw new Error('The patient cannot be sent back yet.')
  }

  const assignedDoctorId =
    request.returnDoctorId && doctors.some((doctor) => doctor.id === request.returnDoctorId)
      ? request.returnDoctorId
      : chooseBestDoctorId(request.returnSpecialty, doctors, patients)

  maybeCreateDoctorQueueNotification(
    notifications,
    patients,
    assignedDoctorId,
    patient,
    request.returnSpecialty,
    timestamp,
  )

  patient.tasks.push({
    assignedDoctorId,
    code: request.code,
    completedAt: null,
    createdAt: timestamp,
    id: buildDoctorTaskId(),
    note: 'Returned after completed tests.',
    queueOrder: 0,
    requestedByLabel: 'Nurse station',
    sourceTaskId: request.sourceTaskId,
    specialty: request.returnSpecialty,
    status: 'queued',
    type: 'return_to_doctor_task',
    updatedAt: timestamp,
  })

  request.returnDoctorId = assignedDoctorId
  request.returnedAt = timestamp
  request.status = 'returned'
  request.updatedAt = timestamp
  patient.lastUpdatedAt = timestamp

  if (request.notificationId) {
    const notification = notifications.find((candidate) => candidate.id === request.notificationId)

    if (notification) {
      notification.readAt = timestamp
    }
  }

  reconcileAssignments(doctors, patients)

  return createMutationResult(doctors, patients, notifications, patient)
}

export async function checkoutPatient(
  currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  currentNotifications: WorkspaceNotification[],
  patientId: string,
) {
  const doctors = currentDoctors.map(cloneDoctor)
  const notifications = currentNotifications.map(cloneNotification)
  const patients = currentPatients.map(clonePatient)
  const patient = findPatientOrThrow(patients, patientId)
  const timestamp = new Date().toISOString()

  if (!canCheckoutPatient(patient)) {
    throw new Error('Patient still has active doctor or test work.')
  }

  patient.checkedOutAt = timestamp
  patient.lastUpdatedAt = timestamp

  return createMutationResult(doctors, patients, notifications, patient)
}

export async function markNotificationRead(
  currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  currentNotifications: WorkspaceNotification[],
  notificationId: string,
) {
  const doctors = currentDoctors.map(cloneDoctor)
  const notifications = currentNotifications.map(cloneNotification)
  const patients = currentPatients.map(clonePatient)
  const notification = notifications.find((candidate) => candidate.id === notificationId)

  if (notification && !notification.readAt) {
    notification.readAt = new Date().toISOString()
  }

  syncSnapshot(doctors, patients, notifications)

  return delay({
    doctors: doctors.map(cloneDoctor),
    notifications: notifications.map(cloneNotification),
    patients: patients.map(clonePatient),
  } satisfies HospitalSnapshot)
}

export function getUnreadNotificationCount(
  notifications: WorkspaceNotification[],
  role: 'doctor' | 'nurse',
  doctorId?: string | null,
) {
  return notifications.filter((notification) => {
    if (notification.readAt || notification.targetRole !== role) {
      return false
    }

    if (role === 'doctor') {
      return notification.targetDoctorId === doctorId
    }

    return true
  }).length
}

export function getVisibleNotifications(
  notifications: WorkspaceNotification[],
  role: 'doctor' | 'nurse',
  doctorId?: string | null,
) {
  return notifications.filter((notification) => {
    if (notification.targetRole !== role) {
      return false
    }

    if (role === 'doctor') {
      return notification.targetDoctorId === doctorId
    }

    return true
  })
}

export function getPatientDoctorLabel(doctors: DoctorProfile[], patient: Patient) {
  const currentTask =
    getDoctorTasks(patient).find((task) => task.status === 'with_doctor') ??
    getDoctorTasks(patient)
      .filter((task) => task.status !== 'done')
      .sort(compareTaskPriority)[0] ??
    null

  return getDoctorLabelById(doctors, currentTask?.assignedDoctorId ?? null)
}

export function getPatientReadyReturnCount(patient: Patient) {
  return getReadyReturnRequests(patient).length
}

export function getPatientPendingTestCount(patient: Patient) {
  return getPendingTestItems(patient).length
}

export function getPatientOpenTaskCount(patient: Patient) {
  return getDoctorTasks(patient).filter((task) => task.status !== 'done').length
}

export function getDoctorQueueCount(patients: Patient[], doctorId: string) {
  return getDoctorTaskLoadExcludingTask(patients, doctorId)
}
