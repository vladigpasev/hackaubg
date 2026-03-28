import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { resolve } from 'node:path';
import { RedisService } from 'src/service/redis.service';
import { TRIAGE_STATES } from 'src/shared.types';
import { createJsonArchiver } from 'src/utils/archiver/jsonArchiver';
import {
  AllPatientsI,
  AttachPatientNotePayloadI,
  CheckInPayloadI,
  CheckInResponseI,
  PatientDetailsResponseI,
} from './patient.dto';
import { FullPatientDataI } from './patient.type';

const archiveWriter = createJsonArchiver({
  rootDir: resolve(process.cwd(), 'archives'),
});

@Injectable()
export class PatientService {
  async attachNote(
    patientId: string,
    payload: AttachPatientNotePayloadI,
  ): Promise<void> {
    const client = this.redisService.client;
    const normalizedPatientId = patientId.trim();
    const patientRecordKey = this.getPatientRecordKey(normalizedPatientId);

    try {
      const rawPatientRecord = await client.get(patientRecordKey);

      if (!rawPatientRecord) {
        throw new NotFoundException(
          `Patient with id ${normalizedPatientId} is not checked in`,
        );
      }

      let parsedPatientRecord: unknown;
      try {
        parsedPatientRecord = JSON.parse(rawPatientRecord) as unknown;
      } catch {
        throw new NotFoundException(
          `Patient with id ${normalizedPatientId} has invalid data`,
        );
      }

      if (!this.isObject(parsedPatientRecord)) {
        throw new NotFoundException(
          `Patient with id ${normalizedPatientId} has invalid data`,
        );
      }

      const existingNotes =
        Array.isArray(parsedPatientRecord.notes) &&
        parsedPatientRecord.notes.every((note) => typeof note === 'string')
          ? parsedPatientRecord.notes
          : [];

      const updatedRecord = {
        ...parsedPatientRecord,
        notes: [payload.note, ...existingNotes],
      };

      await client.set(patientRecordKey, JSON.stringify(updatedRecord));
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new ServiceUnavailableException('Unable to attach note to patient');
    }
  }

  async getPatientDetails(patientId: string): Promise<PatientDetailsResponseI> {
    const client = this.redisService.client;
    const normalizedPatientId = patientId.trim();

    const patientRecordKey = this.getPatientRecordKey(normalizedPatientId);

    try {
      const [rawPatientRecord, rawQueueRecords] = await Promise.all([
        client.get(patientRecordKey),
        client.zRangeWithScores(
          this.getPatientQueueKey(normalizedPatientId),
          0,
          -1,
        ),
      ]);

      if (!rawPatientRecord) {
        throw new NotFoundException(
          `Patient with id ${normalizedPatientId} is not checked in`,
        );
      }

      let parsedPatientRecord: unknown;

      try {
        parsedPatientRecord = JSON.parse(rawPatientRecord) as unknown;
      } catch {
        parsedPatientRecord = null;
      }

      const parsedQueueRecords = rawQueueRecords
        .map(({ value, score }) => {
          try {
            const parsedValue = JSON.parse(value) as {
              triage_state?: unknown;
              specialty?: unknown;
              reffered_by_id?: unknown;
              timestamp?: unknown;
            } | null;

            if (
              !parsedValue ||
              typeof parsedValue.triage_state !== 'string' ||
              !TRIAGE_STATES.includes(
                parsedValue.triage_state as (typeof TRIAGE_STATES)[number],
              ) ||
              typeof parsedValue.specialty !== 'string' ||
              typeof parsedValue.reffered_by_id !== 'string'
            ) {
              return null;
            }

            const timestamp =
              typeof parsedValue.timestamp === 'string'
                ? new Date(parsedValue.timestamp)
                : new Date(score);

            if (Number.isNaN(timestamp.getTime())) {
              return null;
            }

            return {
              timestamp,
              triage_state: parsedValue.triage_state,
              specialty: parsedValue.specialty,
              reffered_by_id: parsedValue.reffered_by_id,
            };
          } catch {
            return null;
          }
        })
        .filter((entry): entry is FullPatientDataI['queue'][number] =>
          Boolean(entry),
        );

      let transformedData: FullPatientDataI;
      try {
        transformedData = this.transformToFullPatientData(
          normalizedPatientId,
          parsedPatientRecord,
          parsedQueueRecords,
        );
      } catch (error: unknown) {
        const phoneLookupKey =
          this.getPhoneLookupKeyFromRecord(parsedPatientRecord);

        if (phoneLookupKey) {
          await client.del(phoneLookupKey);
        }

        await client.del([
          patientRecordKey,
          this.getPatientQueueKey(normalizedPatientId),
        ]);

        throw new NotFoundException(
          `Patient with id ${normalizedPatientId} has invalid data and was removed`,
        );
      }

      return {
        id: transformedData.id,
        name: transformedData.name,
        phone_number: transformedData.phone_number,
        triage_state: transformedData.triage_state,
        admitted_at: new Date(transformedData.admitted_at),
        notes: transformedData.notes,
        history: transformedData.history,
        queue: transformedData.queue,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'Unable to retrieve patient details',
      );
    }
  }
  constructor(private readonly redisService: RedisService) {}

