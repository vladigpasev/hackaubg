import { z } from 'zod';
import type { TriageState } from '../shared.types';

export type AssignmentCode = 'GREEN' | 'YELLOW';
export type BackendTriageState = TriageState;
export type PatientCode = 'GREEN' | 'YELLOW' | 'UNDEFINED';
export type DoctorVisitStatus = 'queued' | 'with_staff' | 'not_here' | 'done';
export type LabItemStatus =
  | 'queued'
  | 'with_staff'
  | 'not_here'
  | 'taken'
  | 'results_ready';
export type LabBatchStatus =
  | 'collecting'
  | 'waiting_results'
  | 'results_ready'
  | 'return_created';

export interface WorkspacePatientCore {
  id: string;
  name: string;
  phoneNumber: string;
  triageState: BackendTriageState;
  admittedAt: string;
  notes: string[];
}

export interface WorkspaceQueueRecord {
  timestamp: string;
  triageState: BackendTriageState;
  specialty: string;
  referredById: string;
}

export interface WorkspaceHistoryRecord {
  referredById: string;
  specialty: string;
  triageState: BackendTriageState;
  referredToId: string;
  isDone: boolean;
  timestamp: string;
}

export interface WorkspacePatientDetails extends WorkspacePatientCore {
  history: WorkspaceHistoryRecord[];
  queue: WorkspaceQueueRecord[];
}

export interface PatientNote {
  id: string;
  authorLabel: string;
  createdAt: string;
  source: 'server';
  text: string;
}

export interface PatientDoctorVisit {
  id: string;
  entryType: 'doctor_visit';
  specialty: string;
  assignedDoctorId: string | null;
  code: AssignmentCode;
  status: DoctorVisitStatus;
  requestedByLabel: string;
  note: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  sourceVisitId: string | null;
  blockedByBatchId: string | null;
  isReturnVisit: boolean;
  queueOrder: number;
}

export interface PatientLabItem {
  id: string;
  testName: string;
  testerSpecialty: string;
  assignedDoctorId: string | null;
  code: AssignmentCode;
  status: LabItemStatus;
  createdAt: string;
  updatedAt: string;
  takenAt: string | null;
  resultsReadyAt: string | null;
  takenByLabel: string | null;
  queueOrder: number;
}

export interface PatientLabBatch {
  id: string;
  entryType: 'lab_batch';
  status: LabBatchStatus;
  orderedByDoctorId: string | null;
  orderedByLabel: string;
  returnDoctorId: string | null;
  returnSpecialty: string;
  returnCode: AssignmentCode;
  note: string;
  createdAt: string;
  updatedAt: string;
  resultsReadyAt: string | null;
  returnCreatedAt: string | null;
  sourceVisitId: string;
  items: PatientLabItem[];
}

export type PatientAgendaEntry = PatientDoctorVisit | PatientLabBatch;

export interface HybridPatientOverlay {
  agenda: PatientAgendaEntry[];
}

export interface Patient {
  id: string;
  name: string;
  phoneNumber: string;
  defaultCode: AssignmentCode;
  admittedAt: string;
  notes: PatientNote[];
  agenda: PatientAgendaEntry[];
  checkedOutAt: string | null;
  core: WorkspacePatientCore;
  detail: WorkspacePatientDetails | null;
  lastUpdatedAt: string;
  overlay: HybridPatientOverlay;
}

export interface DoctorProfile {
  id: string;
  username: string;
  displayName: string;
  specialties: string[];
  isTester: boolean;
}

export interface CatalogOption {
  id: string;
  kind: 'doctor' | 'lab';
  label: string;
  keywords: string[];
  testerSpecialty?: string;
}

export interface WorkspaceNotification {
  id: string;
  targetRole: 'doctor' | 'nurse';
  targetDoctorId: string | null;
  type: 'doctor_queue' | 'patient_guidance';
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
  patientId: string | null;
  agendaEntryId: string | null;
}

export interface HospitalSnapshot {
  doctors: DoctorProfile[];
  notifications: WorkspaceNotification[];
  patients: Patient[];
}

export interface HospitalMutationResult {
  doctors: DoctorProfile[];
  notifications: WorkspaceNotification[];
  patient: Patient;
  patients: Patient[];
}

export interface WorkspaceCatalogs {
  specialties: CatalogOption[];
  labTests: CatalogOption[];
}

export interface WorkspaceBootstrapResponse {
  snapshot: HospitalSnapshot;
  catalogs: WorkspaceCatalogs;
}

export interface StoredPatientNotification {
  id: string;
  targetRole: 'doctor' | 'nurse';
  targetDoctorUsername: string | null;
  type: 'doctor_queue' | 'patient_guidance';
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
  patientId: string | null;
  agendaEntryId: string | null;
}

export interface StoredDoctorVisit {
  id: string;
  entryType: 'doctor_visit';
  specialty: string;
  requestedByActorId: string;
  requestedByLabel: string;
  assignedDoctorUsername: string | null;
  code: AssignmentCode;
  status: DoctorVisitStatus;
  note: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  sourceVisitId: string | null;
  blockedByBatchId: string | null;
  isReturnVisit: boolean;
  queueOrder: number;
}

export interface StoredLabItem {
  id: string;
  testName: string;
  testerSpecialty: string;
  assignedDoctorUsername: string | null;
  code: AssignmentCode;
  status: LabItemStatus;
  createdAt: string;
  updatedAt: string;
  takenAt: string | null;
  resultsReadyAt: string | null;
  takenByActorId: string | null;
  takenByLabel: string | null;
  queueOrder: number;
}

export interface StoredLabBatch {
  id: string;
  entryType: 'lab_batch';
  status: LabBatchStatus;
  orderedByActorId: string | null;
  orderedByLabel: string;
  returnDoctorUsername: string | null;
  returnSpecialty: string;
  returnCode: AssignmentCode;
  note: string;
  createdAt: string;
  updatedAt: string;
  resultsReadyAt: string | null;
  returnCreatedAt: string | null;
  sourceVisitId: string;
  items: StoredLabItem[];
}

export type StoredPatientAgendaEntry = StoredDoctorVisit | StoredLabBatch;

export const assignmentCodeSchema = z.enum(['GREEN', 'YELLOW']);

export const assignmentDraftSchema = z
  .object({
    destinationKind: z.enum(['doctor', 'lab']),
    id: z.string().trim().min(1).optional(),
    label: z.string().trim().min(1, 'label is required'),
    code: assignmentCodeSchema,
  })
  .strict();

export const addAssignmentsPayloadSchema = z
  .object({
    assignments: z
      .array(assignmentDraftSchema)
      .min(1, 'at least one assignment is required'),
    note: z.string().default(''),
    sourceVisitId: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

export const workspaceNotePayloadSchema = z
  .object({
    note: z.string().trim().min(1, 'note is required'),
  })
  .strict();

export type AddAssignmentsPayloadI = z.infer<
  typeof addAssignmentsPayloadSchema
>;
export type WorkspaceNotePayloadI = z.infer<typeof workspaceNotePayloadSchema>;
