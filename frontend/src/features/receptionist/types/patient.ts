export type BackendTriageState = 'GREEN' | 'YELLOW' | 'RED'

export type PatientCode = 'GREEN' | 'YELLOW' | 'UNDEFINED'

export type AssignmentCode = 'GREEN' | 'YELLOW'

export type DoctorVisitStatus = 'queued' | 'with_staff' | 'not_here' | 'done'

export type LabItemStatus = 'queued' | 'with_staff' | 'not_here' | 'taken' | 'results_ready'

export type LabBatchStatus = 'collecting' | 'waiting_results' | 'results_ready' | 'return_created'

export interface BackendPatientCore {
  id: string
  name: string
  phoneNumber: string
  triageState: BackendTriageState
  admittedAt: string
  notes: string[]
}

export interface BackendQueueRecord {
  timestamp: string
  triageState: BackendTriageState
  specialty: string
  referredById: string
}

export interface BackendHistoryRecord {
  referredById: string
  specialty: string
  triageState: BackendTriageState
  referredToId: string
  isDone: boolean
  timestamp: string
}

export interface BackendPatientDetails extends BackendPatientCore {
  history: BackendHistoryRecord[]
  queue: BackendQueueRecord[]
}

export interface PatientNote {
  id: string
  authorLabel: string
  createdAt: string
  source: 'server'
  text: string
}

export interface PatientDoctorVisit {
  id: string
  entryType: 'doctor_visit'
  specialty: string
  assignedDoctorId: string | null
  code: AssignmentCode
  status: DoctorVisitStatus
  requestedByLabel: string
  note: string
  createdAt: string
  updatedAt: string
  completedAt: string | null
  sourceVisitId: string | null
  blockedByBatchId: string | null
  isReturnVisit: boolean
  queueOrder: number
}

export interface PatientLabItem {
  id: string
  testName: string
  testerSpecialty: string
  assignedDoctorId: string | null
  code: AssignmentCode
  status: LabItemStatus
  createdAt: string
  updatedAt: string
  takenAt: string | null
  resultsReadyAt: string | null
  takenByLabel: string | null
  queueOrder: number
}

export interface PatientLabBatch {
  id: string
  entryType: 'lab_batch'
  status: LabBatchStatus
  orderedByDoctorId: string | null
  orderedByLabel: string
  returnDoctorId: string | null
  returnSpecialty: string
  returnCode: AssignmentCode
  note: string
  createdAt: string
  updatedAt: string
  resultsReadyAt: string | null
  returnCreatedAt: string | null
  sourceVisitId: string
  items: PatientLabItem[]
}

export type PatientAgendaEntry = PatientDoctorVisit | PatientLabBatch

export interface HybridPatientOverlay {
  agenda: PatientAgendaEntry[]
}

export interface PatientViewModel {
  id: string
  name: string
  phoneNumber: string
  defaultCode: AssignmentCode
  admittedAt: string
  notes: PatientNote[]
  agenda: PatientAgendaEntry[]
  checkedOutAt: string | null
  core: BackendPatientCore
  detail: BackendPatientDetails | null
  lastUpdatedAt: string
  overlay: HybridPatientOverlay
}

export type Patient = PatientViewModel

export interface DoctorProfile {
  id: string
  username: string
  displayName: string
  specialties: string[]
  isTester: boolean
}

export interface CatalogOption {
  id: string
  kind: 'doctor' | 'lab'
  label: string
  keywords: string[]
  testerSpecialty?: string
}

export interface WorkspaceNotification {
  id: string
  targetRole: 'doctor' | 'nurse'
  targetDoctorId: string | null
  type: 'doctor_queue' | 'patient_guidance'
  title: string
  message: string
  createdAt: string
  readAt: string | null
  patientId: string | null
  agendaEntryId: string | null
}

export interface HospitalSnapshot {
  doctors: DoctorProfile[]
  notifications: WorkspaceNotification[]
  patients: Patient[]
}

export interface CheckInPatientInput {
  name: string
  notes: string
  phoneNumber: string
  defaultCode: AssignmentCode
  firstAssignmentCode: AssignmentCode
  firstSpecialty: string
}

export interface UpdatePatientCoreInput {
  name: string
  note: string
  phoneNumber: string
  defaultCode: AssignmentCode
}

export interface AssignmentDraft {
  id: string
  destinationKind: 'doctor' | 'lab'
  label: string
  code: AssignmentCode
}

export interface AddAssignmentsInput {
  assignments: AssignmentDraft[]
  note: string
  sourceVisitId?: string | null
}

export interface PatientMutationActor {
  doctorId?: string | null
  isTester?: boolean
  role: 'doctor' | 'nurse' | 'registry'
  username: string
}

export interface HospitalMutationResult {
  doctors: DoctorProfile[]
  notifications: WorkspaceNotification[]
  patient: Patient
  patients: Patient[]
}
