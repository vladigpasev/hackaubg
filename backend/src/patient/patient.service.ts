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
import { AllPatientsI, CheckInPayloadI, CheckInResponseI } from './patient.dto';

const archiveWriter = createJsonArchiver({
  rootDir: resolve(process.cwd(), 'archives'),
});

@Injectable()
export class PatientService {
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
              typeof parsedRecord.admitted_at !== 'string'
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

  private getPatientRecordPattern(patientId: string): string {
    return `${this.getPatientRecordKey(patientId)}*`;
  }
}
