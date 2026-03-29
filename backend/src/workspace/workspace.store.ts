import type { RedisClientType } from 'redis';
import type {
  StoredDoctorVisit,
  StoredLabBatch,
  StoredLabItem,
  StoredPatientAgendaEntry,
  StoredPatientNotification,
} from './workspace.types';

const PATIENT_AGENDA_PREFIX = 'patient:agenda:';
const PATIENT_NOTIFICATIONS_PREFIX = 'patient:notifications:';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

function parseStoredLabItem(value: unknown): StoredLabItem | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.testName !== 'string' ||
    typeof value.testerSpecialty !== 'string' ||
    typeof value.code !== 'string' ||
    typeof value.status !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    typeof value.queueOrder !== 'number'
  ) {
    return null;
  }

  return {
    id: value.id,
    testName: value.testName,
    testerSpecialty: value.testerSpecialty,
    assignedDoctorUsername:
      typeof value.assignedDoctorUsername === 'string'
        ? value.assignedDoctorUsername
        : null,
    code: value.code as StoredLabItem['code'],
    status: value.status as StoredLabItem['status'],
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    takenAt: typeof value.takenAt === 'string' ? value.takenAt : null,
    resultsReadyAt:
      typeof value.resultsReadyAt === 'string' ? value.resultsReadyAt : null,
    takenByActorId:
      typeof value.takenByActorId === 'string' ? value.takenByActorId : null,
    takenByLabel:
      typeof value.takenByLabel === 'string' ? value.takenByLabel : null,
    resultsReadyByActorId:
      typeof value.resultsReadyByActorId === 'string'
        ? value.resultsReadyByActorId
        : null,
    resultsReadyByLabel:
      typeof value.resultsReadyByLabel === 'string'
        ? value.resultsReadyByLabel
        : null,
    queueOrder: value.queueOrder,
  };
}

function parseStoredDoctorVisit(value: unknown): StoredDoctorVisit | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    value.entryType !== 'doctor_visit' ||
    typeof value.id !== 'string' ||
    typeof value.specialty !== 'string' ||
    typeof value.requestedByActorId !== 'string' ||
    typeof value.requestedByLabel !== 'string' ||
    typeof value.code !== 'string' ||
    typeof value.status !== 'string' ||
    typeof value.note !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    typeof value.isReturnVisit !== 'boolean' ||
    typeof value.queueOrder !== 'number'
  ) {
    return null;
  }

  return {
    id: value.id,
    entryType: 'doctor_visit',
    specialty: value.specialty,
    requestedByActorId: value.requestedByActorId,
    requestedByLabel: value.requestedByLabel,
    assignedDoctorUsername:
      typeof value.assignedDoctorUsername === 'string'
        ? value.assignedDoctorUsername
        : null,
    code: value.code as StoredDoctorVisit['code'],
    status: value.status as StoredDoctorVisit['status'],
    note: value.note,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    completedAt:
      typeof value.completedAt === 'string' ? value.completedAt : null,
    sourceVisitId:
      typeof value.sourceVisitId === 'string' ? value.sourceVisitId : null,
    blockedByBatchId:
      typeof value.blockedByBatchId === 'string'
        ? value.blockedByBatchId
        : null,
    isReturnVisit: value.isReturnVisit,
    queueOrder: value.queueOrder,
  };
}

function parseStoredLabBatch(value: unknown): StoredLabBatch | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    value.entryType !== 'lab_batch' ||
    typeof value.id !== 'string' ||
    typeof value.status !== 'string' ||
    typeof value.orderedByLabel !== 'string' ||
    typeof value.returnSpecialty !== 'string' ||
    typeof value.returnCode !== 'string' ||
    typeof value.note !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    typeof value.sourceVisitId !== 'string' ||
    !Array.isArray(value.items)
  ) {
    return null;
  }

  const items = value.items
    .map((item) => parseStoredLabItem(item))
    .filter((item): item is StoredLabItem => Boolean(item));

  if (items.length !== value.items.length) {
    return null;
  }

  return {
    id: value.id,
    entryType: 'lab_batch',
    status: value.status as StoredLabBatch['status'],
    orderedByActorId:
      typeof value.orderedByActorId === 'string'
        ? value.orderedByActorId
        : null,
    orderedByLabel: value.orderedByLabel,
    returnDoctorUsername:
      typeof value.returnDoctorUsername === 'string'
        ? value.returnDoctorUsername
        : null,
    returnSpecialty: value.returnSpecialty,
    returnCode: value.returnCode as StoredLabBatch['returnCode'],
    note: value.note,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    resultsReadyAt:
      typeof value.resultsReadyAt === 'string' ? value.resultsReadyAt : null,
    returnCreatedAt:
      typeof value.returnCreatedAt === 'string' ? value.returnCreatedAt : null,
    sourceVisitId: value.sourceVisitId,
    items,
  };
}

