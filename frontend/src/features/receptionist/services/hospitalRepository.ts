import type { AuthUser } from '../../../auth/types'
import {
  addAssignmentsOnServer,
  addPatientNoteOnServer,
  checkInPatient,
  completeDoctorVisitOnServer,
  deletePatient,
  fetchWorkspaceBootstrap,
  getHospitalStreamUrl,
  getPatientDetails as fetchPatientDetailsFromApi,
  HospitalApiError,
  markDoctorVisitNotHereOnServer,
  markLabItemNotHereOnServer,
  markLabItemResultsReadyOnServer,
  markLabItemTakenOnServer,
  markLabResultsReadyOnServer,
  markNotificationReadOnServer,
  patchPatient,
  startDoctorVisitOnServer,
  startLabItemOnServer,
} from './hospitalApi'
import type {
  AssignmentCode,
  CatalogOption,
  CheckInPatientInput,
  DoctorProfile,
  HospitalMutationResult,
  HospitalSnapshot,
  Patient,
  PatientMutationActor,
  UpdatePatientCoreInput,
  WorkspaceNotification,
} from '../types/patient'

let cachedSpecialtyCatalog: CatalogOption[] = []
let cachedLabCatalog: CatalogOption[] = []

function cloneCatalogOption(option: CatalogOption): CatalogOption {
  return {
    ...option,
    keywords: [...option.keywords],
  }
}

