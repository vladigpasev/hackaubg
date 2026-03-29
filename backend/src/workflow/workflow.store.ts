import type { RedisClientType } from 'redis';
import type { PatientDetailsResponseI } from '../patient/patient.dto';
import type { HistoryRecordI, QueueRecordI } from '../patient/patient.type';
import { TRIAGE_STATES, type TriageState } from '../shared.types';
import {
  type QueueSnapshotEventI,
  type StoredHistoryRecordI,
  type StoredPatientRecordI,
  TRIAGE_PRIORITIES,
} from './workflow.types';

const PATIENT_QUEUE_PREFIX = 'patient:queue:';
const PATIENT_RECORD_PREFIX = 'patient:record:';
const PATIENT_CURRENT_PREFIX = 'patient:current:';
const DOCTOR_CURRENT_PATIENT_PREFIX = 'doctor:currentPatient:';
const DOCTOR_OFFLINE_PREFIX = 'doctor:offline:';

export function getPatientQueueKey(patientId: string): string {
  return `${PATIENT_QUEUE_PREFIX}${patientId}`;
}

export function getPatientRecordKey(patientId: string): string {
  return `${PATIENT_RECORD_PREFIX}${patientId}`;
}

export function getPatientCurrentAssignmentKey(patientId: string): string {
  return `${PATIENT_CURRENT_PREFIX}${patientId}`;
}

export function getDoctorCurrentPatientKey(username: string): string {
  return `${DOCTOR_CURRENT_PATIENT_PREFIX}${username}`;
}

export function getDoctorOfflineKey(username: string): string {
  return `${DOCTOR_OFFLINE_PREFIX}${username}`;
}

export function parseDoctorSpecialties(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  } catch {
    return [];
  }
}

export function getTriagePriority(triageState: TriageState): number {
  return TRIAGE_PRIORITIES[triageState];
}

export function serializeQueueRecord(record: QueueRecordI): string {
  return JSON.stringify({
    ...record,
    timestamp: record.timestamp.toISOString(),
  });
}

export function parseQueueRecord(
  value: unknown,
  fallbackTimestamp?: number,
): QueueRecordI | null {
  if (!isObject(value)) {
    return null;
  }

  if (
    !isTriageState(value.triage_state) ||
    typeof value.specialty !== 'string' ||
    typeof value.reffered_by_id !== 'string'
  ) {
    return null;
  }

  const timestamp = parseDate(value.timestamp, fallbackTimestamp);

  if (!timestamp) {
    return null;
  }

  return {
    timestamp,
    triage_state: value.triage_state,
    specialty: value.specialty,
    reffered_by_id: value.reffered_by_id,
  };
}

export function parseQueueRecordString(
  value: string,
  fallbackTimestamp?: number,
): QueueRecordI | null {
  try {
    return parseQueueRecord(JSON.parse(value) as unknown, fallbackTimestamp);
  } catch {
    return null;
  }
}

export function parseStoredPatientRecord(
  value: unknown,
): StoredPatientRecordI | null {
  if (!isObject(value)) {
    return null;
  }

  const history = Array.isArray(value.history)
    ? value.history
        .map((entry) => parseStoredHistoryRecord(entry))
        .filter((entry): entry is StoredHistoryRecordI => Boolean(entry))
    : [];

  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.phone_number !== 'string' ||
    !isTriageState(value.triage_state) ||
    typeof value.admitted_at !== 'string' ||
    !Array.isArray(value.notes) ||
    !value.notes.every((note) => typeof note === 'string')
  ) {
    return null;
  }

  if (
    history.length !== (Array.isArray(value.history) ? value.history.length : 0)
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    phone_number: value.phone_number,
    triage_state: value.triage_state,
    admitted_at: value.admitted_at,
    notes: value.notes,
    history,
  };
}

export function parseStoredPatientRecordString(
  value: string,
): StoredPatientRecordI | null {
  try {
    return parseStoredPatientRecord(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

export function hydratePatientRecord(
  record: StoredPatientRecordI,
  queue: QueueRecordI[],
): PatientDetailsResponseI {
  return {
    id: record.id,
    name: record.name,
    phone_number: record.phone_number,
    triage_state: record.triage_state,
    admitted_at: new Date(record.admitted_at),
    notes: [...record.notes],
    history: record.history.map((entry) => hydrateHistoryRecord(entry)),
    queue,
  };
}

export function serializePatientRecord(
  record: PatientDetailsResponseI,
): StoredPatientRecordI {
  return {
    id: record.id,
    name: record.name,
    phone_number: record.phone_number,
    triage_state: record.triage_state,
    admitted_at: record.admitted_at.toISOString(),
    notes: [...record.notes],
    history: record.history.map((entry) => serializeHistoryRecord(entry)),
  };
}

export async function readPatientQueue(
  client: RedisClientType,
  patientId: string,
): Promise<QueueRecordI[]> {
  const queueRecords = await client.zRangeWithScores(
    getPatientQueueKey(patientId),
    0,
    -1,
  );

  return queueRecords
    .map(({ value, score }) => parseQueueRecordString(value, score))
    .filter((entry): entry is QueueRecordI => Boolean(entry));
}

export async function readCurrentAssignment(
  client: RedisClientType,
  patientId: string,
): Promise<QueueRecordI | null> {
  const rawAssignment = await client.get(
    getPatientCurrentAssignmentKey(patientId),
  );

  if (!rawAssignment) {
    return null;
  }

  return parseQueueRecordString(rawAssignment);
}

export function buildQueueSnapshotEvent(
  patientId: string,
  queue: QueueRecordI[],
): QueueSnapshotEventI {
  return {
    id: patientId,
    queue,
  };
}

function serializeHistoryRecord(record: HistoryRecordI): StoredHistoryRecordI {
  return {
    ...record,
    timestamp: record.timestamp.toISOString(),
  };
}

function hydrateHistoryRecord(record: StoredHistoryRecordI): HistoryRecordI {
  return {
    ...record,
    timestamp: new Date(record.timestamp),
  };
}

function parseStoredHistoryRecord(value: unknown): StoredHistoryRecordI | null {
  if (!isObject(value)) {
    return null;
  }

  if (
    typeof value.reffered_by_id !== 'string' ||
    typeof value.specialty !== 'string' ||
    !isTriageState(value.triage_state) ||
    typeof value.reffered_to_id !== 'string' ||
    typeof value.is_done !== 'boolean' ||
    typeof value.timestamp !== 'string'
  ) {
    return null;
  }

  const timestamp = new Date(value.timestamp);

  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  return {
    reffered_by_id: value.reffered_by_id,
    specialty: value.specialty,
    triage_state: value.triage_state,
    reffered_to_id: value.reffered_to_id,
    is_done: value.is_done,
    timestamp: value.timestamp,
  };
}

function parseDate(value: unknown, fallbackTimestamp?: number): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string') {
    const parsedDate = new Date(value);

    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  if (typeof fallbackTimestamp === 'number') {
    const parsedDate = new Date(fallbackTimestamp);

    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  return null;
}

function isTriageState(value: unknown): value is TriageState {
  return (
    typeof value === 'string' && TRIAGE_STATES.includes(value as TriageState)
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
