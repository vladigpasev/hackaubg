export type TriageState = 'GREEN' | 'YELLOW' | 'RED'

export type DoctorTaskStatus = 'queued' | 'with_doctor' | 'not_here' | 'done'

export type TestRequestStatus = 'pending' | 'ready_for_return' | 'returned'

export interface BackendPatientCore {
  id: string
  name: string
  phoneNumber: string
  triageState: TriageState
  admittedAt: string
  notes: string[]
}

export interface BackendQueueRecord {
  timestamp: string
  triageState: TriageState
  specialty: string
  referredById: string
}

export interface BackendHistoryRecord {
  referredById: string
  specialty: string
  triageState: TriageState
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

export interface PatientDoctorTask {
  id: string
  type: 'doctor_task' | 'return_to_doctor_task'
  specialty: string
  assignedDoctorId: string | null
  triageState: TriageState
  status: DoctorTaskStatus
  requestedByLabel: string
  note: string
  createdAt: string
  updatedAt: string
  completedAt: string | null
  sourceTaskId: string | null
  queueOrder: number
}

export interface PatientTestItem {
  id: string
  testName: string
  testerSpecialty: string
  assignedDoctorId: string | null
  status: 'pending' | 'done'
  createdAt: string
  updatedAt: string
  completedAt: string | null
  completedByLabel: string | null
}

export interface PatientTestRequest {
  id: string
  type: 'test_request'
  triageState: TriageState
  orderedByDoctorId: string | null
  orderedByLabel: string
  sourceTaskId: string | null
  returnDoctorId: string | null
  returnSpecialty: string
  note: string
  createdAt: string
  updatedAt: string
  status: TestRequestStatus
  items: PatientTestItem[]
  notificationId: string | null
  returnedAt: string | null
}

export type PatientTask = PatientDoctorTask | PatientTestRequest

export interface HybridPatientOverlay {
  tasks: PatientTask[]
}

export interface PatientViewModel {
  id: string
  name: string
  phoneNumber: string
  triageState: TriageState
  admittedAt: string
  notes: PatientNote[]
  tasks: PatientTask[]
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
  label: string
  keywords: string[]
  testerSpecialty?: string
}

export interface NotificationAction {
  patientId: string
  requestId: string
  type: 'send_back_to_doctor'
}

export interface WorkspaceNotification {
  id: string
  targetRole: 'doctor' | 'nurse'
  targetDoctorId: string | null
  type: 'doctor_queue' | 'tests_ready'
  title: string
  message: string
  createdAt: string
  readAt: string | null
  patientId: string | null
  action: NotificationAction | null
}

export interface HospitalSnapshot {
  doctors: DoctorProfile[]
  notifications: WorkspaceNotification[]
  patients: Patient[]
}

export interface DoctorTaskDraft {
  specialty: string
}

export interface QueueDraftItem {
  id: string
  kind: 'specialty' | 'test'
  label: string
  triageState: TriageState
}

export interface CheckInPatientInput {
  initialTasks: DoctorTaskDraft[]
  name: string
  notes: string
  phoneNumber: string
  triageState: TriageState
}

export interface UpdatePatientCoreInput {
  name: string
  note: string
  phoneNumber: string
  triageState: TriageState
}

export interface UpdateDoctorTaskInput {
  specialty: string
}

export interface CreateTestRequestInput {
  note: string
  tests: string[]
}

export interface PatientMutationActor {
  doctorId?: string | null
  role: 'doctor' | 'nurse' | 'registry'
  username: string
}

export interface HospitalMutationResult {
  doctors: DoctorProfile[]
  notifications: WorkspaceNotification[]
  patient: Patient
  patients: Patient[]
}
