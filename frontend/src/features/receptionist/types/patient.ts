export type TriageCode = 'unknown' | 'green' | 'yellow'

export type DoctorTaskStatus = 'queued' | 'with_doctor' | 'not_here' | 'done'

export type TestRequestStatus = 'pending' | 'ready_for_return' | 'returned'

export interface PatientNote {
  id: string
  authorLabel: string
  createdAt: string
  text: string
}

export interface PatientDoctorTask {
  id: string
  type: 'doctor_task' | 'return_to_doctor_task'
  specialty: string
  assignedDoctorId: string | null
  code: TriageCode
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
  code: TriageCode
  orderedByDoctorId: string | null
  orderedByLabel: string
  sourceTaskId: string
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

export interface Patient {
  id: string
  name: string
  phoneNumber: string
  admittedAt: string
  notes: PatientNote[]
  tasks: PatientTask[]
  checkedOutAt: string | null
  lastUpdatedAt: string
}

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
  code: TriageCode
}

export interface CheckInPatientInput {
  initialTasks: DoctorTaskDraft[]
  name: string
  notes: string
  phoneNumber: string
}

export interface UpdatePatientCoreInput {
  name: string
  note: string
  phoneNumber: string
}

export interface UpdateDoctorTaskInput {
  code: TriageCode
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