function parseStoredPatientAgendaEntry(
  value: unknown,
): StoredPatientAgendaEntry | null {
  if (!isRecord(value) || typeof value.entryType !== 'string') {
    return null;
  }

  if (value.entryType === 'doctor_visit') {
    return parseStoredDoctorVisit(value);
  }

  if (value.entryType === 'lab_batch') {
    return parseStoredLabBatch(value);
  }

  return null;
}

function parseStoredPatientNotification(
  value: unknown,
): StoredPatientNotification | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== 'string' ||
    (value.targetRole !== 'doctor' && value.targetRole !== 'nurse') ||
    (value.targetDoctorUsername !== null &&
      typeof value.targetDoctorUsername !== 'string') ||
    (value.type !== 'doctor_queue' && value.type !== 'patient_guidance') ||
    typeof value.title !== 'string' ||
    typeof value.message !== 'string' ||
    typeof value.createdAt !== 'string' ||
    (value.readAt !== null && typeof value.readAt !== 'string') ||
    (value.patientId !== null && typeof value.patientId !== 'string') ||
    (value.agendaEntryId !== null && typeof value.agendaEntryId !== 'string')
  ) {
    return null;
  }

  return {
    id: value.id,
    targetRole: value.targetRole,
    targetDoctorUsername: value.targetDoctorUsername,
    type: value.type,
    title: value.title,
    message: value.message,
    createdAt: value.createdAt,
    readAt: value.readAt,
    patientId: value.patientId,
    agendaEntryId: value.agendaEntryId,
  };
}

function parseJsonArray<T>(
  rawValue: string | null,
  parseItem: (value: unknown) => T | null,
): T[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue) as unknown;

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    const items = parsedValue
      .map((value) => parseItem(value))
      .filter((item): item is T => Boolean(item));

    return items.length === parsedValue.length ? items : [];
  } catch {
    return [];
  }
}

export function getPatientAgendaKey(patientId: string): string {
  return `${PATIENT_AGENDA_PREFIX}${patientId}`;
}

export function getPatientNotificationsKey(patientId: string): string {
  return `${PATIENT_NOTIFICATIONS_PREFIX}${patientId}`;
}

export async function readStoredPatientAgenda(
  client: RedisClientType,
  patientId: string,
): Promise<StoredPatientAgendaEntry[]> {
  const rawValue = await client.get(getPatientAgendaKey(patientId));
  return parseJsonArray(rawValue, parseStoredPatientAgendaEntry);
}

export async function writeStoredPatientAgenda(
  client: RedisClientType,
  patientId: string,
  agenda: StoredPatientAgendaEntry[],
): Promise<void> {
  await client.set(getPatientAgendaKey(patientId), JSON.stringify(agenda));
}

export async function readStoredPatientNotifications(
  client: RedisClientType,
  patientId: string,
): Promise<StoredPatientNotification[]> {
  const rawValue = await client.get(getPatientNotificationsKey(patientId));
  return parseJsonArray(rawValue, parseStoredPatientNotification);
}

export async function writeStoredPatientNotifications(
  client: RedisClientType,
  patientId: string,
  notifications: StoredPatientNotification[],
): Promise<void> {
  await client.set(
    getPatientNotificationsKey(patientId),
    JSON.stringify(notifications),
  );
}

export function normalizeWorkspaceValue(value: string): string {
  return value.trim().toLowerCase();
}

export function titleCaseWorkspaceValue(value: string): string {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map(
      (segment) =>
        `${segment[0]?.toUpperCase() ?? ''}${segment.slice(1).toLowerCase()}`,
    )
    .join(' ');
}

export function buildDoctorProfileId(username: string): string {
  return `DOC-${normalizeWorkspaceValue(username).replace(/[^a-z0-9]+/g, '-')}`;
}

export function parseStoredStringArray(rawValue: string): string[] {
  try {
    const parsedValue = JSON.parse(rawValue) as unknown;
    return isStringArray(parsedValue)
      ? parsedValue.map((item) => item.trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}
