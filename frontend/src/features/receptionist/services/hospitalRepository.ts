import type { AuthUser } from '../../../auth/types'
import {
  canCheckoutPatient,
  getDoctorLabelById,
  getDoctorTasks,
  getPendingTestItems,
  getReadyReturnRequests,
  getTriagePriority,
  getTestRequests,
} from '../utils/patientQueue'
import { buildClinicianDirectory, buildSpecialtyCatalog, getTestCatalog, normalizeSpecialty } from './clinicianDirectory'
import {
  attachPatientNote,
  checkInPatient,
  deletePatient,
  getHospitalStreamUrl,
  getPatientDetails as fetchPatientDetailsFromApi,
  listPatients,
  patchPatient,
  HospitalApiError,
} from './hospitalApi'
import {
  getPatientOverlay,
  loadOverlayStore,
  pruneOverlayStore,
  removePatientOverlay,
  saveOverlayStore,
} from './hospitalOverlay'
import type {
  BackendPatientCore,
  BackendPatientDetails,
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
  PatientNote,
  PatientTask,
  PatientTestItem,
  PatientTestRequest,
  TriageState,
  UpdateDoctorTaskInput,
  UpdatePatientCoreInput,
  WorkspaceNotification,
} from '../types/patient'

const detailCache = new Map<string, BackendPatientDetails>()

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

function cloneTask(task: PatientTask): PatientTask {
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
    core: {
      ...patient.core,
      notes: [...patient.core.notes],
    },
    detail: patient.detail
      ? {
          ...patient.detail,
          history: patient.detail.history.map((entry) => ({ ...entry })),
          notes: [...patient.detail.notes],
          queue: patient.detail.queue.map((entry) => ({ ...entry })),
        }
      : null,
    notes: patient.notes.map((note) => ({ ...note })),
    overlay: {
      tasks: patient.overlay.tasks.map(cloneTask),
    },
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

  ensureFilled(trimmedPhoneNumber, 'Phone number')

  const digitsOnly = trimmedPhoneNumber.replace(/\D/g, '')

  if (digitsOnly.length < 7 || !/^\+?[0-9\s()-]+$/.test(trimmedPhoneNumber)) {
    throw new Error('Phone number must be valid.')
  }
}

function validateTriageState(triageState: TriageState) {
  if (triageState !== 'GREEN' && triageState !== 'YELLOW' && triageState !== 'RED') {
    throw new Error('Triage state must be Green, Yellow, or Red.')
  }
}

function validateTaskDrafts(taskDrafts: DoctorTaskDraft[]) {
  if (taskDrafts.length === 0) {
    throw new Error('At least one specialty is required.')
  }

  taskDrafts.forEach((taskDraft) => {
    ensureFilled(taskDraft.specialty, 'Specialty')
  })
}

function getNoteId(patientId: string, index: number, text: string) {
  return `server-note:${patientId}:${index}:${normalizeValue(text).replace(/[^a-z0-9]+/g, '-')}`
}

function buildServerNotes(core: BackendPatientCore): PatientNote[] {
  return core.notes.map((text, index) => ({
    authorLabel: 'Server note',
    createdAt: core.admittedAt,
    id: getNoteId(core.id, index, text),
    source: 'server',
    text,
  }))
}

function getLastUpdatedAt(core: BackendPatientCore, overlayTasks: PatientTask[]) {
  const overlayUpdatedAt = overlayTasks.reduce((latest, task) => {
    const taskUpdatedAt = new Date(task.updatedAt).getTime()

    if (Number.isNaN(taskUpdatedAt)) {
      return latest
    }

    return Math.max(latest, taskUpdatedAt)
  }, new Date(core.admittedAt).getTime())

  return new Date(overlayUpdatedAt).toISOString()
}

function mergePatient(core: BackendPatientCore, overlayTasks: PatientTask[]): Patient {
  const detail = detailCache.get(core.id) ?? null
  const tasks = overlayTasks.map(cloneTask).map((task) => ({
    ...task,
    triageState: core.triageState,
  })) as PatientTask[]

  return {
    admittedAt: core.admittedAt,
    checkedOutAt: null,
    core: {
      ...core,
      notes: [...core.notes],
    },
    detail: detail
      ? {
          ...detail,
          history: detail.history.map((entry) => ({ ...entry })),
          notes: [...detail.notes],
          queue: detail.queue.map((entry) => ({ ...entry })),
        }
      : null,
    id: core.id,
    lastUpdatedAt: getLastUpdatedAt(core, tasks),
    name: core.name,
    notes: buildServerNotes(core),
    overlay: {
      tasks: tasks.map(cloneTask),
    },
    phoneNumber: core.phoneNumber,
    tasks,
    triageState: core.triageState,
  }
}

