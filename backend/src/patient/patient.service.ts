import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { resolve } from 'node:path';
import { RedisService } from '../service/redis.service';
import { StreamService } from '../service/stream.service';
import { TRIAGE_STATES } from '../shared.types';
import { createJsonArchiver } from '../utils/archiver/jsonArchiver';
import {
  AllPatientsI,
  AttachPatientNotePayloadI,
  CheckInPayloadI,
  CheckInResponseI,
  PatientDetailsResponseI,
  UpdatePatientI,
} from './patient.dto';
import {
  getPatientQueueKey,
  getPatientRecordKey,
  hydratePatientRecord,
  parseStoredPatientRecordString,
  readPatientQueue,
  serializePatientRecord,
} from '../workflow/workflow.store';

const archiveWriter = createJsonArchiver({
  rootDir: resolve(process.cwd(), 'archives'),
});

@Injectable()
export class PatientService {
  async updatePatient(
    patientId: string,
    payload: UpdatePatientI,
  ): Promise<CheckInResponseI> {
    const client = this.redisService.client;
    const normalizedPatientId = patientId.trim();
    const patientRecordKey = getPatientRecordKey(normalizedPatientId);

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

    const currentName = parsedPatientRecord.name;
    const currentPhone = parsedPatientRecord.phone_number;
    const currentTriageState = parsedPatientRecord.triage_state;
    const currentAdmittedAt = parsedPatientRecord.admitted_at;
    const currentNotes = parsedPatientRecord.notes;

    if (
      typeof currentName !== 'string' ||
      typeof currentPhone !== 'string' ||
      typeof currentTriageState !== 'string' ||
      !TRIAGE_STATES.includes(
        currentTriageState as (typeof TRIAGE_STATES)[number],
      ) ||
      typeof currentAdmittedAt !== 'string' ||
      !Array.isArray(currentNotes) ||
      !currentNotes.every((note) => typeof note === 'string')
    ) {
      throw new NotFoundException(
        `Patient with id ${normalizedPatientId} has invalid data`,
      );
    }

    const nextName = payload.name?.trim() ?? currentName;
    const nextPhone = payload.phone_number?.trim() ?? currentPhone;
    const nextTriageState: CheckInResponseI['triage_state'] =
      payload.triage_state ??
      (currentTriageState as CheckInResponseI['triage_state']);

    const oldPhoneLookupKey = this.getPhoneLookupKey(currentPhone.trim());
    const newPhoneLookupKey = this.getPhoneLookupKey(nextPhone);
    const isPhoneNumberChanged = oldPhoneLookupKey !== newPhoneLookupKey;

    try {
      if (isPhoneNumberChanged) {
        const existingPatientIdOnPhone = await client.get(newPhoneLookupKey);

        if (
          existingPatientIdOnPhone &&
          existingPatientIdOnPhone !== normalizedPatientId
        ) {
          throw new ConflictException(
            `Patient with phone number ${nextPhone} is already checked in`,
          );
        }

        if (!existingPatientIdOnPhone) {
          const reservePhoneResult = await client.set(
            newPhoneLookupKey,
            normalizedPatientId,
            {
              NX: true,
            },
          );

          if (reservePhoneResult !== 'OK') {
            throw new ConflictException(
              `Patient with phone number ${nextPhone} is already checked in`,
            );
          }
        }

        try {
          await client.set(
            patientRecordKey,
            JSON.stringify({
              ...parsedPatientRecord,
              name: nextName,
              phone_number: nextPhone,
              triage_state: nextTriageState,
            }),
          );
          await client.del(oldPhoneLookupKey);
        } catch {
          if (!existingPatientIdOnPhone) {
            await client.del(newPhoneLookupKey);
          }

          throw new ServiceUnavailableException('Unable to update patient');
        }
      } else {
        await client.set(
          patientRecordKey,
          JSON.stringify({
            ...parsedPatientRecord,
            name: nextName,
            phone_number: nextPhone,
            triage_state: nextTriageState,
          }),
        );
      }
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }

      throw new ServiceUnavailableException('Unable to update patient');
    }

    const admittedAt = new Date(currentAdmittedAt);

    if (Number.isNaN(admittedAt.getTime())) {
      throw new NotFoundException(
        `Patient with id ${normalizedPatientId} has invalid data`,
      );
    }

    const record = {
      id: normalizedPatientId,
      name: nextName,
      phone_number: nextPhone,
      triage_state: nextTriageState,
      admitted_at: admittedAt,
      notes: currentNotes,
    };

    this.streamService.pushEvent({
      type: 'patient:update',
      data: record,
    });

    return record;
  }

  async attachNote(
    patientId: string,
    payload: AttachPatientNotePayloadI,
  ): Promise<void> {
    const client = this.redisService.client;
    const normalizedPatientId = patientId.trim();
    const patientRecordKey = getPatientRecordKey(normalizedPatientId);

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

      this.streamService.pushEvent({
        type: 'patient:update',
        data: { id: patientId, notes: updatedRecord.notes },
      });
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
    const patientRecordKey = getPatientRecordKey(normalizedPatientId);

    try {
      const [rawPatientRecord, queue] = await Promise.all([
        client.get(patientRecordKey),
        readPatientQueue(client, normalizedPatientId),
      ]);

      if (!rawPatientRecord) {
        throw new NotFoundException(
          `Patient with id ${normalizedPatientId} is not checked in`,
        );
      }

      const parsedPatientRecord =
        parseStoredPatientRecordString(rawPatientRecord);

      if (!parsedPatientRecord) {
        const phoneLookupKey = this.getPhoneLookupKeyFromRecord(
          this.tryParseJson(rawPatientRecord),
        );

        if (phoneLookupKey) {
          await client.del(phoneLookupKey);
        }

        await client.del([
          patientRecordKey,
          getPatientQueueKey(normalizedPatientId),
        ]);

        throw new NotFoundException(
          `Patient with id ${normalizedPatientId} has invalid data and was removed`,
        );
      }

      return hydratePatientRecord(parsedPatientRecord, queue);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'Unable to retrieve patient details',
      );
    }
  }

  constructor(
    private readonly redisService: RedisService,
    private readonly streamService: StreamService,
  ) {}

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

    const patientRecordKey = getPatientRecordKey(record.id);

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
        JSON.stringify(
          serializePatientRecord({
            ...record,
            history: [],
            queue: [],
          }),
        ),
      );
    } catch {
      await client.del(phoneLookupKey);
      throw new ServiceUnavailableException(
        'Unable to persist patient check-in',
      );
    }

    this.streamService.pushEvent({
      type: 'patient:check-in',
      data: record,
    });

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

    this.streamService.pushEvent({
      type: 'patient:check-out',
      data: { id: patientId },
    });

    return { checked_out: true };
  }

  private getPhoneLookupKey(phoneNumber: string): string {
    return `patient:phone:${phoneNumber}`;
  }

  private getPatientRecordPattern(patientId: string): string {
    return `${getPatientRecordKey(patientId)}*`;
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

  private tryParseJson(value: string): unknown {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
}
