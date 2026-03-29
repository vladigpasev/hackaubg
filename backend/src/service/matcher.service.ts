import { Injectable, Logger } from '@nestjs/common';
import type { User } from '../../generated/prisma/client';
import type { PatientDetailsResponseI } from '../patient/patient.dto';
import type { QueueRecordI } from '../patient/patient.type';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { StreamService } from './stream.service';
import {
  buildQueueSnapshotEvent,
  getDoctorCurrentPatientKey,
  getDoctorOfflineKey,
  getPatientCurrentAssignmentKey,
  getPatientQueueKey,
  getPatientRecordKey,
  getTriagePriority,
  hydratePatientRecord,
  parseDoctorSpecialties,
  parseStoredPatientRecordString,
  readPatientQueue,
  serializeQueueRecord,
} from '../workflow/workflow.store';

type WaitingPatientI = {
  id: string;
  priority: number;
  assignments: QueueRecordI[];
};

type AvailableDoctorI = {
  id: string;
  specialties: string[];
};

type MatchResultI = {
  doctor: string;
  patient: string;
  queuedAssignment: QueueRecordI;
  currentAssignment: QueueRecordI;
};

type AssignmentCandidateI = {
  queuedAssignment: QueueRecordI;
  resolvedSpecialty: string;
  priority: number;
  specialtyOrder: number;
};

@Injectable()
export class MatcherService {
  private readonly logger = new Logger(MatcherService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly streamService: StreamService,
  ) {}

  async matchPatientsToDoctor(targetPatientId?: string): Promise<User | null> {
    const redis = this.redisService.client;
    const [doctors, waterfalls, patientRecordKeys] = await Promise.all([
      this.loadDoctors(),
      this.loadSpecialtyWaterfalls(),
      redis.keys(`${getPatientRecordKey('')}*`),
    ]);

    if (doctors.length === 0 || patientRecordKeys.length === 0) {
      return null;
    }

    const patientIds = patientRecordKeys.map((key) =>
      key.slice(getPatientRecordKey('').length),
    );
    const rawRecords = await redis.mGet(
      patientIds.map((patientId) => getPatientRecordKey(patientId)),
    );
    const queues = await Promise.all(
      patientIds.map((patientId) => readPatientQueue(redis, patientId)),
    );
    const records = patientIds
      .map((patientId, index) =>
        this.hydratePatient(patientId, rawRecords[index], queues[index]),
      )
      .filter((patient): patient is PatientDetailsResponseI =>
        Boolean(patient),
      );

    if (records.length === 0) {
      return null;
    }

    const [takenDoctorIds, offlineDoctorIds] = await Promise.all([
      redis.keys(`${getDoctorCurrentPatientKey('')}*`),
      redis.keys(`${getDoctorOfflineKey('')}*`),
    ]);
    const normalizedTakenDoctorIds = takenDoctorIds.map((key) =>
      key.slice(getDoctorCurrentPatientKey('').length),
    );
    const normalizedOfflineDoctorIds = new Set(
      offlineDoctorIds.map((key) => key.slice(getDoctorOfflineKey('').length)),
    );
    const takenPatientIds = new Set(
      (
        await this.readDoctorAssignments(redis, normalizedTakenDoctorIds)
      ).filter(
        (patientId): patientId is string => typeof patientId === 'string',
      ),
    );

    const freeDoctors = doctors
      .filter(
        (doctor) =>
          !normalizedTakenDoctorIds.includes(doctor.username) &&
          !normalizedOfflineDoctorIds.has(doctor.username),
      )
      .map((doctor) => ({
        id: doctor.username,
        specialties: parseDoctorSpecialties(doctor.specialties),
      }))
      .filter((doctor) => doctor.specialties.length > 0);

    if (freeDoctors.length === 0) {
      return null;
    }

    const waitingPatients = records
      .filter(
        (patient) =>
          !takenPatientIds.has(patient.id) && patient.queue.length > 0,
      )
      .map((patient) => ({
        id: patient.id,
        priority: getTriagePriority(patient.triage_state),
        assignments: patient.queue,
      }));

    if (waitingPatients.length === 0) {
      return null;
    }

    const matches = this.matchPatientsToDoctorsInternal(
      waitingPatients,
      freeDoctors,
      waterfalls,
    );

    if (matches.length === 0) {
      return null;
    }

    for (const match of matches) {
      await redis.set(
        getPatientCurrentAssignmentKey(match.patient),
        serializeQueueRecord(match.currentAssignment),
      );
      await redis.zRem(
        getPatientQueueKey(match.patient),
        serializeQueueRecord(match.queuedAssignment),
      );

      const queue = await readPatientQueue(redis, match.patient);

      this.streamService.pushEvent({
        type: 'patient:update',
        data: buildQueueSnapshotEvent(match.patient, queue),
      });
    }

    await redis.mSet(
      matches.map(
        (match) =>
          [getDoctorCurrentPatientKey(match.doctor), match.patient] as [
            string,
            string,
          ],
      ),
    );

    const targetDoctor = matches.find(
      (match) => match.patient === targetPatientId,
    )?.doctor;

    return targetDoctor
      ? (doctors.find((doctor) => doctor.username === targetDoctor) ?? null)
      : null;
  }