function updateCatalogCache(payload: { specialties: CatalogOption[]; labTests: CatalogOption[] }) {
  cachedSpecialtyCatalog = payload.specialties.map(cloneCatalogOption)
  cachedLabCatalog = payload.labTests.map(cloneCatalogOption)
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

function clonePatient(patient: Patient): Patient {
  return {
    ...patient,
    agenda: patient.agenda.map((entry) =>
      entry.entryType === 'lab_batch'
        ? {
            ...entry,
            items: entry.items.map((item) => ({ ...item })),
          }
        : { ...entry },
    ),
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
      agenda: patient.overlay.agenda.map((entry) =>
        entry.entryType === 'lab_batch'
          ? {
              ...entry,
              items: entry.items.map((item) => ({ ...item })),
            }
          : { ...entry },
      ),
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

function buildMutationResult(snapshot: HospitalSnapshot, patientId: string, fallbackPatient?: Patient): HospitalMutationResult {
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

export function normalizeBackendCode(code: 'GREEN' | 'YELLOW' | 'RED'): AssignmentCode {
  return code === 'GREEN' ? 'GREEN' : 'YELLOW'
}

export async function getHospitalSnapshot(activeUser: AuthUser | null): Promise<HospitalSnapshot> {
  void activeUser
  const response = await fetchWorkspaceBootstrap()
  updateCatalogCache(response.catalogs)
  return cloneSnapshot(response.snapshot)
}

export async function prefetchPatientDetails(patientId: string) {
  try {
    await fetchPatientDetailsFromApi(patientId)
  } catch (error) {
    if (error instanceof HospitalApiError && error.status === 404) {
      return
    }

    throw error
  }
}

export function subscribeToHospitalStream(
  activeUser: AuthUser,
  getRuntimeDoctors: () => DoctorProfile[],
  onSnapshot: (snapshot: HospitalSnapshot) => void,
  onError?: (error: Error) => void,
) {
  void activeUser
  void getRuntimeDoctors
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
      const snapshot = await getHospitalSnapshot(null)

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
  eventSource.addEventListener('workspace:refresh', handleStreamEvent)
  eventSource.addEventListener('patient:check-in', handleStreamEvent)
  eventSource.addEventListener('patient:update', handleStreamEvent)
  eventSource.addEventListener('patient:check-out', handleStreamEvent)
  eventSource.onerror = () => {
    void refreshSnapshot()
  }

  return () => {
    isClosed = true
    eventSource.removeEventListener('workspace:refresh', handleStreamEvent)
    eventSource.removeEventListener('patient:check-in', handleStreamEvent)
    eventSource.removeEventListener('patient:update', handleStreamEvent)
    eventSource.removeEventListener('patient:check-out', handleStreamEvent)
    eventSource.close()
  }
}

export async function createPatient(
  _currentPatients: Patient[],
  _currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  input: CheckInPatientInput,
  actor: PatientMutationActor,
) {
  const createdPatient = await checkInPatient({
    name: input.name.trim(),
    phoneNumber: input.phoneNumber.trim(),
    triageState: input.defaultCode,
  })

  if (input.notes.trim().length > 0) {
    await addPatientNoteOnServer(createdPatient.id, input.notes)
  }

  return addAssignmentsOnServer(createdPatient.id, {
    assignments: [
      {
        destinationKind: 'doctor',
        label: input.firstSpecialty.trim(),
        code: input.firstAssignmentCode,
      },
    ],
    note: '',
    sourceVisitId: actor.role === 'doctor' ? null : null,
  })
}

export async function updatePatientCore(
  _currentPatients: Patient[],
  _currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  input: UpdatePatientCoreInput,
  _actor: PatientMutationActor,
) {
  void _actor
  await patchPatient(patientId, {
    name: input.name.trim(),
    phoneNumber: input.phoneNumber.trim(),
    triageState: input.defaultCode,
  })

  if (input.note.trim().length > 0) {
    await addPatientNoteOnServer(patientId, input.note)
  }

  const snapshot = await getHospitalSnapshot(null)
  return buildMutationResult(snapshot, patientId)
}

export async function addAssignments(
  _currentPatients: Patient[],
  _currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  input: {
    assignments: Array<{
      destinationKind: 'doctor' | 'lab'
      id?: string
      label: string
      code: AssignmentCode
    }>
    note: string
    sourceVisitId?: string | null
  },
  _actor: PatientMutationActor,
) {
  void _actor
  return addAssignmentsOnServer(patientId, input)
}

export async function addPatientNote(
  _currentPatients: Patient[],
  _currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  noteText: string,
  _actor: PatientMutationActor,
) {
  void _actor
  return addPatientNoteOnServer(patientId, noteText)
}

export async function startDoctorVisit(
  _currentPatients: Patient[],
  _currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  visitId: string,
  _actor: PatientMutationActor,
) {
  void patientId
  void _actor
  return startDoctorVisitOnServer(visitId)
}

export async function markDoctorVisitNotHere(
  _currentPatients: Patient[],
  _currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  visitId: string,
  _actor: PatientMutationActor,
) {
  void patientId
  void _actor
  return markDoctorVisitNotHereOnServer(visitId)
}

export async function completeDoctorVisit(
  _currentPatients: Patient[],
  _currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  visitId: string,
  _actor: PatientMutationActor,
) {
  void patientId
  void _actor
  return completeDoctorVisitOnServer(visitId)
}

export async function startLabItem(
  _currentPatients: Patient[],
  _currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  batchId: string,
  itemId: string,
  _actor: PatientMutationActor,
) {
  void patientId
  void batchId
  void _actor
  return startLabItemOnServer(itemId)
}

export async function markLabItemNotHere(
  _currentPatients: Patient[],
  _currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  batchId: string,
  itemId: string,
  _actor: PatientMutationActor,
) {
  void patientId
  void batchId
  void _actor
  return markLabItemNotHereOnServer(itemId)
}

export async function markLabItemTaken(
  _currentPatients: Patient[],
  _currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  batchId: string,
  itemId: string,
  _actor: PatientMutationActor,
) {
  void patientId
  void batchId
  void _actor
  return markLabItemTakenOnServer(itemId)
}

export async function markLabItemResultsReady(
  _currentPatients: Patient[],
  _currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  batchId: string,
  itemId: string,
  _actor: PatientMutationActor,
) {
  void patientId
  void batchId
  void _actor
  return markLabItemResultsReadyOnServer(itemId)
}

export async function markLabResultsReady(
  _currentPatients: Patient[],
  _currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
  batchId: string,
  _actor: PatientMutationActor,
) {
  void patientId
  void _actor
  return markLabResultsReadyOnServer(batchId)
}

export async function checkoutPatient(
  currentPatients: Patient[],
  _currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  patientId: string,
) {
  const fallbackPatient = currentPatients.find((candidate) => candidate.id === patientId)

  if (!fallbackPatient) {
    throw new Error('Patient details are unavailable right now.')
  }

  await deletePatient(patientId)
  const snapshot = await getHospitalSnapshot(null)
  return buildMutationResult(
    snapshot,
    patientId,
    {
      ...clonePatient(fallbackPatient),
      checkedOutAt: new Date().toISOString(),
    },
  )
}

export async function markNotificationRead(
  _currentPatients: Patient[],
  _currentDoctors: DoctorProfile[],
  _currentNotifications: WorkspaceNotification[],
  notificationId: string,
) {
  return markNotificationReadOnServer(notificationId)
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

export function buildSpecialtyCatalog(doctors: DoctorProfile[]) {
  void doctors
  return cachedSpecialtyCatalog.map(cloneCatalogOption)
}

export function getTestCatalog() {
  return cachedLabCatalog.map(cloneCatalogOption)
}

export function buildUnifiedAssignmentCatalog(doctors: DoctorProfile[]) {
  void doctors
  return [...buildSpecialtyCatalog([]), ...getTestCatalog()]
}