function resolveDoctors(runtimeDoctors: DoctorProfile[] = [], activeUser: AuthUser | null = null) {
  const doctorsByUsername = new Map<string, DoctorProfile>()

  buildClinicianDirectory(activeUser).forEach((doctor) => {
    doctorsByUsername.set(doctor.username, cloneDoctor(doctor))
  })

  runtimeDoctors.forEach((doctor) => {
    doctorsByUsername.set(doctor.username, cloneDoctor(doctor))
  })

  return [...doctorsByUsername.values()]
}

function snapshotToOverlayStore(snapshot: HospitalSnapshot) {
  return {
    notifications: snapshot.notifications.map(cloneNotification),
    patientOverlays: Object.fromEntries(
      snapshot.patients
        .filter((patient) => patient.tasks.length > 0)
        .map((patient) => [
          patient.id,
          {
            tasks: patient.tasks.map(cloneTask),
          },
        ]),
    ),
  }
}

function persistSnapshot(snapshot: HospitalSnapshot) {
  saveOverlayStore(snapshotToOverlayStore(snapshot))
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
    throw new Error('Queue item details are unavailable right now.')
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
    throw new Error('Test item details are unavailable right now.')
  }

  return item
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

function getMatchingDoctors(doctors: DoctorProfile[], specialty: string) {
  const normalizedSpecialty = normalizeSpecialty(specialty)

  return doctors.filter((doctor) =>
    doctor.specialties.some((candidate) => normalizeSpecialty(candidate) === normalizedSpecialty),
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
  if (left.triageState !== right.triageState) {
    return getTriagePriority(left.triageState) - getTriagePriority(right.triageState)
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
      task.triageState = patient.triageState

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
      request.triageState = patient.triageState

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

function buildNotificationId() {
  return `NT-${crypto.randomUUID()}`
}

function buildDoctorTaskId() {
  return `DT-${crypto.randomUUID()}`
}

function buildTestRequestId() {
  return `TR-${crypto.randomUUID()}`
}

function buildTestItemId() {
  return `TI-${crypto.randomUUID()}`
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

function getCatalogTestOrThrow(testName: string) {
  const match = getTestCatalog().find((option) => normalizeValue(option.label) === normalizeValue(testName))

  if (!match?.testerSpecialty) {
    throw new Error(`Unknown test: ${testName}.`)
  }

  return match as CatalogOption & { testerSpecialty: string }
}

async function loadSnapshot(options?: {
  activeUser?: AuthUser | null
  runtimeDoctors?: DoctorProfile[]
}) {
  const corePatients = await listPatients()
  const store = loadOverlayStore()
  pruneOverlayStore(
    store,
    corePatients.map((patient) => patient.id),
  )
  saveOverlayStore(store)

  const snapshot: HospitalSnapshot = {
    doctors: resolveDoctors(options?.runtimeDoctors, options?.activeUser ?? null),
    notifications: store.notifications.map(cloneNotification),
    patients: corePatients.map((core) => mergePatient(core, getPatientOverlay(store, core.id).tasks)),
  }

  reconcileAssignments(snapshot.doctors, snapshot.patients)
  persistSnapshot(snapshot)

  return cloneSnapshot(snapshot)
}

function buildMutationResult(
  snapshot: HospitalSnapshot,
  patientId: string,
  fallbackPatient?: Patient,
): HospitalMutationResult {
  const patient = snapshot.patients.find((candidate) => candidate.id === patientId) ?? fallbackPatient

  if (!patient) {
    throw new Error('Patient details are unavailable right now.')
  }

  return {
    doctors: snapshot.doctors,
    notifications: snapshot.notifications,
    patient: clonePatient(patient),
    patients: snapshot.patients,
  }
}

export async function getHospitalSnapshot(activeUser: AuthUser | null): Promise<HospitalSnapshot> {
  return loadSnapshot({
    activeUser,
  })
}

export async function ensureDoctorProfile(
  _currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  activeUser: AuthUser,
) {
  return loadSnapshot({
    activeUser,
    runtimeDoctors: currentDoctors,
  })
}

export async function prefetchPatientDetails(patientId: string) {
  try {
    const details = await fetchPatientDetailsFromApi(patientId)
    detailCache.set(patientId, details)
  } catch (error) {
    if (error instanceof HospitalApiError && error.status === 404) {
      detailCache.delete(patientId)
      return
    }

    throw error
  }
}

export function subscribeToHospitalStream(
  activeUser: AuthUser,
  runtimeDoctors: DoctorProfile[],
  onSnapshot: (snapshot: HospitalSnapshot) => void,
  onError?: (error: Error) => void,
) {
  let isClosed = false
  let isRefreshing = false
  const eventSource = new EventSource(getHospitalStreamUrl(), {
    withCredentials: true,
  })

  const refreshSnapshot = async () => {
    if (isClosed || isRefreshing) {
      return
    }

    isRefreshing = true

    try {
      const snapshot = await loadSnapshot({
        activeUser,
        runtimeDoctors,
      })

      if (!isClosed) {
        onSnapshot(snapshot)
      }
    } catch (error) {
      if (!isClosed && error instanceof Error) {
        onError?.(error)
      }
    } finally {
      isRefreshing = false
    }
  }

  const handleStreamEvent = () => {
    void refreshSnapshot()
  }

  eventSource.onmessage = handleStreamEvent
  eventSource.addEventListener('patient:check-in', handleStreamEvent)
  eventSource.addEventListener('patient:update', handleStreamEvent)
  eventSource.addEventListener('patient:check-out', handleStreamEvent)

  eventSource.onerror = () => {
    void refreshSnapshot()
  }

  return () => {
    isClosed = true
    eventSource.removeEventListener('patient:check-in', handleStreamEvent)
    eventSource.removeEventListener('patient:update', handleStreamEvent)
    eventSource.removeEventListener('patient:check-out', handleStreamEvent)
    eventSource.close()
  }
}

export async function createPatient(
  _currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  input: CheckInPatientInput,
  actor: PatientMutationActor,
) {
  validatePatientName(input.name)
  validatePhoneNumber(input.phoneNumber)
  validateTriageState(input.triageState)
  validateTaskDrafts(input.initialTasks)

  const createdPatient = await checkInPatient({
    name: input.name,
    phoneNumber: input.phoneNumber,
    triageState: input.triageState,
  })

  if (input.notes.trim().length > 0) {
    await attachPatientNote(createdPatient.id, input.notes)
  }

  const snapshot = await loadSnapshot({
    runtimeDoctors: currentDoctors,
  })
  const patient = findPatientOrThrow(snapshot.patients, createdPatient.id)
  const timestamp = new Date().toISOString()
  const actorLabel = getActorLabel(actor, snapshot.doctors)

  input.initialTasks.forEach((taskDraft) => {
    const assignedDoctorId = chooseBestDoctorId(taskDraft.specialty, snapshot.doctors, snapshot.patients)

    maybeCreateDoctorQueueNotification(
      snapshot.notifications,
      snapshot.patients,
      assignedDoctorId,
      patient,
      taskDraft.specialty.trim(),
      timestamp,
    )

    patient.tasks.push({
      assignedDoctorId,
      completedAt: null,
      createdAt: timestamp,
      id: buildDoctorTaskId(),
      note: '',
      queueOrder: 0,
      requestedByLabel: actorLabel,
      sourceTaskId: null,
      specialty: taskDraft.specialty.trim(),
      status: 'queued',
      triageState: patient.triageState,
      type: 'doctor_task',
      updatedAt: timestamp,
    })
  })

  patient.overlay.tasks = patient.tasks.map(cloneTask)
  patient.lastUpdatedAt = timestamp
  reconcileAssignments(snapshot.doctors, snapshot.patients)
  persistSnapshot(snapshot)

  const finalSnapshot = await loadSnapshot({
    runtimeDoctors: currentDoctors,
  })

  return buildMutationResult(finalSnapshot, createdPatient.id)
}

export async function updatePatientCore(
  _currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  input: UpdatePatientCoreInput,
  actor: PatientMutationActor,
) {
  void actor
  validatePatientName(input.name)
  validatePhoneNumber(input.phoneNumber)
  validateTriageState(input.triageState)

  await patchPatient(patientId, {
    name: input.name,
    phoneNumber: input.phoneNumber,
    triageState: input.triageState,
  })

  if (input.note.trim().length > 0) {
    await attachPatientNote(patientId, input.note)
  }

  const finalSnapshot = await loadSnapshot({
    runtimeDoctors: currentDoctors,
  })

  return buildMutationResult(finalSnapshot, patientId)
}

export async function addDoctorTask(
  _currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  taskDraft: DoctorTaskDraft,
  actor: PatientMutationActor,
) {
  ensureFilled(taskDraft.specialty, 'Specialty')

  const snapshot = await loadSnapshot({
    runtimeDoctors: currentDoctors,
  })
  const patient = findPatientOrThrow(snapshot.patients, patientId)
  const timestamp = new Date().toISOString()
  const assignedDoctorId = chooseBestDoctorId(taskDraft.specialty, snapshot.doctors, snapshot.patients)

  maybeCreateDoctorQueueNotification(
    snapshot.notifications,
    snapshot.patients,
    assignedDoctorId,
    patient,
    taskDraft.specialty.trim(),
    timestamp,
  )

  patient.tasks.push({
    assignedDoctorId,
    completedAt: null,
    createdAt: timestamp,
    id: buildDoctorTaskId(),
    note: '',
    queueOrder: 0,
    requestedByLabel: getActorLabel(actor, snapshot.doctors),
    sourceTaskId: null,
    specialty: taskDraft.specialty.trim(),
    status: 'queued',
    triageState: patient.triageState,
    type: 'doctor_task',
    updatedAt: timestamp,
  })
  patient.overlay.tasks = patient.tasks.map(cloneTask)
  patient.lastUpdatedAt = timestamp
  reconcileAssignments(snapshot.doctors, snapshot.patients)
  persistSnapshot(snapshot)

  return buildMutationResult(snapshot, patientId)
}

export async function updateDoctorTask(
  _currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  taskId: string,
  input: UpdateDoctorTaskInput,
) {
  ensureFilled(input.specialty, 'Specialty')

  const snapshot = await loadSnapshot({
    runtimeDoctors: currentDoctors,
  })
  const patient = findPatientOrThrow(snapshot.patients, patientId)
  const task = findDoctorTaskOrThrow(patient, taskId)
  const timestamp = new Date().toISOString()

  task.specialty = input.specialty.trim()
  task.updatedAt = timestamp
  task.assignedDoctorId = chooseBestDoctorId(task.specialty, snapshot.doctors, snapshot.patients, task.id)
  patient.overlay.tasks = patient.tasks.map(cloneTask)
  patient.lastUpdatedAt = timestamp

  maybeCreateDoctorQueueNotification(
    snapshot.notifications,
    snapshot.patients,
    task.assignedDoctorId,
    patient,
    task.specialty,
    timestamp,
    task.id,
  )

  reconcileAssignments(snapshot.doctors, snapshot.patients)
  persistSnapshot(snapshot)

  return buildMutationResult(snapshot, patientId)
}

export async function addPatientNote(
  _currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  noteText: string,
  actor: PatientMutationActor,
) {
  void actor
  ensureFilled(noteText, 'Note')
  await attachPatientNote(patientId, noteText)

  const snapshot = await loadSnapshot({
    runtimeDoctors: currentDoctors,
  })

  return buildMutationResult(snapshot, patientId)
}

export async function startDoctorTask(
  _currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  taskId: string,
  actor: PatientMutationActor,
) {
  if (!actor.doctorId) {
    throw new Error('Doctor actions require an assigned doctor profile.')
  }

  const snapshot = await loadSnapshot({
    runtimeDoctors: currentDoctors,
  })
  const patient = findPatientOrThrow(snapshot.patients, patientId)
  const task = findDoctorTaskOrThrow(patient, taskId)
  const timestamp = new Date().toISOString()

  if (task.assignedDoctorId !== actor.doctorId) {
    throw new Error('This queue item is not assigned to the current doctor.')
  }

  snapshot.patients.forEach((candidatePatient) => {
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
  patient.overlay.tasks = patient.tasks.map(cloneTask)
  patient.lastUpdatedAt = timestamp

  rebalanceDoctorQueueForDoctor(snapshot.patients, actor.doctorId)
  persistSnapshot(snapshot)

  return buildMutationResult(snapshot, patientId)
}

export async function markDoctorTaskNotHere(
  _currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  taskId: string,
  actor: PatientMutationActor,
) {
  if (!actor.doctorId) {
    throw new Error('Doctor actions require an assigned doctor profile.')
  }

  const snapshot = await loadSnapshot({
    runtimeDoctors: currentDoctors,
  })
  const patient = findPatientOrThrow(snapshot.patients, patientId)
  const task = findDoctorTaskOrThrow(patient, taskId)
  const timestamp = new Date().toISOString()

  if (task.assignedDoctorId !== actor.doctorId || task.status === 'done' || task.status === 'with_doctor') {
    throw new Error('Only queued doctor items can be marked as not here.')
  }

  rebalanceDoctorQueueForDoctor(snapshot.patients, actor.doctorId)

  const queue = snapshot.patients
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
    throw new Error('Queue details are unavailable right now.')
  }

  task.status = 'not_here'
  task.updatedAt = timestamp

  const nextTask = queue[queueIndex + 1]

  if (nextTask) {
    const previousQueueOrder = task.queueOrder
    task.queueOrder = nextTask.queueOrder
    nextTask.queueOrder = previousQueueOrder
  }

  patient.overlay.tasks = patient.tasks.map(cloneTask)
  patient.lastUpdatedAt = timestamp
  persistSnapshot(snapshot)

  return buildMutationResult(snapshot, patientId)
}

export async function completeDoctorTask(
  _currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  taskId: string,
  actor: PatientMutationActor,
) {
  if (!actor.doctorId) {
    throw new Error('Doctor actions require an assigned doctor profile.')
  }

  const snapshot = await loadSnapshot({
    runtimeDoctors: currentDoctors,
  })
  const patient = findPatientOrThrow(snapshot.patients, patientId)
  const task = findDoctorTaskOrThrow(patient, taskId)
  const timestamp = new Date().toISOString()

  if (task.assignedDoctorId !== actor.doctorId) {
    throw new Error('This queue item is not assigned to the current doctor.')
  }

  task.completedAt = timestamp
  task.status = 'done'
  task.updatedAt = timestamp
  patient.overlay.tasks = patient.tasks.map(cloneTask)
  patient.lastUpdatedAt = timestamp

  if (task.assignedDoctorId) {
    rebalanceDoctorQueueForDoctor(snapshot.patients, task.assignedDoctorId)
  }

  persistSnapshot(snapshot)

  return buildMutationResult(snapshot, patientId)
}

export async function createTestRequest(
  _currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
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

  const snapshot = await loadSnapshot({
    runtimeDoctors: currentDoctors,
  })
  const patient = findPatientOrThrow(snapshot.patients, patientId)
  const sourceTask = findDoctorTaskOrThrow(patient, sourceTaskId)
  const timestamp = new Date().toISOString()

  if (sourceTask.assignedDoctorId !== actor.doctorId) {
    throw new Error('Only the assigned doctor can order tests for this queue item.')
  }

  const items: PatientTestItem[] = uniqueTests.map((testName) => {
    const catalogTest = getCatalogTestOrThrow(testName)

    return {
      assignedDoctorId: chooseBestTesterDoctorId(catalogTest.testerSpecialty, snapshot.doctors, snapshot.patients),
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
    createdAt: timestamp,
    id: buildTestRequestId(),
    items,
    note: input.note.trim(),
    notificationId: null,
    orderedByDoctorId: actor.doctorId,
    orderedByLabel: getActorLabel(actor, snapshot.doctors),
    returnDoctorId: sourceTask.assignedDoctorId,
    returnSpecialty: sourceTask.specialty,
    returnedAt: null,
    sourceTaskId: sourceTask.id,
    status: 'pending',
    triageState: patient.triageState,
    type: 'test_request',
    updatedAt: timestamp,
  })
  patient.overlay.tasks = patient.tasks.map(cloneTask)
  patient.lastUpdatedAt = timestamp
  persistSnapshot(snapshot)

  return buildMutationResult(snapshot, patientId)
}

export async function markTestItemDone(
  _currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  requestId: string,
  testItemId: string,
  actor: PatientMutationActor,
) {
  const snapshot = await loadSnapshot({
    runtimeDoctors: currentDoctors,
  })
  const patient = findPatientOrThrow(snapshot.patients, patientId)
  const request = findTestRequestOrThrow(patient, requestId)
  const testItem = findTestItemOrThrow(request, testItemId)
  const timestamp = new Date().toISOString()

  if (testItem.status === 'done') {
    return buildMutationResult(snapshot, patientId)
  }

  testItem.completedAt = timestamp
  testItem.completedByLabel = getActorLabel(actor, snapshot.doctors)
  testItem.status = 'done'
  testItem.updatedAt = timestamp
  request.updatedAt = timestamp

  if (request.items.every((item) => item.status === 'done')) {
    request.status = 'ready_for_return'
    request.notificationId = createTestsReadyNotification(snapshot.notifications, patient, request, timestamp)
  }

  patient.overlay.tasks = patient.tasks.map(cloneTask)
  patient.lastUpdatedAt = timestamp
  persistSnapshot(snapshot)

  return buildMutationResult(snapshot, patientId)
}

export async function sendPatientBackToDoctor(
  _currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  requestId: string,
  actor: PatientMutationActor,
) {
  if (actor.role !== 'nurse') {
    throw new Error('Only nurses can send patients back to the ordering doctor.')
  }

  const snapshot = await loadSnapshot({
    runtimeDoctors: currentDoctors,
  })
  const patient = findPatientOrThrow(snapshot.patients, patientId)
  const request = findTestRequestOrThrow(patient, requestId)
  const timestamp = new Date().toISOString()

  if (request.status !== 'ready_for_return') {
    throw new Error('The patient cannot be sent back yet.')
  }

  const assignedDoctorId =
    request.returnDoctorId && snapshot.doctors.some((doctor) => doctor.id === request.returnDoctorId)
      ? request.returnDoctorId
      : chooseBestDoctorId(request.returnSpecialty, snapshot.doctors, snapshot.patients)

  maybeCreateDoctorQueueNotification(
    snapshot.notifications,
    snapshot.patients,
    assignedDoctorId,
    patient,
    request.returnSpecialty,
    timestamp,
  )

  patient.tasks.push({
    assignedDoctorId,
    completedAt: null,
    createdAt: timestamp,
    id: buildDoctorTaskId(),
    note: 'Returned after completed tests.',
    queueOrder: 0,
    requestedByLabel: 'Nurse station',
    sourceTaskId: request.sourceTaskId,
    specialty: request.returnSpecialty,
    status: 'queued',
    triageState: patient.triageState,
    type: 'return_to_doctor_task',
    updatedAt: timestamp,
  })

  request.returnDoctorId = assignedDoctorId
  request.returnedAt = timestamp
  request.status = 'returned'
  request.updatedAt = timestamp
  patient.overlay.tasks = patient.tasks.map(cloneTask)
  patient.lastUpdatedAt = timestamp

  if (request.notificationId) {
    const notification = snapshot.notifications.find((candidate) => candidate.id === request.notificationId)

    if (notification) {
      notification.readAt = timestamp
    }
  }

  reconcileAssignments(snapshot.doctors, snapshot.patients)
  persistSnapshot(snapshot)

  return buildMutationResult(snapshot, patientId)
}

export async function checkoutPatient(
  _currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
) {
  const snapshotBeforeDeletion = await loadSnapshot({
    runtimeDoctors: currentDoctors,
  })
  const patient = findPatientOrThrow(snapshotBeforeDeletion.patients, patientId)

  if (!canCheckoutPatient(patient)) {
    throw new Error('Patient still has active doctor or test work.')
  }

  await deletePatient(patientId)

  const store = loadOverlayStore()
  removePatientOverlay(store, patientId)
  saveOverlayStore(store)
  detailCache.delete(patientId)

  const finalSnapshot = await loadSnapshot({
    runtimeDoctors: currentDoctors,
  })
  const checkedOutPatient = {
    ...clonePatient(patient),
    checkedOutAt: new Date().toISOString(),
  }

  return buildMutationResult(finalSnapshot, patientId, checkedOutPatient)
}

export async function markNotificationRead(
  _currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  notificationId: string,
) {
  const snapshot = await loadSnapshot({
    runtimeDoctors: currentDoctors,
  })
  const notification = snapshot.notifications.find((candidate) => candidate.id === notificationId)

  if (notification && !notification.readAt) {
    notification.readAt = new Date().toISOString()
  }

  persistSnapshot(snapshot)

  return snapshot
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
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())[0] ??
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
  return patients.reduce((count, patient) => {
    if (patient.checkedOutAt) {
      return count
    }

    return (
      count +
      getDoctorTasks(patient).filter(
        (task) => task.assignedDoctorId === doctorId && task.status !== 'done',
      ).length
    )
  }, 0)
}

export { buildSpecialtyCatalog, getTestCatalog }
