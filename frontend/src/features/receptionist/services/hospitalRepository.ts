import type { AuthUser } from '../../../auth/types'
import {
  canCheckoutPatient,
  getDoctorQueueLoad,
  getDoctorVisits,
  getLabQueueCount,
  getLabBatches,
  getNextActionableCandidate,
} from '../utils/patientQueue'
import {
  buildClinicianDirectory,
  buildSpecialtyCatalog,
  getTestCatalog,
  normalizeSpecialty,
} from './clinicianDirectory'
import {
  attachPatientNote,
  checkInPatient,
  deletePatient,
  getHospitalStreamUrl,
  getPatientDetails as fetchPatientDetailsFromApi,
  HospitalApiError,
  listPatients,
  patchPatient,
} from './hospitalApi'
import {
  getPatientOverlay,
  loadOverlayStore,
  pruneOverlayStore,
  removePatientOverlay,
  saveOverlayStore,
} from './hospitalOverlay'
import type {
  AddAssignmentsInput,
  AssignmentCode,
  BackendPatientCore,
  BackendPatientDetails,
  CatalogOption,
  CheckInPatientInput,
  DoctorProfile,
  HospitalMutationResult,
  HospitalSnapshot,
  Patient,
  PatientAgendaEntry,
  PatientLabBatch,
  PatientLabItem,
  PatientMutationActor,
  PatientNote,
  UpdatePatientCoreInput,
  WorkspaceNotification,
} from '../types/patient'

const detailCache = new Map<string, BackendPatientDetails>()

function normalizeValue(value: string) {
  return value.trim().toLowerCase()
}

export function normalizeBackendCode(code: BackendPatientCore['triageState']): AssignmentCode {
  return code === 'GREEN' ? 'GREEN' : 'YELLOW'
}

function toBackendCode(code: AssignmentCode): 'GREEN' | 'YELLOW' {
  return code
}

function timestamp(value: string) {
  return new Date(value).getTime()
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
  }
}

function cloneLabItem(item: PatientLabItem): PatientLabItem {
  return {
    ...item,
  }
}

function cloneAgendaEntry(entry: PatientAgendaEntry): PatientAgendaEntry {
  if (entry.entryType === 'lab_batch') {
    return {
      ...entry,
      items: entry.items.map(cloneLabItem),
    }
  }

  return {
    ...entry,
  }
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
    agenda: patient.agenda.map(cloneAgendaEntry),
    notes: patient.notes.map((note) => ({ ...note })),
    overlay: {
      agenda: patient.overlay.agenda.map(cloneAgendaEntry),
    },
  }
}

function cloneSnapshot(snapshot: HospitalSnapshot): HospitalSnapshot {
  return {
    doctors: snapshot.doctors.map(cloneDoctor),
    notifications: snapshot.notifications.map(cloneNotification),
    patients: snapshot.patients.map(clonePatient),
  }
}

function ensureFilled(value: string, label: string) {
  if (value.trim().length === 0) {
    throw new Error(`${label} is required.`)
  }
}

function validatePatientName(name: string) {
  ensureFilled(name, 'Name')

  if (name.trim().length < 2) {
    throw new Error('Name must be at least 2 characters.')
  }
}

function validatePhoneNumber(phoneNumber: string) {
  ensureFilled(phoneNumber, 'Phone number')

  const digitsOnly = phoneNumber.replace(/\D/g, '')

  if (digitsOnly.length < 7 || !/^\+?[0-9\s()-]+$/.test(phoneNumber.trim())) {
    throw new Error('Phone number must be valid.')
  }
}

