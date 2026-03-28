import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import * as zlib from 'node:zlib';
import { AuthUser } from 'src/auth/auth.types';
import * as tar from 'tar';
import { isUserRole } from '../auth/auth.constants';
import { AuthService } from '../auth/auth.service';
import { RedisService } from '../service/redis.service';
import { StreamService } from '../service/stream.service';
import { TRIAGE_STATES } from '../shared.types';
import {
  createJsonArchiver,
  getSofiaDateString,
} from '../utils/archiver/jsonArchiver';
import {
  AllPatientsI,
  AttachPatientNotePayloadI,
  CheckInPayloadI,
  CheckInResponseI,
  IArchivedDateResultsResponse,
  PatientDetailsResponseI,
  UpdatePatientI,
} from './patient.dto';
import { FullPatientDataI, HistoryRecordI, QueueRecordI } from './patient.type';

const archiveWriter = createJsonArchiver({
  rootDir: resolve(process.cwd(), 'archives'),
});

@Injectable()
export class PatientService {
  async getArchivedByDateTime(
    dateTimeValue: string,
  ): Promise<IArchivedDateResultsResponse> {
    const normalizedDateTimeValue = dateTimeValue.trim();

    if (!normalizedDateTimeValue) {
      throw new BadRequestException('date-time path parameter is required');
    }

    const targetDateTime = new Date(normalizedDateTimeValue);

    if (Number.isNaN(targetDateTime.getTime())) {
      throw new BadRequestException(
        'Invalid date-time. Expected an ISO 8601 date-time value.',
      );
    }

    const folderDate = getSofiaDateString(targetDateTime, 'Europe/Sofia');

    try {
      const archivePath = await this.findArchivePathByFolderDate(folderDate);
      const archiveEntries = await this.readArchiveEntriesInMemory(archivePath);

      const patients = this.parseArchivedPatientsFromEntries(archiveEntries);
      const users = this.parseArchivedUsersFromEntries(archiveEntries);

      return {
        date: folderDate,
        users,
        patients,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'Unable to read archived records for the provided date-time',
      );
    }
  }

  async updatePatient(
    patientId: string,
    payload: UpdatePatientI,
  ): Promise<CheckInResponseI> {
    const client = this.redisService.client;
    const normalizedPatientId = patientId.trim();
    const patientRecordKey = this.getPatientRecordKey(normalizedPatientId);

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

  constructor(
    private readonly redisService: RedisService,
    private readonly streamService: StreamService,
    private readonly authService: AuthService,
  ) {}

  async getPatientDetailsByPhoneNumber(
    phoneNumber: string,
  ): Promise<PatientDetailsResponseI> {
    const client = this.redisService.client;
    const normalizedPhoneNumber = phoneNumber.trim();

    if (!normalizedPhoneNumber) {
      throw new NotFoundException('Patient phone number is required');
    }

    let patientId: string | null;

    try {
      patientId = await client.get(
        this.getPhoneLookupKey(normalizedPhoneNumber),
      );
    } catch {
      throw new ServiceUnavailableException(
        'Unable to retrieve patient details',
      );
    }

    if (!patientId) {
      throw new NotFoundException(
        `Patient with phone number ${normalizedPhoneNumber} is not checked in`,
      );
    }

    return this.getPatientDetails(patientId);
  }

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

    this.streamService.pushEvent({
      type: 'patient:check-in',
      data: record,
    });

    return record;
  }