  async getAllPatients(): Promise<AllPatientsI> {
    const client = this.redisService.client;

    try {
      const patientRecordKeys = await client.keys(
        this.getPatientRecordPattern(''),
      );

      if (patientRecordKeys.length === 0) {
        return [];
      }

      const patientRecords = await client.mGet(patientRecordKeys);

      return patientRecords
        .map((record) => {
          if (!record) {
            return null;
          }

          try {
            const parsedRecord = JSON.parse(record) as {
              id?: unknown;
              name?: unknown;
              phone_number?: unknown;
              triage_state?: unknown;
              admitted_at?: unknown;
              notes?: unknown;
            } | null;

            if (
              !parsedRecord ||
              typeof parsedRecord.id !== 'string' ||
              typeof parsedRecord.name !== 'string' ||
              typeof parsedRecord.phone_number !== 'string' ||
              typeof parsedRecord.triage_state !== 'string' ||
              !TRIAGE_STATES.includes(
                parsedRecord.triage_state as (typeof TRIAGE_STATES)[number],
              ) ||
              typeof parsedRecord.admitted_at !== 'string' ||
              !Array.isArray(parsedRecord.notes) ||
              !parsedRecord.notes.every((note) => typeof note === 'string')
            ) {
              return null;
            }

            const admittedAt = new Date(parsedRecord.admitted_at);

            if (Number.isNaN(admittedAt.getTime())) {
              return null;
            }

            return {
              id: parsedRecord.id,
              name: parsedRecord.name,
              phone_number: parsedRecord.phone_number,
              triage_state: parsedRecord.triage_state,
              admitted_at: admittedAt,
              notes: parsedRecord.notes,
            };
          } catch {
            return null;
          }
        })
        .filter((patient): patient is CheckInResponseI => Boolean(patient));
    } catch {
      throw new ServiceUnavailableException('Unable to retrieve patients');
    }
  }

  async checkIn(payload: CheckInPayloadI): Promise<CheckInResponseI> {
    const client = this.redisService.client;

    const normalizedPhone = payload.phone_number.trim();
    const phoneLookupKey = this.getPhoneLookupKey(normalizedPhone);
    const existingPatientId = await client.get(phoneLookupKey);

    if (existingPatientId) {
      throw new ConflictException(
        `Patient with phone number ${normalizedPhone} is already checked in`,
      );
    }

    const now = new Date();
    const record: CheckInResponseI = {
      id: randomUUID(),
      name: payload.name.trim(),
      phone_number: normalizedPhone,
      triage_state: payload.triage_state,
      admitted_at: now,
      notes: [],
    };

    const patientRecordKey = this.getPatientRecordKey(record.id);

    const reservationResult = await client.set(phoneLookupKey, record.id, {
      NX: true,
    });

    if (reservationResult !== 'OK') {
      throw new ConflictException(
        `Patient with phone number ${normalizedPhone} is already checked in`,
      );
    }

    try {
      await client.set(
        patientRecordKey,
        JSON.stringify({
          ...record,
          history: [],
          admitted_at: record.admitted_at.toISOString(),
        }),
      );
    } catch {
      await client.del(phoneLookupKey);
      throw new ServiceUnavailableException(
        'Unable to persist patient check-in',
      );
    }

    return record;
  }

  async checkOut(patientId: string): Promise<{ checked_out: true }> {
    const client = this.redisService.client;
    const normalizedPatientId = patientId.trim();

    const patientRecordKeys = await client.keys(
      this.getPatientRecordPattern(normalizedPatientId),
    );

    if (patientRecordKeys.length === 0) {
      throw new NotFoundException(
        `Patient with id ${normalizedPatientId} is not checked in`,
      );
    }

    try {
      const patientRecords = await client.mGet(patientRecordKeys);
      const archivedRecords = patientRecordKeys.map((recordKey, index) => {
        const rawRecord = patientRecords[index];

        if (!rawRecord) {
          return {
            record_key: recordKey,
            raw_record: null,
            parsed_record: null,
          };
        }

        try {
          return {
            record_key: recordKey,
            raw_record: rawRecord,
            parsed_record: JSON.parse(rawRecord) as unknown,
          };
        } catch {
          return {
            record_key: recordKey,
            raw_record: rawRecord,
            parsed_record: null,
            parse_error: 'Invalid JSON payload in Redis record',
          };
        }
      });

      const phoneLookupKeys = patientRecords
        .map((record) => {
          if (!record) {
            return null;
          }

          const parsedRecord = JSON.parse(record) as {
            phone_number?: unknown;
          } | null;

          if (
            !parsedRecord ||
            typeof parsedRecord.phone_number !== 'string' ||
            !parsedRecord.phone_number.trim()
          ) {
            return null;
          }

          return this.getPhoneLookupKey(parsedRecord.phone_number.trim());
        })
        .filter((key): key is string => Boolean(key));

      await archiveWriter.writeJsonRecord(
        `${normalizedPatientId}-${Date.now()}`,
        {
          patient_id: normalizedPatientId,
          checked_out_at: new Date().toISOString(),
          patient_record_keys: patientRecordKeys,
          records: archivedRecords,
        },
      );

      if (phoneLookupKeys.length > 0) {
        await client.del(phoneLookupKeys);
      }

      await client.del(patientRecordKeys);
    } catch {
      throw new ServiceUnavailableException(
        'Unable to complete patient check-out',
      );
    }

    return { checked_out: true };
  }