  async getDoctorByUsername(username: string): Promise<User | null> {
    try {
      return await this.prismaService.user.findUnique({
        where: { username },
      });
    } catch (error) {
      this.logPrismaWarning(
        'Unable to load doctor by username during workflow resolution',
        error,
      );
      return null;
    }
  }

  private async loadDoctors(): Promise<User[]> {
    try {
      return await this.prismaService.user.findMany({
        where: { role: 'doctor' },
      });
    } catch (error) {
      this.logPrismaWarning(
        'Unable to load doctors for patient matching',
        error,
      );
      return [];
    }
  }

  private async loadSpecialtyWaterfalls(): Promise<Map<string, string[]>> {
    try {
      const waterfalls =
        await this.prismaService.specialityWaterfall.findMany();

      return new Map(
        waterfalls.map((waterfall) => [
          waterfall.speciality,
          parseDoctorSpecialties(waterfall.waterfall),
        ]),
      );
    } catch (error) {
      this.logPrismaWarning(
        'Unable to load specialty waterfalls, continuing without fallback chains',
        error,
      );
      return new Map();
    }
  }

  private hydratePatient(
    patientId: string,
    rawRecord: string | null,
    queue: QueueRecordI[],
  ): PatientDetailsResponseI | null {
    if (!rawRecord) {
      return null;
    }

    const parsedRecord = parseStoredPatientRecordString(rawRecord);

    if (!parsedRecord || parsedRecord.id !== patientId) {
      return null;
    }

    return hydratePatientRecord(parsedRecord, queue);
  }

  private async readDoctorAssignments(
    redis: typeof this.redisService.client,
    doctorIds: string[],
  ): Promise<Array<string | null>> {
    if (doctorIds.length === 0) {
      return [];
    }

    return redis.mGet(
      doctorIds.map((doctorId) => getDoctorCurrentPatientKey(doctorId)),
    );
  }

  private matchPatientsToDoctorsInternal(
    waitingPatients: WaitingPatientI[],
    freeDoctors: AvailableDoctorI[],
    waterfalls: Map<string, string[]>,
  ): MatchResultI[] {
    const matches: MatchResultI[] = [];
    const freeDoctorsBySpecialty = new Map<string, AvailableDoctorI[]>();

    for (const doctor of freeDoctors) {
      for (const specialty of doctor.specialties) {
        const doctors = freeDoctorsBySpecialty.get(specialty) ?? [];
        doctors.push(doctor);
        freeDoctorsBySpecialty.set(specialty, doctors);
      }
    }

    const orderedPatients = [...waitingPatients].sort(
      (left, right) => left.priority - right.priority,
    );

    patientLoop: for (const patient of orderedPatients) {
      const candidates = patient.assignments
        .flatMap((assignment) =>
          this.expandAssignmentCandidates(assignment, waterfalls),
        )
        .sort((left, right) =>
          left.priority === right.priority
            ? left.specialtyOrder - right.specialtyOrder
            : left.priority - right.priority,
        );

      for (const candidate of candidates) {
        const doctors = freeDoctorsBySpecialty.get(candidate.resolvedSpecialty);

        if (!doctors || doctors.length === 0) {
          continue;
        }

        const doctor = doctors.pop();

        if (!doctor) {
          continue;
        }

        matches.push({
          doctor: doctor.id,
          patient: patient.id,
          queuedAssignment: candidate.queuedAssignment,
          currentAssignment: {
            ...candidate.queuedAssignment,
            specialty: candidate.resolvedSpecialty,
          },
        });

        continue patientLoop;
      }
    }

    return matches;
  }

  private expandAssignmentCandidates(
    assignment: QueueRecordI,
    waterfalls: Map<string, string[]>,
  ): AssignmentCandidateI[] {
    const specialtyChain = waterfalls.get(assignment.specialty);
    const specialties =
      specialtyChain && specialtyChain.length > 0
        ? specialtyChain
        : [assignment.specialty];

    return specialties.map((specialty, index) => ({
      queuedAssignment: assignment,
      resolvedSpecialty: specialty,
      priority: getTriagePriority(assignment.triage_state),
      specialtyOrder: index,
    }));
  }

  private logPrismaWarning(message: string, error: unknown): void {
    const details = error instanceof Error ? error.message : 'Unknown error';
    this.logger.warn(`${message}: ${details}`);
  }
}