  async checkOut(patientId: string): Promise<{ checked_out: true }> {
    const client = this.redisService.client;
    const normalizedPatientId = patientId.trim();

    const patientScopedKeys = await client.keys(
      `patient:*:${normalizedPatientId}`,
    );

    if (patientScopedKeys.length === 0) {
      throw new NotFoundException(
        `Patient with id ${normalizedPatientId} is not checked in`,
      );
    }

    try {
      const keysToDelete = new Set(patientScopedKeys);
      const recordedData: Record<string, unknown> = {};
      const patientRecordKey = this.getPatientRecordKey(normalizedPatientId);
      let phoneLookupKey: string | null = null;

      for (const key of patientScopedKeys) {
        const keyValue = await this.readRedisValueByKey(client, key);

        this.assignRecordedDataFromKey(
          recordedData,
          key,
          keyValue,
          normalizedPatientId,
        );

        if (key === patientRecordKey) {
          phoneLookupKey = this.getPhoneLookupKeyFromRecord(keyValue);
        }
      }

      if (phoneLookupKey) {
        const phoneLookupOwnerId = await client.get(phoneLookupKey);

        if (phoneLookupOwnerId === normalizedPatientId) {
          const phoneLookupValue = await this.readRedisValueByKey(
            client,
            phoneLookupKey,
          );

          this.assignRecordedDataFromKey(
            recordedData,
            phoneLookupKey,
            phoneLookupValue,
          );

          keysToDelete.add(phoneLookupKey);
        }
      }

      await archiveWriter.writeJsonRecord(
        `${normalizedPatientId}-${Date.now()}`,
        {
          patient_id: normalizedPatientId,
          archived_at: new Date().toISOString(),
          recorded_data: recordedData,
        },
      );

      await client.del([...keysToDelete]);
    } catch {
      throw new ServiceUnavailableException(
        'Unable to complete patient check-out',
      );
    }

    this.streamService.pushEvent({
      type: 'patient:check-out',
      data: { id: normalizedPatientId },
    });

    return { checked_out: true };
  }

  private async readRedisValueByKey(
    client: RedisService['client'],
    key: string,
  ): Promise<unknown> {
    const keyType = await client.type(key);

    if (keyType === 'string') {
      const value = await client.get(key);
      return value === null ? null : this.tryParseJson(value);
    }

    if (keyType === 'zset') {
      const values = await client.zRangeWithScores(key, 0, -1);

      return values.map(({ value, score }) => ({
        value: this.tryParseJson(value),
        score,
      }));
    }

    if (keyType === 'hash') {
      const values = await client.hGetAll(key);

      return Object.entries(values).reduce<Record<string, unknown>>(
        (acc, [field, value]) => {
          acc[field] = this.tryParseJson(value);
          return acc;
        },
        {},
      );
    }

    if (keyType === 'list') {
      const values = await client.lRange(key, 0, -1);
      return values.map((value) => this.tryParseJson(value));
    }

    if (keyType === 'set') {
      const values = await client.sMembers(key);
      return values.map((value) => this.tryParseJson(value));
    }

    return null;
  }

  private assignRecordedDataFromKey(
    target: Record<string, unknown>,
    key: string,
    value: unknown,
    trailingSegmentToStrip?: string,
  ): void {
    const keySegments = key.split(':');

    if (keySegments.length < 2 || keySegments[0] !== 'patient') {
      return;
    }

    const pathSegments =
      trailingSegmentToStrip &&
      keySegments[keySegments.length - 1] === trailingSegmentToStrip
        ? keySegments.slice(1, -1)
        : keySegments.slice(1);

    if (pathSegments.length === 0) {
      return;
    }

    let cursor: Record<string, unknown> = target;

    for (let index = 0; index < pathSegments.length; index += 1) {
      const segment = pathSegments[index];
      const isLeaf = index === pathSegments.length - 1;

      if (isLeaf) {
        cursor[segment] = value;
        return;
      }

      const nextValue = cursor[segment];

      if (!this.isObject(nextValue)) {
        cursor[segment] = {};
      }

      cursor = cursor[segment] as Record<string, unknown>;
    }
  }