function validateCode(code: AssignmentCode) {
  if (code !== 'GREEN' && code !== 'YELLOW') {
    throw new Error('Code must be Green or Yellow.')
  }
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

function getLastUpdatedAt(core: BackendPatientCore, agenda: PatientAgendaEntry[]) {
  return new Date(
    agenda.reduce((latest, entry) => Math.max(latest, timestamp(entry.updatedAt)), timestamp(core.admittedAt)),
  ).toISOString()
}

function mergePatient(core: BackendPatientCore, overlayAgenda: PatientAgendaEntry[]): Patient {
  const detail = detailCache.get(core.id) ?? null
  const agenda = overlayAgenda.map(cloneAgendaEntry)

  return {
    admittedAt: core.admittedAt,
    agenda,
    checkedOutAt: null,
    core: {
      ...core,
      notes: [...core.notes],
    },
    defaultCode: normalizeBackendCode(core.triageState),
    detail: detail
      ? {
          ...detail,
          history: detail.history.map((entry) => ({ ...entry })),
          notes: [...detail.notes],
          queue: detail.queue.map((entry) => ({ ...entry })),
        }
      : null,
    id: core.id,
    lastUpdatedAt: getLastUpdatedAt(core, agenda),
    name: core.name,
    notes: buildServerNotes(core),
    overlay: {
      agenda: agenda.map(cloneAgendaEntry),
    },
    phoneNumber: core.phoneNumber,
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
        .filter((patient) => patient.agenda.length > 0)
        .map((patient) => [
          patient.id,
          {
            agenda: patient.agenda.map(cloneAgendaEntry),
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

function findDoctorVisitOrThrow(patient: Patient, visitId: string) {
  const visit = getDoctorVisits(patient).find((candidate) => candidate.id === visitId)

  if (!visit) {
    throw new Error('Visit details are unavailable right now.')
  }

  return visit
}

function findLabBatchOrThrow(patient: Patient, batchId: string) {
  const batch = getLabBatches(patient).find((candidate) => candidate.id === batchId)

  if (!batch) {
    throw new Error('Lab batch details are unavailable right now.')
  }

  return batch
}

function findLabItemOrThrow(batch: PatientLabBatch, itemId: string) {
  const item = batch.items.find((candidate) => candidate.id === itemId)

  if (!item) {
    throw new Error('Lab item details are unavailable right now.')
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

function getDoctorVisitLoadExcludingVisit(patients: Patient[], doctorId: string, excludedVisitId?: string) {
  return patients.reduce((count, patient) => {
    if (patient.checkedOutAt) {
      return count
    }

    return (
      count +
      getDoctorVisits(patient).filter(
        (visit) =>
          visit.assignedDoctorId === doctorId &&
          visit.status !== 'done' &&
          visit.id !== excludedVisitId,
      ).length
    )
  }, 0)
}

function getLabItemLoadExcludingItem(patients: Patient[], doctorId: string, excludedItemId?: string) {
  return patients.reduce((count, patient) => {
    if (patient.checkedOutAt) {
      return count
    }

    return (
      count +
      getLabBatches(patient).reduce(
        (batchCount, batch) =>
          batchCount +
          batch.items.filter(
            (item) =>
              item.assignedDoctorId === doctorId &&
              item.status !== 'taken' &&
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
  excludedVisitId?: string,
) {
  const matchingDoctors = getMatchingDoctors(doctors, specialty).filter((doctor) => !doctor.isTester)

  if (matchingDoctors.length === 0) {
    return null
  }

  return [...matchingDoctors]
    .sort((left, right) => {
      const leftLoad = getDoctorVisitLoadExcludingVisit(patients, left.id, excludedVisitId)
      const rightLoad = getDoctorVisitLoadExcludingVisit(patients, right.id, excludedVisitId)

      if (leftLoad !== rightLoad) {
        return leftLoad - rightLoad
      }

      return left.displayName.localeCompare(right.displayName)
    })[0]
    .id
}

function chooseBestTesterId(
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
      const leftLoad = getLabItemLoadExcludingItem(patients, left.id, excludedItemId)
      const rightLoad = getLabItemLoadExcludingItem(patients, right.id, excludedItemId)

      if (leftLoad !== rightLoad) {
        return leftLoad - rightLoad
      }

      return left.displayName.localeCompare(right.displayName)
    })[0]
    .id
}

function compareByCodeAndTime(
  leftCode: AssignmentCode,
  leftStatus: 'queued' | 'with_staff' | 'not_here' | 'done' | 'taken',
  leftCreatedAt: string,
  leftId: string,
  rightCode: AssignmentCode,
  rightStatus: 'queued' | 'with_staff' | 'not_here' | 'done' | 'taken',
  rightCreatedAt: string,
  rightId: string,
) {
  if (leftStatus === 'with_staff' || rightStatus === 'with_staff') {
    if (leftStatus === rightStatus) {
      return 0
    }

    return leftStatus === 'with_staff' ? -1 : 1
  }

  const leftStatusRank = leftStatus === 'queued' ? 0 : leftStatus === 'not_here' ? 1 : 2
  const rightStatusRank = rightStatus === 'queued' ? 0 : rightStatus === 'not_here' ? 1 : 2

  if (leftStatusRank !== rightStatusRank) {
    return leftStatusRank - rightStatusRank
  }

  const codeDelta =
    (leftCode === 'YELLOW' ? 0 : 1) -
    (rightCode === 'YELLOW' ? 0 : 1)

  if (codeDelta !== 0) {
    return codeDelta
  }

  const createdAtDelta = timestamp(leftCreatedAt) - timestamp(rightCreatedAt)

  if (createdAtDelta !== 0) {
    return createdAtDelta
  }

  return leftId.localeCompare(rightId)
}

function rebalanceDoctorQueueForDoctor(patients: Patient[], doctorId: string) {
  const visits = patients.flatMap((patient) =>
    getDoctorVisits(patient).filter(
      (visit) => visit.assignedDoctorId === doctorId && visit.status !== 'done',
    ),
  )

  const currentVisit =
    [...visits]
      .filter((visit) => visit.status === 'with_staff')
      .sort((left, right) => timestamp(right.updatedAt) - timestamp(left.updatedAt))[0] ?? null

  visits
    .filter((visit) => visit.id !== currentVisit?.id)
    .forEach((visit) => {
      if (visit.status === 'with_staff') {
        visit.status = 'queued'
      }
    })

  if (currentVisit) {
    currentVisit.queueOrder = 0
  }

  visits
    .filter((visit) => visit.id !== currentVisit?.id)
    .sort((left, right) =>
      compareByCodeAndTime(
        left.code,
        left.status,
        left.createdAt,
        left.id,
        right.code,
        right.status,
        right.createdAt,
        right.id,
      ),
    )
    .forEach((visit, index) => {
      visit.queueOrder = index + 1
    })
}

function rebalanceLabQueueForDoctor(patients: Patient[], doctorId: string) {
  const items = patients.flatMap((patient) =>
    getLabBatches(patient).flatMap((batch) =>
      batch.items.filter((item) => item.assignedDoctorId === doctorId && item.status !== 'taken'),
    ),
  )

  const currentItem =
    [...items]
      .filter((item) => item.status === 'with_staff')
      .sort((left, right) => timestamp(right.updatedAt) - timestamp(left.updatedAt))[0] ?? null

  items
    .filter((item) => item.id !== currentItem?.id)
    .forEach((item) => {
      if (item.status === 'with_staff') {
        item.status = 'queued'
      }
    })

  if (currentItem) {
    currentItem.queueOrder = 0
  }

  items
    .filter((item) => item.id !== currentItem?.id)
    .sort((left, right) =>
      compareByCodeAndTime(
        left.code,
        left.status,
        left.createdAt,
        left.id,
        right.code,
        right.status,
        right.createdAt,
        right.id,
      ),
    )
    .forEach((item, index) => {
      item.queueOrder = index + 1
    })
}

function reconcileAssignments(doctors: DoctorProfile[], patients: Patient[]) {
  patients.forEach((patient) => {
    getDoctorVisits(patient).forEach((visit) => {
      if (visit.status === 'done') {
        return
      }

      if (visit.assignedDoctorId && doctors.some((doctor) => doctor.id === visit.assignedDoctorId && !doctor.isTester)) {
        return
      }

      visit.assignedDoctorId = chooseBestDoctorId(visit.specialty, doctors, patients, visit.id)
    })

    getLabBatches(patient).forEach((batch) => {
      batch.items.forEach((item) => {
        if (item.status === 'taken') {
          return
        }

        if (item.assignedDoctorId && doctors.some((doctor) => doctor.id === item.assignedDoctorId && doctor.isTester)) {
          return
        }

        item.assignedDoctorId = chooseBestTesterId(item.testerSpecialty, doctors, patients, item.id)
      })
    })
  })

  doctors.forEach((doctor) => {
    if (doctor.isTester) {
      rebalanceLabQueueForDoctor(patients, doctor.id)
      return
    }

    rebalanceDoctorQueueForDoctor(patients, doctor.id)
  })
}

function buildNotificationId() {
  return `NT-${crypto.randomUUID()}`
}

function buildDoctorVisitId() {
  return `DV-${crypto.randomUUID()}`
}

function buildLabBatchId() {
  return `LB-${crypto.randomUUID()}`
}

function buildLabItemId() {
  return `LI-${crypto.randomUUID()}`
}

function buildGuidanceKey(patient: Patient | null) {
  if (!patient) {
    return null
  }

  const next = getNextActionableCandidate(patient)

  if (!next) {
    return null
  }

  return `${next.id}:${next.title}:${next.code}`
}

function maybeCreateGuidanceNotification(
  notifications: WorkspaceNotification[],
  beforePatient: Patient | null,
  afterPatient: Patient,
  timestamp: string,
) {
  const beforeKey = buildGuidanceKey(beforePatient)
  const afterCandidate = getNextActionableCandidate(afterPatient)
  const afterKey = buildGuidanceKey(afterPatient)

  if (!afterCandidate || beforeKey === afterKey) {
    return
  }

  notifications.unshift({
    agendaEntryId: afterCandidate.id,
    createdAt: timestamp,
    id: buildNotificationId(),
    message: `${afterPatient.name} should go next to ${afterCandidate.title} with ${afterCandidate.code.toLowerCase()} code.`,
    patientId: afterPatient.id,
    readAt: null,
    targetDoctorId: null,
    targetRole: 'nurse',
    title: 'Guide patient',
    type: 'patient_guidance',
  })
}

function maybeCreateDoctorQueueNotification(
  notifications: WorkspaceNotification[],
  doctors: DoctorProfile[],
  patients: Patient[],
  doctorId: string | null,
  patient: Patient,
  title: string,
  timestamp: string,
  kind: 'doctor' | 'lab',
) {
  if (!doctorId) {
    return
  }

  const targetDoctor = doctors.find((doctor) => doctor.id === doctorId)

  if (!targetDoctor) {
    return
  }

  const currentLoad = targetDoctor.isTester
    ? getLabQueueCount(patients, doctorId)
    : getDoctorQueueLoad(patients, doctorId)

  if (currentLoad !== 0) {
    return
  }

  notifications.unshift({
    agendaEntryId: null,
    createdAt: timestamp,
    id: buildNotificationId(),
    message:
      kind === 'lab'
        ? `${patient.name} was added to your ${title} lab queue.`
        : `${patient.name} was added to your ${title} queue.`,
    patientId: patient.id,
    readAt: null,
    targetDoctorId: doctorId,
    targetRole: 'doctor',
    title: kind === 'lab' ? 'New lab item' : 'New patient',
    type: 'doctor_queue',
  })
}

function getCatalogTestOrThrow(testName: string) {
  const match = getTestCatalog().find((option) => normalizeValue(option.label) === normalizeValue(testName))

  if (!match?.testerSpecialty) {
    throw new Error(`Unknown lab item: ${testName}.`)
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
    patients: corePatients.map((core) => mergePatient(core, getPatientOverlay(store, core.id).agenda)),
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

function persistPatient(patient: Patient) {
  patient.overlay.agenda = patient.agenda.map(cloneAgendaEntry)
  patient.lastUpdatedAt = getLastUpdatedAt(patient.core, patient.agenda)
}

export async function getHospitalSnapshot(activeUser: AuthUser | null): Promise<HospitalSnapshot> {
  return loadSnapshot({
    activeUser,
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
  validateCode(input.defaultCode)
  validateCode(input.firstAssignmentCode)
  ensureFilled(input.firstSpecialty, 'First doctor specialty')

  const createdPatient = await checkInPatient({
    name: input.name.trim(),
    phoneNumber: input.phoneNumber.trim(),
    triageState: toBackendCode(input.defaultCode),
  })

  if (input.notes.trim().length > 0) {
    await attachPatientNote(createdPatient.id, input.notes)
  }

  const snapshot = await loadSnapshot({
    runtimeDoctors: currentDoctors,
  })
  const patient = findPatientOrThrow(snapshot.patients, createdPatient.id)
  const timestamp = new Date().toISOString()
  const assignedDoctorId = chooseBestDoctorId(input.firstSpecialty, snapshot.doctors, snapshot.patients)

  maybeCreateDoctorQueueNotification(
    snapshot.notifications,
    snapshot.doctors,
    snapshot.patients,
    assignedDoctorId,
    patient,
    input.firstSpecialty.trim(),
    timestamp,
    'doctor',
  )

  patient.agenda.push({
    assignedDoctorId,
    blockedByBatchId: null,
    code: input.firstAssignmentCode,
    completedAt: null,
    createdAt: timestamp,
    entryType: 'doctor_visit',
    id: buildDoctorVisitId(),
    isReturnVisit: false,
    note: '',
    queueOrder: 0,
    requestedByLabel: getActorLabel(actor, snapshot.doctors),
    sourceVisitId: null,
    specialty: input.firstSpecialty.trim(),
    status: 'queued',
    updatedAt: timestamp,
  })

  persistPatient(patient)
  reconcileAssignments(snapshot.doctors, snapshot.patients)
  maybeCreateGuidanceNotification(snapshot.notifications, null, patient, timestamp)
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
  validateCode(input.defaultCode)

  await patchPatient(patientId, {
    name: input.name.trim(),
    phoneNumber: input.phoneNumber.trim(),
    triageState: toBackendCode(input.defaultCode),
  })

  if (input.note.trim().length > 0) {
    await attachPatientNote(patientId, input.note)
  }

  const finalSnapshot = await loadSnapshot({
    runtimeDoctors: currentDoctors,
  })

  return buildMutationResult(finalSnapshot, patientId)
}

function resolveSourceVisit(patient: Patient, input: AddAssignmentsInput, actor: PatientMutationActor) {
  if (actor.role !== 'doctor' || actor.isTester) {
    return null
  }

  if (input.sourceVisitId) {
    return findDoctorVisitOrThrow(patient, input.sourceVisitId)
  }

  return (
    getDoctorVisits(patient).find(
      (visit) => visit.assignedDoctorId === actor.doctorId && visit.status === 'with_staff',
    ) ??
    getDoctorVisits(patient).find(
      (visit) => visit.assignedDoctorId === actor.doctorId && visit.status !== 'done',
    ) ??
    null
  )
}

export async function addAssignments(
  _currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  input: AddAssignmentsInput,
  actor: PatientMutationActor,
) {
  if (input.assignments.length === 0) {
    throw new Error('Add at least one next step.')
  }

  input.assignments.forEach((draft) => {
    ensureFilled(draft.label, draft.destinationKind === 'lab' ? 'Lab item' : 'Specialty')
    validateCode(draft.code)
  })

  if ((actor.role === 'registry' || actor.role === 'nurse' || actor.isTester) && input.assignments.some((draft) => draft.destinationKind === 'lab')) {
    throw new Error('Only non-tester doctors can assign lab items.')
  }

  const snapshot = await loadSnapshot({
    runtimeDoctors: currentDoctors,
  })
  const patient = findPatientOrThrow(snapshot.patients, patientId)
  const beforePatient = clonePatient(patient)
  const timestamp = new Date().toISOString()
  const actorLabel = getActorLabel(actor, snapshot.doctors)
  const sourceVisit = resolveSourceVisit(patient, input, actor)
  const doctorDrafts = input.assignments.filter((draft) => draft.destinationKind === 'doctor')
  const labDrafts = input.assignments.filter((draft) => draft.destinationKind === 'lab')

  if (labDrafts.length > 0) {
    if (!sourceVisit || actor.role !== 'doctor' || actor.isTester || sourceVisit.assignedDoctorId !== actor.doctorId) {
      throw new Error('Select one of your own doctor visits before ordering lab work.')
    }

    sourceVisit.completedAt = timestamp
    sourceVisit.status = 'done'
    sourceVisit.updatedAt = timestamp
  }

  const blockingBatchId = labDrafts.length > 0 ? buildLabBatchId() : null

  if (labDrafts.length > 0 && sourceVisit) {
    const items: PatientLabItem[] = labDrafts.map((draft) => {
      const catalogItem = getCatalogTestOrThrow(draft.label)
      const assignedDoctorId = chooseBestTesterId(catalogItem.testerSpecialty, snapshot.doctors, snapshot.patients)

      maybeCreateDoctorQueueNotification(
        snapshot.notifications,
        snapshot.doctors,
        snapshot.patients,
        assignedDoctorId,
        patient,
        catalogItem.label,
        timestamp,
        'lab',
      )

      return {
        assignedDoctorId,
        code: draft.code,
        createdAt: timestamp,
        id: buildLabItemId(),
        queueOrder: 0,
        status: 'queued',
        takenAt: null,
        takenByLabel: null,
        testName: catalogItem.label,
        testerSpecialty: catalogItem.testerSpecialty,
        updatedAt: timestamp,
      }
    })

    patient.agenda.push({
      createdAt: timestamp,
      entryType: 'lab_batch',
      id: blockingBatchId!,
      items,
      note: input.note.trim(),
      orderedByDoctorId: actor.doctorId ?? null,
      orderedByLabel: actorLabel,
      resultsReadyAt: null,
      returnCode: sourceVisit.code,
      returnCreatedAt: null,
      returnDoctorId: sourceVisit.assignedDoctorId,
      returnSpecialty: sourceVisit.specialty,
      sourceVisitId: sourceVisit.id,
      status: 'collecting',
      updatedAt: timestamp,
    })
  }

  doctorDrafts.forEach((draft) => {
    const assignedDoctorId = chooseBestDoctorId(draft.label, snapshot.doctors, snapshot.patients)

    maybeCreateDoctorQueueNotification(
      snapshot.notifications,
      snapshot.doctors,
      snapshot.patients,
      assignedDoctorId,
      patient,
      draft.label.trim(),
      timestamp,
      'doctor',
    )

    patient.agenda.push({
      assignedDoctorId,
      blockedByBatchId: blockingBatchId,
      code: draft.code,
      completedAt: null,
      createdAt: timestamp,
      entryType: 'doctor_visit',
      id: buildDoctorVisitId(),
      isReturnVisit: false,
      note: '',
      queueOrder: 0,
      requestedByLabel: actorLabel,
      sourceVisitId: sourceVisit?.id ?? null,
      specialty: draft.label.trim(),
      status: 'queued',
      updatedAt: timestamp,
    })
  })

  persistPatient(patient)
  reconcileAssignments(snapshot.doctors, snapshot.patients)
  maybeCreateGuidanceNotification(snapshot.notifications, beforePatient, patient, timestamp)
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
  await attachPatientNote(patientId, noteText.trim())

  const snapshot = await loadSnapshot({
    runtimeDoctors: currentDoctors,
  })

  return buildMutationResult(snapshot, patientId)
}

export async function startDoctorVisit(
  _currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  visitId: string,
  actor: PatientMutationActor,
) {
  if (!actor.doctorId || actor.isTester) {
    throw new Error('Only non-tester doctors can start doctor visits.')
  }

  const snapshot = await loadSnapshot({
    runtimeDoctors: currentDoctors,
  })
  const patient = findPatientOrThrow(snapshot.patients, patientId)
  const visit = findDoctorVisitOrThrow(patient, visitId)
  const timestamp = new Date().toISOString()

  if (visit.assignedDoctorId !== actor.doctorId) {
    throw new Error('This visit is not assigned to the current doctor.')
  }

  snapshot.patients.forEach((candidatePatient) => {
    getDoctorVisits(candidatePatient)
      .filter(
        (candidateVisit) =>
          candidateVisit.assignedDoctorId === actor.doctorId &&
          candidateVisit.id !== visit.id &&
          candidateVisit.status === 'with_staff',
      )
      .forEach((candidateVisit) => {
        candidateVisit.status = 'queued'
        candidateVisit.updatedAt = timestamp
      })
  })

  visit.status = 'with_staff'
  visit.updatedAt = timestamp
  persistPatient(patient)
  rebalanceDoctorQueueForDoctor(snapshot.patients, actor.doctorId)
  persistSnapshot(snapshot)

  return buildMutationResult(snapshot, patientId)
}

export async function markDoctorVisitNotHere(
  _currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  visitId: string,
  actor: PatientMutationActor,
) {
  if (!actor.doctorId || actor.isTester) {
    throw new Error('Only non-tester doctors can update doctor visits.')
  }

  const snapshot = await loadSnapshot({
    runtimeDoctors: currentDoctors,
  })
  const patient = findPatientOrThrow(snapshot.patients, patientId)
  const visit = findDoctorVisitOrThrow(patient, visitId)
  const timestamp = new Date().toISOString()

  if (visit.assignedDoctorId !== actor.doctorId || visit.status === 'done') {
    throw new Error('Only active doctor visits can be marked as not here.')
  }

  visit.status = 'not_here'
  visit.updatedAt = timestamp
  persistPatient(patient)
  rebalanceDoctorQueueForDoctor(snapshot.patients, actor.doctorId)
  persistSnapshot(snapshot)

  return buildMutationResult(snapshot, patientId)
}

export async function completeDoctorVisit(
  _currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  visitId: string,
  actor: PatientMutationActor,
) {
  if (!actor.doctorId || actor.isTester) {
    throw new Error('Only non-tester doctors can complete doctor visits.')
  }

  const snapshot = await loadSnapshot({
    runtimeDoctors: currentDoctors,
  })
  const patient = findPatientOrThrow(snapshot.patients, patientId)
  const beforePatient = clonePatient(patient)
  const visit = findDoctorVisitOrThrow(patient, visitId)
  const timestamp = new Date().toISOString()

  if (visit.assignedDoctorId !== actor.doctorId) {
    throw new Error('This visit is not assigned to the current doctor.')
  }

  visit.completedAt = timestamp
  visit.status = 'done'
  visit.updatedAt = timestamp
  persistPatient(patient)

  if (visit.assignedDoctorId) {
    rebalanceDoctorQueueForDoctor(snapshot.patients, visit.assignedDoctorId)
  }

  maybeCreateGuidanceNotification(snapshot.notifications, beforePatient, patient, timestamp)
  persistSnapshot(snapshot)

  return buildMutationResult(snapshot, patientId)
}

export async function startLabItem(
  _currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  batchId: string,
  itemId: string,
  actor: PatientMutationActor,
) {
  if (!actor.doctorId || !actor.isTester) {
    throw new Error('Only tester users can start lab items.')
  }

  const snapshot = await loadSnapshot({
    runtimeDoctors: currentDoctors,
  })
  const patient = findPatientOrThrow(snapshot.patients, patientId)
  const batch = findLabBatchOrThrow(patient, batchId)
  const item = findLabItemOrThrow(batch, itemId)
  const timestamp = new Date().toISOString()

  if (item.assignedDoctorId !== actor.doctorId) {
    throw new Error('This lab item is not assigned to the current tester.')
  }

  snapshot.patients.forEach((candidatePatient) => {
    getLabBatches(candidatePatient).forEach((candidateBatch) => {
      candidateBatch.items
        .filter(
          (candidateItem) =>
            candidateItem.assignedDoctorId === actor.doctorId &&
            candidateItem.id !== item.id &&
            candidateItem.status === 'with_staff',
        )
        .forEach((candidateItem) => {
          candidateItem.status = 'queued'
          candidateItem.updatedAt = timestamp
        })
    })
  })

  item.status = 'with_staff'
  item.updatedAt = timestamp
  batch.updatedAt = timestamp
  persistPatient(patient)
  rebalanceLabQueueForDoctor(snapshot.patients, actor.doctorId)
  persistSnapshot(snapshot)

  return buildMutationResult(snapshot, patientId)
}

export async function markLabItemNotHere(
  _currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  batchId: string,
  itemId: string,
  actor: PatientMutationActor,
) {
  if (!actor.doctorId || !actor.isTester) {
    throw new Error('Only tester users can update lab items.')
  }

  const snapshot = await loadSnapshot({
    runtimeDoctors: currentDoctors,
  })
  const patient = findPatientOrThrow(snapshot.patients, patientId)
  const batch = findLabBatchOrThrow(patient, batchId)
  const item = findLabItemOrThrow(batch, itemId)
  const timestamp = new Date().toISOString()

  if (item.assignedDoctorId !== actor.doctorId || item.status === 'taken') {
    throw new Error('Only active lab items can be marked as not here.')
  }

  item.status = 'not_here'
  item.updatedAt = timestamp
  batch.updatedAt = timestamp
  persistPatient(patient)
  rebalanceLabQueueForDoctor(snapshot.patients, actor.doctorId)
  persistSnapshot(snapshot)

  return buildMutationResult(snapshot, patientId)
}

export async function markLabItemTaken(
  _currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  batchId: string,
  itemId: string,
  actor: PatientMutationActor,
) {
  if (!actor.doctorId || !actor.isTester) {
    throw new Error('Only tester users can complete lab items.')
  }

  const snapshot = await loadSnapshot({
    runtimeDoctors: currentDoctors,
  })
  const patient = findPatientOrThrow(snapshot.patients, patientId)
  const beforePatient = clonePatient(patient)
  const batch = findLabBatchOrThrow(patient, batchId)
  const item = findLabItemOrThrow(batch, itemId)
  const timestamp = new Date().toISOString()

  if (item.assignedDoctorId !== actor.doctorId) {
    throw new Error('This lab item is not assigned to the current tester.')
  }

  if (item.status === 'taken') {
    return buildMutationResult(snapshot, patientId)
  }

  item.status = 'taken'
  item.takenAt = timestamp
  item.takenByLabel = getActorLabel(actor, snapshot.doctors)
  item.updatedAt = timestamp
  batch.updatedAt = timestamp

  if (batch.items.every((candidate) => candidate.status === 'taken')) {
    batch.status = 'waiting_results'
  }

  persistPatient(patient)

  if (item.assignedDoctorId) {
    rebalanceLabQueueForDoctor(snapshot.patients, item.assignedDoctorId)
  }

  maybeCreateGuidanceNotification(snapshot.notifications, beforePatient, patient, timestamp)
  persistSnapshot(snapshot)

  return buildMutationResult(snapshot, patientId)
}

export async function markLabResultsReady(
  _currentPatients: Patient[],
  currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  batchId: string,
  actor: PatientMutationActor,
) {
  if (!actor.doctorId || !actor.isTester) {
    throw new Error('Only tester users can release lab results.')
  }

  const snapshot = await loadSnapshot({
    runtimeDoctors: currentDoctors,
  })
  const patient = findPatientOrThrow(snapshot.patients, patientId)
  const beforePatient = clonePatient(patient)
  const batch = findLabBatchOrThrow(patient, batchId)
  const timestamp = new Date().toISOString()

  if (!batch.items.some((item) => item.assignedDoctorId === actor.doctorId)) {
    throw new Error('This lab batch is not assigned to the current tester.')
  }

  if (batch.status !== 'waiting_results') {
    throw new Error('All lab items must be taken before results can be released.')
  }

  const assignedDoctorId =
    batch.returnDoctorId && snapshot.doctors.some((doctor) => doctor.id === batch.returnDoctorId && !doctor.isTester)
      ? batch.returnDoctorId
      : chooseBestDoctorId(batch.returnSpecialty, snapshot.doctors, snapshot.patients)

  maybeCreateDoctorQueueNotification(
    snapshot.notifications,
    snapshot.doctors,
    snapshot.patients,
    assignedDoctorId,
    patient,
    batch.returnSpecialty,
    timestamp,
    'doctor',
  )

  patient.agenda.push({
    assignedDoctorId,
    blockedByBatchId: null,
    code: batch.returnCode,
    completedAt: null,
    createdAt: timestamp,
    entryType: 'doctor_visit',
    id: buildDoctorVisitId(),
    isReturnVisit: true,
    note: 'Return visit after lab results.',
    queueOrder: 0,
    requestedByLabel: 'Lab results',
    sourceVisitId: batch.sourceVisitId,
    specialty: batch.returnSpecialty,
    status: 'queued',
    updatedAt: timestamp,
  })

  batch.resultsReadyAt = timestamp
  batch.returnCreatedAt = timestamp
  batch.returnDoctorId = assignedDoctorId
  batch.status = 'return_created'
  batch.updatedAt = timestamp
  persistPatient(patient)
  reconcileAssignments(snapshot.doctors, snapshot.patients)
  maybeCreateGuidanceNotification(snapshot.notifications, beforePatient, patient, timestamp)
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
    throw new Error('Patient still has active doctor or lab work.')
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

export function buildUnifiedAssignmentCatalog(doctors: DoctorProfile[]) {
  return [...buildSpecialtyCatalog(doctors), ...getTestCatalog()]
}

export { buildSpecialtyCatalog, getTestCatalog }