  private getPhoneLookupKey(phoneNumber: string): string {
    return `patient:phone:${phoneNumber}`;
  }

  private getPatientRecordKey(patientId: string): string {
    return `patient:record:${patientId}`;
  }

  private getPatientQueueKey(patientId: string): string {
    return `patient:queue:${patientId}`;
  }

  private getPatientRecordPattern(patientId: string): string {
    return `${this.getPatientRecordKey(patientId)}*`;
  }

  private transformToFullPatientData(
    patientId: string,
    rawRecord: unknown,
    queue: FullPatientDataI['queue'],
  ): FullPatientDataI {
    if (!this.isObject(rawRecord)) {
      throw new Error('Invalid patient record format');
    }

    const history = rawRecord.history;
    if (Array.isArray(history)) {
      history.map((entry) => {
        if (!this.isObject(entry)) {
          throw new Error('Invalid history record format');
        }

        const timestamp =
          typeof entry.timestamp === 'string'
            ? new Date(entry.timestamp)
            : entry.timestamp;

        if (
          typeof entry.reffered_by_id !== 'string' ||
          typeof entry.specialty !== 'string' ||
          typeof entry.triage_state !== 'string' ||
          !TRIAGE_STATES.includes(
            entry.triage_state as (typeof TRIAGE_STATES)[number],
          ) ||
          typeof entry.reffered_to_id !== 'string' ||
          typeof entry.is_done !== 'boolean' ||
          !(timestamp instanceof Date) ||
          Number.isNaN(timestamp.getTime())
        ) {
          throw new Error('Invalid history record format');
        }

        return entry;
      });
    }

    if (Array.isArray(queue)) {
      queue = [];
    }

    const transformed = {
      ...rawRecord,
      history,
      queue,
    } as FullPatientDataI;

    if (!this.isFullPatientData(transformed)) {
      console.log('throws the check');
      throw new Error(
        'Transformed data does not match FullPatientDataI format',
      );
    }

    return transformed;
  }

  private isFullPatientData(value: unknown): value is FullPatientDataI {
    console.log(value);

    if (!this.isObject(value)) {
      return false;
    }

    if (
      typeof value.id !== 'string' ||
      typeof value.name !== 'string' ||
      typeof value.phone_number !== 'string' ||
      typeof value.triage_state !== 'string' ||
      !TRIAGE_STATES.includes(
        value.triage_state as (typeof TRIAGE_STATES)[number],
      ) ||
      typeof value.admitted_at !== 'string' ||
      !Array.isArray(value.notes) ||
      !value.notes.every((note) => typeof note === 'string') ||
      !Array.isArray(value.history) ||
      !Array.isArray(value.queue)
    ) {
      return false;
    }

    const hasValidHistory = value.history.every((entry) => {
      if (!this.isObject(entry)) {
        return false;
      }

      return (
        typeof entry.reffered_by_id === 'string' &&
        typeof entry.specialty === 'string' &&
        typeof entry.triage_state === 'string' &&
        TRIAGE_STATES.includes(
          entry.triage_state as (typeof TRIAGE_STATES)[number],
        ) &&
        typeof entry.reffered_to_id === 'string' &&
        typeof entry.is_done === 'boolean' &&
        entry.timestamp instanceof Date &&
        !Number.isNaN(entry.timestamp.getTime())
      );
    });

    if (!hasValidHistory && value.history.length > 0) {
      return false;
    }

    if (!Array.isArray(value.queue) || value.queue.length === 0) return true;

    return value.queue.every((entry) => {
      if (!this.isObject(entry)) {
        return false;
      }

      return (
        entry.timestamp instanceof Date &&
        !Number.isNaN(entry.timestamp.getTime()) &&
        typeof entry.triage_state === 'string' &&
        TRIAGE_STATES.includes(
          entry.triage_state as (typeof TRIAGE_STATES)[number],
        ) &&
        typeof entry.specialty === 'string' &&
        typeof entry.reffered_by_id === 'string'
      );
    });
  }

  private getPhoneLookupKeyFromRecord(record: unknown): string | null {
    if (!this.isObject(record) || typeof record.phone_number !== 'string') {
      return null;
    }

    const normalizedPhone = record.phone_number.trim();

    if (!normalizedPhone) {
      return null;
    }

    return this.getPhoneLookupKey(normalizedPhone);
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
