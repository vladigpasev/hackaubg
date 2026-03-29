import type {
  AssignmentCode,
  PatientDoctorVisit,
  PatientLabBatch,
  StoredDoctorVisit,
  StoredLabBatch,
  StoredPatientAgendaEntry,
  WorkspacePatientCore,
  WorkspacePatientDetails,
} from './workspace.types';

function timestamp(value: string): number {
  return new Date(value).getTime();
}

export function codeToTriageState(code: AssignmentCode): 'GREEN' | 'YELLOW' {
  return code;
}

export function triageToAssignmentCode(
  triageState: 'GREEN' | 'YELLOW' | 'RED',
): AssignmentCode {
  return triageState === 'GREEN' ? 'GREEN' : 'YELLOW';
}

export function getDoctorVisits(
  agenda: StoredPatientAgendaEntry[],
): StoredDoctorVisit[] {
  return agenda.filter(
    (entry): entry is StoredDoctorVisit => entry.entryType === 'doctor_visit',
  );
}

export function getLabBatches(
  agenda: StoredPatientAgendaEntry[],
): StoredLabBatch[] {
  return agenda.filter(
    (entry): entry is StoredLabBatch => entry.entryType === 'lab_batch',
  );
}

function getBlockingBatch(
  agenda: StoredPatientAgendaEntry[],
  blockedByBatchId: string | null,
): StoredLabBatch | null {
  if (!blockedByBatchId) {
    return null;
  }

  return (
    getLabBatches(agenda).find((batch) => batch.id === blockedByBatchId) ?? null
  );
}

export function isVisitBlocked(
  agenda: StoredPatientAgendaEntry[],
  visit: StoredDoctorVisit,
): boolean {
  const blockingBatch = getBlockingBatch(agenda, visit.blockedByBatchId);
  return blockingBatch?.status === 'collecting';
}

export function getPendingDoctorVisits(
  agenda: StoredPatientAgendaEntry[],
): StoredDoctorVisit[] {
  return getDoctorVisits(agenda).filter(
    (visit) => visit.status !== 'done' && !isVisitBlocked(agenda, visit),
  );
}

export function getCollectingLabBatches(
  agenda: StoredPatientAgendaEntry[],
): StoredLabBatch[] {
  return getLabBatches(agenda).filter((batch) => batch.status === 'collecting');
}

export function buildServerNotes(core: WorkspacePatientCore) {
  return core.notes.map((text, index) => ({
    id: `server-note:${core.id}:${index}`,
    authorLabel: 'Server note' as const,
    createdAt: core.admittedAt,
    source: 'server' as const,
    text,
  }));
}

export function canCheckoutStoredAgenda(
  agenda: StoredPatientAgendaEntry[],
): boolean {
  return (
    getDoctorVisits(agenda).every((visit) => visit.status === 'done') &&
    getLabBatches(agenda).every((batch) => batch.status === 'return_created')
  );
}

export function projectPatientDetailsFromAgenda(
  core: WorkspacePatientCore,
  agenda: StoredPatientAgendaEntry[],
): WorkspacePatientDetails {
  const queue = [
    ...getPendingDoctorVisits(agenda).map((visit) => ({
      timestamp: visit.createdAt,
      triageState: codeToTriageState(visit.code),
      specialty: visit.specialty,
      referredById: visit.requestedByActorId,
    })),
    ...getCollectingLabBatches(agenda).flatMap((batch) =>
      batch.items
        .filter(
          (item) => item.status !== 'taken' && item.status !== 'results_ready',
        )
        .map((item) => ({
          timestamp: item.createdAt,
          triageState: codeToTriageState(item.code),
          specialty: item.testName,
          referredById: batch.orderedByActorId ?? 'system',
        })),
    ),
  ].sort(
    (left, right) => timestamp(left.timestamp) - timestamp(right.timestamp),
  );

  const history = [
    ...getDoctorVisits(agenda)
      .filter((visit) => visit.status === 'done')
      .map((visit) => ({
        referredById: visit.requestedByActorId,
        specialty: visit.specialty,
        triageState: codeToTriageState(visit.code),
        referredToId: visit.assignedDoctorUsername ?? 'unassigned',
        isDone: true,
        timestamp: visit.completedAt ?? visit.updatedAt,
      })),
    ...getLabBatches(agenda).flatMap((batch) =>
      batch.items.map((item) => ({
        referredById: batch.orderedByActorId ?? 'system',
        specialty: item.testName,
        triageState: codeToTriageState(item.code),
        referredToId: item.assignedDoctorUsername ?? item.testerSpecialty,
        isDone: batch.status === 'return_created',
        timestamp:
          batch.returnCreatedAt ??
          batch.resultsReadyAt ??
          item.resultsReadyAt ??
          item.takenAt ??
          item.updatedAt,
      })),
    ),
  ].sort(
    (left, right) => timestamp(left.timestamp) - timestamp(right.timestamp),
  );

  return {
    ...core,
    history,
    queue,
  };
}

export function toPatientDoctorVisit(
  visit: StoredDoctorVisit,
  assignedDoctorId: string | null,
): PatientDoctorVisit {
  return {
    id: visit.id,
    entryType: 'doctor_visit',
    specialty: visit.specialty,
    assignedDoctorId,
    code: visit.code,
    status: visit.status,
    requestedByLabel: visit.requestedByLabel,
    note: visit.note,
    createdAt: visit.createdAt,
    updatedAt: visit.updatedAt,
    completedAt: visit.completedAt,
    sourceVisitId: visit.sourceVisitId,
    blockedByBatchId: visit.blockedByBatchId,
    isReturnVisit: visit.isReturnVisit,
    queueOrder: visit.queueOrder,
  };
}

export function toPatientLabBatch(
  batch: StoredLabBatch,
  orderedByDoctorId: string | null,
  returnDoctorId: string | null,
  itemDoctorIds: Map<string, string | null>,
): PatientLabBatch {
  return {
    id: batch.id,
    entryType: 'lab_batch',
    status: batch.status,
    orderedByDoctorId,
    orderedByLabel: batch.orderedByLabel,
    returnDoctorId,
    returnSpecialty: batch.returnSpecialty,
    returnCode: batch.returnCode,
    note: batch.note,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
    resultsReadyAt: batch.resultsReadyAt,
    returnCreatedAt: batch.returnCreatedAt,
    sourceVisitId: batch.sourceVisitId,
    items: batch.items.map((item) => ({
      id: item.id,
      testName: item.testName,
      testerSpecialty: item.testerSpecialty,
      assignedDoctorId: itemDoctorIds.get(item.id) ?? null,
      code: item.code,
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      takenAt: item.takenAt,
      resultsReadyAt: item.resultsReadyAt,
      takenByLabel: item.takenByLabel,
      queueOrder: item.queueOrder,
    })),
  };
}
