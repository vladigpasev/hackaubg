import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { PatientService } from '../patient/patient.service';
import type { PatientDetailsResponseI } from '../patient/patient.dto';
import type { QueueRecordI } from '../patient/patient.type';
import { MatcherService } from '../service/matcher.service';
import { RedisService } from '../service/redis.service';
import { StreamService } from '../service/stream.service';
import {
  buildQueueSnapshotEvent,
  getDoctorCurrentPatientKey,
  getDoctorOfflineKey,
  getPatientCurrentAssignmentKey,
  getPatientQueueKey,
  getPatientRecordKey,
  getTriagePriority,
  parseDoctorSpecialties,
  readCurrentAssignment,
  readPatientQueue,
  serializePatientRecord,
  serializeQueueRecord,
} from './workflow.store';
import type { FinishTestPayloadI, SendPatientPayloadI } from './workflow.types';

@Injectable()
export class WorkflowService {
  constructor(
    private readonly redisService: RedisService,
    private readonly matcherService: MatcherService,
    private readonly streamService: StreamService,
    private readonly patientService: PatientService,
  ) {}

  async setDoctorStatus(user: AuthUser, online: boolean): Promise<void> {
    const client = this.redisService.client;
    const offlineKey = getDoctorOfflineKey(user.username);

    if (online) {
      await client.del(offlineKey);
      await this.matcherService.matchPatientsToDoctor();
      return;
    }

    await client.set(offlineKey, 'true');
  }

  async freeDoctor(user: AuthUser): Promise<void> {
    const client = this.redisService.client;
    const doctorCurrentPatientKey = getDoctorCurrentPatientKey(user.username);
    const currentPatientId = await client.get(doctorCurrentPatientKey);

    if (!currentPatientId) {
      throw new ConflictException(
        `Doctor ${user.username} does not have an active patient`,
      );
    }

    const [patient, assignment] = await Promise.all([
      this.getPatientDetailsOrThrow(currentPatientId),
      readCurrentAssignment(client, currentPatientId),
    ]);

    if (!assignment) {
      throw new NotFoundException(
        `Current assignment for patient ${currentPatientId} was not found`,
      );
    }

    const updatedPatient: PatientDetailsResponseI = {
      ...patient,
      history: [
        ...patient.history,
        {
          reffered_by_id: assignment.reffered_by_id,
          specialty: assignment.specialty,
          triage_state: assignment.triage_state,
          reffered_to_id: user.username,
          is_done: !user.isTester,
          timestamp: new Date(),
        },
      ],
    };

    await client.set(
      getPatientRecordKey(currentPatientId),
      JSON.stringify(serializePatientRecord(updatedPatient)),
    );

    await client.del([
      doctorCurrentPatientKey,
      getPatientCurrentAssignmentKey(currentPatientId),
    ]);

    await this.matcherService.matchPatientsToDoctor(currentPatientId);

    const refreshedPatient =
      await this.patientService.getPatientDetails(currentPatientId);

    this.streamService.pushEvent({
      type: 'patient:update',
      data: refreshedPatient,
    });
  }

  async sendPatient(
    user: AuthUser,
    payload: SendPatientPayloadI,
  ): Promise<void> {
    await this.getPatientDetailsOrThrow(payload.patient);

    const queueEntry: QueueRecordI = {
      timestamp: new Date(),
      triage_state: payload.triage ?? 'GREEN',
      specialty: payload.specialty,
      reffered_by_id: user.username,
    };

    const client = this.redisService.client;

    await client.zAdd(getPatientQueueKey(payload.patient), [
      {
        score: getTriagePriority(queueEntry.triage_state),
        value: serializeQueueRecord(queueEntry),
      },
    ]);

    await this.matcherService.matchPatientsToDoctor();

    const queue = await readPatientQueue(client, payload.patient);

    this.streamService.pushEvent({
      type: 'patient:update',
      data: buildQueueSnapshotEvent(payload.patient, queue),
    });
  }

  async finishTest(payload: FinishTestPayloadI): Promise<void> {
    const patient = await this.getPatientDetailsOrThrow(payload.patient);
    const historyIndex = patient.history.findIndex(
      (entry) => !entry.is_done && entry.specialty === payload.specialty,
    );

    if (historyIndex === -1) {
      return;
    }

    const completedEntry = patient.history[historyIndex];
    const updatedHistory = patient.history.map((entry, index) =>
      index === historyIndex ? { ...entry, is_done: true } : entry,
    );

    const updatedPatient: PatientDetailsResponseI = {
      ...patient,
      history: updatedHistory,
    };

    const client = this.redisService.client;

    await client.set(
      getPatientRecordKey(payload.patient),
      JSON.stringify(serializePatientRecord(updatedPatient)),
    );

    this.streamService.pushEvent({
      type: 'patient:update',
      data: updatedPatient,
    });

    const hasRemainingTests = updatedHistory.some(
      (entry) =>
        !entry.is_done &&
        entry.reffered_by_id === completedEntry.reffered_by_id,
    );

    if (hasRemainingTests) {
      return;
    }

    const doctor = await this.matcherService.getDoctorByUsername(
      completedEntry.reffered_by_id,
    );
    const specialties = doctor
      ? parseDoctorSpecialties(doctor.specialties)
      : [];
    const queueEntry: QueueRecordI = {
      timestamp: new Date(),
      triage_state: completedEntry.triage_state,
      specialty: specialties[0] ?? completedEntry.specialty,
      reffered_by_id: completedEntry.reffered_by_id,
    };

    await client.zAdd(getPatientQueueKey(payload.patient), [
      {
        score: getTriagePriority(queueEntry.triage_state),
        value: serializeQueueRecord(queueEntry),
      },
    ]);

    await this.matcherService.matchPatientsToDoctor();

    const queue = await readPatientQueue(client, payload.patient);

    this.streamService.pushEvent({
      type: 'patient:update',
      data: buildQueueSnapshotEvent(payload.patient, queue),
    });
  }

  private async getPatientDetailsOrThrow(
    patientId: string,
  ): Promise<PatientDetailsResponseI> {
    try {
      return await this.patientService.getPatientDetails(patientId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw error;
    }
  }
}