  private tryParseJson(value: string): unknown {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
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

  private async findArchivePathByFolderDate(
    folderDate: string,
  ): Promise<string> {
    const archiveRoot = resolve(process.cwd(), 'archives');
    const archiveExtensions = ['tar.br', 'tar.gz', 'tar.zst', 'tar'];

    for (const extension of archiveExtensions) {
      const candidatePath = resolve(archiveRoot, `${folderDate}.${extension}`);

      try {
        const archiveStat = await stat(candidatePath);
        if (archiveStat.isFile()) {
          return candidatePath;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    }

    throw new NotFoundException(`Archive for date ${folderDate} was not found`);
  }

  private async readArchiveEntriesInMemory(
    archivePath: string,
  ): Promise<Map<string, string>> {
    const entries = new Map<string, string>();
    const parser = new tar.Parser({ strict: true });

    parser.on('entry', (entry: tar.ReadEntry) => {
      if (entry.type !== 'File') {
        entry.resume();
        return;
      }

      const chunks: Buffer[] = [];
      entry.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      entry.on('end', () => {
        entries.set(entry.path, Buffer.concat(chunks).toString('utf8'));
      });
    });

    if (archivePath.endsWith('.tar.br')) {
      await pipeline(
        createReadStream(archivePath),
        zlib.createBrotliDecompress(),
        parser,
      );
      return entries;
    }

    if (archivePath.endsWith('.tar.gz')) {
      await pipeline(
        createReadStream(archivePath),
        zlib.createGunzip(),
        parser,
      );
      return entries;
    }

    if (archivePath.endsWith('.tar.zst')) {
      const createZstdDecompress = (
        zlib as typeof zlib & {
          createZstdDecompress?: (
            options?: Record<string, unknown>,
          ) => NodeJS.ReadWriteStream;
        }
      ).createZstdDecompress;

      if (typeof createZstdDecompress !== 'function') {
        throw new Error(
          'The current Node.js runtime does not support zstd decompression.',
        );
      }

      await pipeline(
        createReadStream(archivePath),
        createZstdDecompress(),
        parser,
      );
      return entries;
    }

    if (archivePath.endsWith('.tar')) {
      await pipeline(createReadStream(archivePath), parser);
      return entries;
    }

    throw new Error(`Unsupported archive extension: ${archivePath}`);
  }

  private parseArchivedPatientsFromEntries(
    entries: Map<string, string>,
  ): PatientDetailsResponseI[] {
    const patients: PatientDetailsResponseI[] = [];

    for (const [entryPath, content] of entries.entries()) {
      if (!entryPath.endsWith('.json')) {
        continue;
      }

      const archivedPatient = this.parseArchivedPatientJson(content, entryPath);
      patients.push(archivedPatient);
    }

    return patients;
  }

  private parseArchivedPatientJson(
    content: string,
    entryPath: string,
  ): PatientDetailsResponseI {
    let parsedJson: unknown;

    try {
      parsedJson = JSON.parse(content) as unknown;
    } catch {
      throw new Error(`Invalid archived JSON content at ${entryPath}`);
    }

    if (!this.isObject(parsedJson)) {
      throw new Error(`Archived patient payload is invalid at ${entryPath}`);
    }

    const patientRecord = parsedJson.recorded_data;

    if (!this.isObject(patientRecord) || !this.isObject(patientRecord.record)) {
      throw new Error(`Archived patient record is missing at ${entryPath}`);
    }

    const rawRecord = patientRecord.record;
    const admittedAtRaw = rawRecord.admitted_at;

    if (
      typeof rawRecord.id !== 'string' ||
      typeof rawRecord.name !== 'string' ||
      typeof rawRecord.phone_number !== 'string' ||
      typeof rawRecord.triage_state !== 'string' ||
      !TRIAGE_STATES.includes(
        rawRecord.triage_state as (typeof TRIAGE_STATES)[number],
      ) ||
      typeof admittedAtRaw !== 'string' ||
      !Array.isArray(rawRecord.notes) ||
      !rawRecord.notes.every((note) => typeof note === 'string')
    ) {
      throw new Error(
        `Archived patient record has invalid shape at ${entryPath}`,
      );
    }

    const admittedAt = new Date(admittedAtRaw);

    if (Number.isNaN(admittedAt.getTime())) {
      throw new Error(
        `Archived patient admitted_at is invalid at ${entryPath}`,
      );
    }

    return {
      id: rawRecord.id,
      name: rawRecord.name,
      phone_number: rawRecord.phone_number,
      triage_state: rawRecord.triage_state as CheckInResponseI['triage_state'],
      admitted_at: admittedAt,
      notes: rawRecord.notes,
      history: (rawRecord.history as HistoryRecordI[]) ?? [],
      queue: (rawRecord.queue as QueueRecordI[]) ?? [],
    };
  }

  private parseArchivedUsersFromEntries(
    entries: Map<string, string>,
  ): Record<string, AuthUser> {
    const csvEntry = [...entries.entries()].find(([entryPath]) =>
      entryPath.endsWith('summary.users.csv'),
    );

    if (!csvEntry) {
      return {};
    }

    const [, csvContent] = csvEntry;
    return this.parseArchivedUsersCsv(csvContent);
  }

  private parseArchivedUsersCsv(csvContent: string): Record<string, AuthUser> {
    const rows = this.parseCsvRows(csvContent);

    if (rows.length <= 1) {
      return {};
    }

    const users: Record<string, AuthUser> = {};

    for (const row of rows.slice(1)) {
      if (row.length === 0 || row.every((column) => !column.trim())) {
        continue;
      }

      const username = row[0]?.trim();
      const roleValue = row[1]?.trim();
      const isTesterValue = row[2]?.trim().toLowerCase();
      const specialtiesValue = row[3]?.trim() ?? '[]';

      if (!username || !roleValue || !isUserRole(roleValue)) {
        throw new Error('Archived users CSV contains an invalid user row');
      }

      if (isTesterValue !== 'true' && isTesterValue !== 'false') {
        throw new Error(
          'Archived users CSV contains an invalid isTester value',
        );
      }

      const specialties = this.parseSpecialtiesFromCsv(specialtiesValue);

      users[username] = {
        username,
        role: roleValue,
        isTester: isTesterValue === 'true',
        specialties,
      };
    }

    return users;
  }

  private parseSpecialtiesFromCsv(specialtiesValue: string): string[] {
    if (!specialtiesValue) {
      return [];
    }

    let parsedValue: unknown;

    try {
      parsedValue = JSON.parse(specialtiesValue) as unknown;
    } catch {
      throw new Error('Archived users CSV has invalid specialties JSON');
    }

    if (
      !Array.isArray(parsedValue) ||
      !parsedValue.every((value) => typeof value === 'string')
    ) {
      throw new Error('Archived users CSV has invalid specialties shape');
    }

    return parsedValue;
  }

  private parseCsvRows(content: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let isInsideQuotes = false;

    for (let index = 0; index < content.length; index += 1) {
      const character = content[index];
      const nextCharacter = content[index + 1];

      if (character === '"') {
        if (isInsideQuotes && nextCharacter === '"') {
          currentCell += '"';
          index += 1;
          continue;
        }

        isInsideQuotes = !isInsideQuotes;
        continue;
      }

      if (character === ',' && !isInsideQuotes) {
        currentRow.push(currentCell);
        currentCell = '';
        continue;
      }

      if ((character === '\n' || character === '\r') && !isInsideQuotes) {
        if (character === '\r' && nextCharacter === '\n') {
          index += 1;
        }

        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
        continue;
      }

      currentCell += character;
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(currentCell);
      rows.push(currentRow);
    }

    return rows;
  }

  private transformToFullPatientData(
    patientId: string,
    rawRecord: unknown,
    queue: FullPatientDataI['queue'],
  ): FullPatientDataI {
    if (!this.isObject(rawRecord)) {
      throw new Error('Invalid patient record format');
    }

    const history = Array.isArray(rawRecord.history)
      ? rawRecord.history.map((entry) => {
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

          return {
            reffered_by_id: entry.reffered_by_id,
            specialty: entry.specialty,
            triage_state: entry.triage_state,
            reffered_to_id: entry.reffered_to_id,
            is_done: entry.is_done,
            timestamp,
          };
        })
      : [];

    const normalizedQueue = Array.isArray(queue) ? queue : [];

    const transformed = {
      ...rawRecord,
      history,
      queue: normalizedQueue,
    } as FullPatientDataI;

    if (!this.isFullPatientData(transformed)) {
      throw new Error(
        'Transformed data does not match FullPatientDataI format',
      );
    }

    return transformed;
  }

  private isFullPatientData(value: unknown): value is FullPatientDataI {
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

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  public async executeArchivalChron(): Promise<void> {
    await this.executeArchival();
  }

  public async executeArchival(): Promise<void> {
    try {
      // Calculate the date from 10 minutes ago
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

      // Call archiveFolderByDate with transform function that returns all users
      await archiveWriter.archiveFolderByDate(
        'users',
        tenMinutesAgo,
        async () => {
          // Return a snapshot of all users at this time
          const users = await this.authService.getAllUsers();
          return users as unknown as Record<string, unknown>[];
        },
      );
    } catch (error) {
      console.error('Error executing archival:', error);
      throw error;
    }
  }
}
